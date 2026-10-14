// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SkillPay
/// @notice A non-custodial tutoring marketplace on Arc. Tutors list courses priced in USDC;
///         when a student enrolls, the payment is split in the same transaction:
///         the platform fee goes to the treasury and the rest goes straight to the tutor.
///         The contract never holds user funds.
contract SkillPay is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── Types ───────────────────────────────

    struct Tutor {
        bool registered;
        bool suspended;
        uint64 registeredAt;
        uint32 courseCount;
        uint32 totalStudents;
        uint128 totalEarned; // in USDC base units (6 decimals)
        string profileURI; // off-chain profile metadata (IPFS / HTTPS JSON)
    }

    struct Course {
        address tutor;
        uint96 price; // USDC base units (6 decimals)
        bool active;
        uint32 enrollments;
        uint64 createdAt;
        string metadataURI; // off-chain course metadata (title, description, syllabus)
    }

    // ───────────────────────────── Constants ─────────────────────────────

    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Hard cap on the platform fee: 20%. The owner can never set it higher.
    uint16 public constant MAX_FEE_BPS = 2_000;
    /// @notice Minimum course price: 0.01 USDC.
    uint96 public constant MIN_PRICE = 10_000;
    /// @notice Maximum course price: 10,000 USDC (guards against typos with 6-decimal maths).
    uint96 public constant MAX_PRICE = 10_000 * 1e6;
    uint256 public constant MAX_URI_LENGTH = 512;

    // ─────────────────────────────── State ───────────────────────────────

    IERC20 public immutable usdc;
    address public treasury;
    uint16 public feeBps;

    uint256 public courseCount;
    uint256 public tutorCount;
    uint256 public totalVolume;
    uint256 public totalEnrollments;

    mapping(address => Tutor) private _tutors;
    mapping(uint256 => Course) private _courses;
    mapping(uint256 => mapping(address => bool)) public isEnrolled;

    // ─────────────────────────────── Events ──────────────────────────────

    event TutorRegistered(address indexed tutor, string profileURI);
    event TutorProfileUpdated(address indexed tutor, string profileURI);
    event TutorSuspended(address indexed tutor, bool suspended);
    event CourseCreated(uint256 indexed courseId, address indexed tutor, uint96 price, string metadataURI);
    event CourseUpdated(uint256 indexed courseId, uint96 price, bool active, string metadataURI);
    event Enrolled(
        uint256 indexed courseId,
        address indexed student,
        address indexed tutor,
        uint256 price,
        uint256 fee,
        uint256 tutorAmount
    );
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────── Errors ──────────────────────────────

    error ZeroAddress();
    error FeeTooHigh();
    error AlreadyRegistered();
    error NotRegisteredTutor();
    error TutorIsSuspended();
    error InvalidPrice();
    error UriTooLong();
    error CourseNotFound();
    error CourseInactive();
    error NotCourseTutor();
    error AlreadyEnrolled();
    error CannotEnrollInOwnCourse();
    error PriceChanged(uint96 currentPrice, uint96 maxPrice);

    // ───────────────────────────── Constructor ───────────────────────────

    constructor(IERC20 usdc_, address treasury_, address owner_, uint16 feeBps_) Ownable(owner_) {
        if (address(usdc_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        usdc = usdc_;
        treasury = treasury_;
        feeBps = feeBps_;
        emit TreasuryUpdated(address(0), treasury_);
        emit FeeUpdated(0, feeBps_);
    }

    // ─────────────────────────────── Tutors ──────────────────────────────

    /// @notice Register as a tutor. Free, so anyone can start teaching.
    function registerTutor(string calldata profileURI) external whenNotPaused {
        Tutor storage t = _tutors[msg.sender];
        if (t.registered) revert AlreadyRegistered();
        _checkUri(profileURI);
        t.registered = true;
        t.registeredAt = uint64(block.timestamp);
        t.profileURI = profileURI;
        unchecked {
            ++tutorCount;
        }
        emit TutorRegistered(msg.sender, profileURI);
    }

    function updateTutorProfile(string calldata profileURI) external {
        Tutor storage t = _tutors[msg.sender];
        if (!t.registered) revert NotRegisteredTutor();
        _checkUri(profileURI);
        t.profileURI = profileURI;
        emit TutorProfileUpdated(msg.sender, profileURI);
    }

    // ─────────────────────────────── Courses ─────────────────────────────

    function createCourse(uint96 price, string calldata metadataURI)
        external
        whenNotPaused
        returns (uint256 courseId)
    {
        Tutor storage t = _tutors[msg.sender];
        if (!t.registered) revert NotRegisteredTutor();
        if (t.suspended) revert TutorIsSuspended();
        _checkPrice(price);
        _checkUri(metadataURI);

        courseId = ++courseCount; // ids start at 1
        _courses[courseId] = Course({
            tutor: msg.sender,
            price: price,
            active: true,
            enrollments: 0,
            createdAt: uint64(block.timestamp),
            metadataURI: metadataURI
        });
        unchecked {
            ++t.courseCount;
        }
        emit CourseCreated(courseId, msg.sender, price, metadataURI);
    }

    /// @notice Tutors can change price, visibility and metadata of their own course.
    function updateCourse(uint256 courseId, uint96 price, bool active, string calldata metadataURI) external {
        Course storage c = _existingCourse(courseId);
        if (c.tutor != msg.sender) revert NotCourseTutor();
        _checkPrice(price);
        _checkUri(metadataURI);
        c.price = price;
        c.active = active;
        c.metadataURI = metadataURI;
        emit CourseUpdated(courseId, price, active, metadataURI);
    }

    // ───────────────────────────── Enrollment ────────────────────────────

    /// @notice Pay for and enroll in a course. Requires prior USDC approval of at least the price.
    /// @param maxPrice The price the student agreed to; protects against the tutor raising the
    ///                 price between the student's approval and this transaction.
    function enroll(uint256 courseId, uint96 maxPrice) external whenNotPaused nonReentrant {
        Course storage c = _existingCourse(courseId);
        if (!c.active) revert CourseInactive();
        address tutor = c.tutor;
        if (_tutors[tutor].suspended) revert TutorIsSuspended();
        if (tutor == msg.sender) revert CannotEnrollInOwnCourse();
        if (isEnrolled[courseId][msg.sender]) revert AlreadyEnrolled();
        uint96 price = c.price;
        if (price > maxPrice) revert PriceChanged(price, maxPrice);

        (uint256 fee, uint256 tutorAmount) = _split(price);

        // Effects
        isEnrolled[courseId][msg.sender] = true;
        unchecked {
            ++c.enrollments;
            Tutor storage t = _tutors[tutor];
            ++t.totalStudents;
            // tutorAmount <= MAX_PRICE (1e10), so the cast cannot truncate.
            // forge-lint: disable-next-line(unsafe-typecast)
            t.totalEarned += uint128(tutorAmount);
            totalVolume += price;
            ++totalEnrollments;
        }

        // Interactions: funds move directly from student to treasury and tutor.
        if (fee > 0) usdc.safeTransferFrom(msg.sender, treasury, fee);
        usdc.safeTransferFrom(msg.sender, tutor, tutorAmount);

        emit Enrolled(courseId, msg.sender, tutor, price, fee, tutorAmount);
    }

    // ─────────────────────────────── Views ───────────────────────────────

    function getCourse(uint256 courseId) external view returns (Course memory) {
        return _existingCourseView(courseId);
    }

    function getTutor(address tutor) external view returns (Tutor memory) {
        return _tutors[tutor];
    }

    /// @notice Price breakdown for a course at the current fee.
    function quote(uint256 courseId) external view returns (uint256 price, uint256 fee, uint256 tutorAmount) {
        price = _existingCourseView(courseId).price;
        (fee, tutorAmount) = _split(price);
    }

    // ─────────────────────────────── Admin ───────────────────────────────

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Moderation: suspended tutors cannot create courses or receive new enrollments.
    function setTutorSuspended(address tutor, bool suspended) external onlyOwner {
        if (!_tutors[tutor].registered) revert NotRegisteredTutor();
        _tutors[tutor].suspended = suspended;
        emit TutorSuspended(tutor, suspended);
    }

    /// @notice Moderation: hide a course that breaks the platform rules.
    function setCourseActive(uint256 courseId, bool active) external onlyOwner {
        Course storage c = _existingCourse(courseId);
        c.active = active;
        emit CourseUpdated(courseId, c.price, active, c.metadataURI);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens sent to this contract by mistake. The contract holds no user funds.
    function rescueTokens(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit TokensRescued(address(token), to, amount);
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _split(uint256 price) internal view returns (uint256 fee, uint256 tutorAmount) {
        fee = (price * feeBps) / BPS_DENOMINATOR;
        tutorAmount = price - fee;
    }

    function _existingCourse(uint256 courseId) internal view returns (Course storage c) {
        c = _courses[courseId];
        if (c.tutor == address(0)) revert CourseNotFound();
    }

    function _existingCourseView(uint256 courseId) internal view returns (Course memory c) {
        c = _courses[courseId];
        if (c.tutor == address(0)) revert CourseNotFound();
    }

    function _checkPrice(uint96 price) internal pure {
        if (price < MIN_PRICE || price > MAX_PRICE) revert InvalidPrice();
    }

    function _checkUri(string calldata uri) internal pure {
        if (bytes(uri).length > MAX_URI_LENGTH) revert UriTooLong();
    }
}
