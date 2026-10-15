// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SkillPayEscrow
/// @notice USDC escrow for services on Arc. A client locks payment for a job; the provider delivers;
///         a verifier agent (an Arc Agent Stack wallet) checks the delivery against the agreed spec and
///         either releases the funds or rejects the delivery. The client can always approve directly,
///         deadlines and review windows stop funds getting stuck, and a human arbiter settles disputes.
/// @dev    The verifier can only release to the provider or mark a delivery rejected. It can never send
///         funds anywhere else. Pausing only stops new orders: every exit path keeps working.
contract SkillPayEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── Types ───────────────────────────────

    enum Status {
        None,
        Funded, // client paid, waiting for the provider to accept
        Accepted, // provider committed to the job
        Delivered, // provider submitted work, waiting for review
        Rejected, // verifier found the work does not meet the spec
        Disputed, // waiting for the arbiter
        Released, // provider paid
        Refunded, // client refunded after the deadline
        Cancelled, // cancelled before acceptance, client refunded
        Resolved // arbiter split the funds
    }

    struct Order {
        address client;
        uint64 deadline; // provider must deliver by this time
        uint8 deliveries; // number of submissions so far
        Status status;
        address provider;
        uint64 reviewEnds; // after this, an unreviewed delivery can be claimed by the provider
        uint16 feeBps; // fee snapshot at creation
        address verifier; // verifier snapshot at creation
        uint128 amount; // USDC base units (6 decimals)
        uint64 createdAt;
        bytes32 specHash; // keccak256 of the off-chain spec the client and provider agreed on
        bytes32 deliveryHash; // keccak256 of the latest off-chain delivery record
    }

    // ───────────────────────────── Constants ─────────────────────────────

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 2_000; // 20% hard cap
    uint128 public constant MIN_AMOUNT = 100_000; // 0.10 USDC
    uint128 public constant MAX_AMOUNT = 1_000_000 * 1e6; // 1,000,000 USDC
    uint8 public constant MAX_DELIVERIES = 3; // first try + two revisions
    uint64 public constant MIN_DEADLINE = 1 hours;
    uint64 public constant MAX_DEADLINE = 365 days;
    uint64 public constant MIN_REVIEW = 1 hours;
    uint64 public constant MAX_REVIEW = 30 days;

    // ─────────────────────────────── State ───────────────────────────────

    IERC20 public immutable usdc;
    address public treasury;
    address public verifier;
    address public arbiter;
    uint16 public feeBps;
    uint64 public reviewPeriod;

    uint256 public orderCount;
    /// @notice USDC currently held for open orders. rescueTokens can never touch it.
    uint256 public totalLocked;
    mapping(uint256 => Order) private _orders;

    // ─────────────────────────────── Events ──────────────────────────────

    event OrderCreated(
        uint256 indexed orderId,
        address indexed client,
        address indexed provider,
        uint256 amount,
        uint64 deadline,
        bytes32 specHash,
        address verifier
    );
    event OrderAccepted(uint256 indexed orderId);
    event OrderCancelled(uint256 indexed orderId, address indexed by);
    event DeliverySubmitted(uint256 indexed orderId, uint8 delivery, bytes32 deliveryHash, uint64 reviewEnds);
    event DeliveryVerified(uint256 indexed orderId, address indexed verifier, bool approved, bytes32 reasonHash);
    event OrderReleased(uint256 indexed orderId, address indexed provider, uint256 providerAmount, uint256 fee, address by);
    event OrderRefunded(uint256 indexed orderId, address indexed client, uint256 amount);
    event OrderDisputed(uint256 indexed orderId, address indexed by);
    event DisputeResolved(uint256 indexed orderId, uint16 providerShareBps, uint256 providerAmount, uint256 fee, uint256 clientAmount);
    event VerifierUpdated(address oldVerifier, address newVerifier);
    event ArbiterUpdated(address oldArbiter, address newArbiter);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event ReviewPeriodUpdated(uint64 oldPeriod, uint64 newPeriod);

    // ─────────────────────────────── Errors ──────────────────────────────

    error ZeroAddress();
    error FeeTooHigh();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidReviewPeriod();
    error InvalidProvider();
    error InvalidShare();
    error OrderNotFound();
    error WrongStatus(Status current);
    error NotClient();
    error NotProvider();
    error NotVerifier();
    error NotArbiter();
    error NotParty();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ReviewNotOver();
    error TooManyDeliveries();
    error EmptyHash();
    error LockedFunds();

    // ───────────────────────────── Constructor ───────────────────────────

    constructor(
        IERC20 usdc_,
        address treasury_,
        address owner_,
        address verifier_,
        address arbiter_,
        uint16 feeBps_,
        uint64 reviewPeriod_
    ) Ownable(owner_) {
        if (
            address(usdc_) == address(0) || treasury_ == address(0) || verifier_ == address(0)
                || arbiter_ == address(0)
        ) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (reviewPeriod_ < MIN_REVIEW || reviewPeriod_ > MAX_REVIEW) revert InvalidReviewPeriod();
        usdc = usdc_;
        treasury = treasury_;
        verifier = verifier_;
        arbiter = arbiter_;
        feeBps = feeBps_;
        reviewPeriod = reviewPeriod_;
        emit TreasuryUpdated(address(0), treasury_);
        emit VerifierUpdated(address(0), verifier_);
        emit ArbiterUpdated(address(0), arbiter_);
        emit FeeUpdated(0, feeBps_);
        emit ReviewPeriodUpdated(0, reviewPeriod_);
    }

    // ───────────────────────────── Client flow ───────────────────────────

    /// @notice Lock USDC for a job. Requires prior USDC approval of `amount`.
    /// @param deadline Unix time by which the provider must deliver.
    /// @param specHash keccak256 of the agreed spec, stored off-chain.
    function createOrder(address provider, uint128 amount, uint64 deadline, bytes32 specHash)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 orderId)
    {
        if (provider == address(0) || provider == msg.sender) revert InvalidProvider();
        if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) revert InvalidAmount();
        if (deadline < block.timestamp + MIN_DEADLINE || deadline > block.timestamp + MAX_DEADLINE) {
            revert InvalidDeadline();
        }
        if (specHash == bytes32(0)) revert EmptyHash();

        orderId = ++orderCount;
        _orders[orderId] = Order({
            client: msg.sender,
            deadline: deadline,
            deliveries: 0,
            status: Status.Funded,
            provider: provider,
            reviewEnds: 0,
            feeBps: feeBps,
            verifier: verifier,
            amount: amount,
            createdAt: uint64(block.timestamp),
            specHash: specHash,
            deliveryHash: bytes32(0)
        });
        totalLocked += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit OrderCreated(orderId, msg.sender, provider, amount, deadline, specHash, verifier);
    }

    /// @notice Client cancels before the provider accepts. Full refund.
    function cancel(uint256 orderId) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.client) revert NotClient();
        _requireStatus(o, Status.Funded);
        o.status = Status.Cancelled;
        emit OrderCancelled(orderId, msg.sender);
        _pay(o.client, o.amount, o.amount);
    }

    /// @notice Client pays the provider directly, whatever the verifier said.
    function approve(uint256 orderId) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.client) revert NotClient();
        if (o.status != Status.Delivered && o.status != Status.Rejected) revert WrongStatus(o.status);
        _release(orderId, o);
    }

    /// @notice Client takes the money back when the provider never delivered an accepted piece of work.
    function refundExpired(uint256 orderId) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.client) revert NotClient();
        if (o.status != Status.Funded && o.status != Status.Accepted && o.status != Status.Rejected) {
            revert WrongStatus(o.status);
        }
        if (block.timestamp <= o.deadline) revert DeadlineNotPassed();
        o.status = Status.Refunded;
        emit OrderRefunded(orderId, o.client, o.amount);
        _pay(o.client, o.amount, o.amount);
    }

    // ──────────────────────────── Provider flow ──────────────────────────

    function accept(uint256 orderId) external {
        Order storage o = _existing(orderId);
        if (msg.sender != o.provider) revert NotProvider();
        _requireStatus(o, Status.Funded);
        if (block.timestamp > o.deadline) revert DeadlinePassed();
        o.status = Status.Accepted;
        emit OrderAccepted(orderId);
    }

    /// @notice Provider turns the job down. Full refund to the client.
    function decline(uint256 orderId) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.provider) revert NotProvider();
        _requireStatus(o, Status.Funded);
        o.status = Status.Cancelled;
        emit OrderCancelled(orderId, msg.sender);
        _pay(o.client, o.amount, o.amount);
    }

    /// @notice Submit work (or a revision after a rejection) before the deadline.
    function submitDelivery(uint256 orderId, bytes32 deliveryHash) external {
        Order storage o = _existing(orderId);
        if (msg.sender != o.provider) revert NotProvider();
        if (o.status != Status.Accepted && o.status != Status.Rejected) revert WrongStatus(o.status);
        if (block.timestamp > o.deadline) revert DeadlinePassed();
        if (o.deliveries >= MAX_DELIVERIES) revert TooManyDeliveries();
        if (deliveryHash == bytes32(0)) revert EmptyHash();

        unchecked {
            ++o.deliveries;
        }
        o.deliveryHash = deliveryHash;
        o.status = Status.Delivered;
        o.reviewEnds = uint64(block.timestamp) + reviewPeriod;
        emit DeliverySubmitted(orderId, o.deliveries, deliveryHash, o.reviewEnds);
    }

    /// @notice If nobody reviews a delivery within the review window, the provider can claim payment.
    function claimAfterReview(uint256 orderId) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.provider) revert NotProvider();
        _requireStatus(o, Status.Delivered);
        if (block.timestamp <= o.reviewEnds) revert ReviewNotOver();
        _release(orderId, o);
    }

    // ──────────────────────────── Verifier agent ─────────────────────────

    /// @notice The verifier agent records its decision on the latest delivery.
    /// @param reasonHash keccak256 of the agent's written report, stored off-chain.
    function verify(uint256 orderId, bool approved, bytes32 reasonHash) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != o.verifier) revert NotVerifier();
        _requireStatus(o, Status.Delivered);
        if (reasonHash == bytes32(0)) revert EmptyHash();
        emit DeliveryVerified(orderId, msg.sender, approved, reasonHash);
        if (approved) {
            _release(orderId, o);
        } else {
            o.status = Status.Rejected;
        }
    }

    // ─────────────────────────────── Disputes ────────────────────────────

    /// @notice Either party freezes a delivered or rejected order for the human arbiter.
    function dispute(uint256 orderId) external {
        Order storage o = _existing(orderId);
        if (msg.sender != o.client && msg.sender != o.provider) revert NotParty();
        if (o.status != Status.Delivered && o.status != Status.Rejected) revert WrongStatus(o.status);
        o.status = Status.Disputed;
        emit OrderDisputed(orderId, msg.sender);
    }

    /// @notice Arbiter splits a disputed order. The platform fee applies only to the provider's share.
    function resolve(uint256 orderId, uint16 providerShareBps) external nonReentrant {
        Order storage o = _existing(orderId);
        if (msg.sender != arbiter) revert NotArbiter();
        _requireStatus(o, Status.Disputed);
        if (providerShareBps > BPS) revert InvalidShare();

        uint256 amount = o.amount;
        uint256 providerGross = (amount * providerShareBps) / BPS;
        uint256 fee = (providerGross * o.feeBps) / BPS;
        uint256 providerNet = providerGross - fee;
        uint256 clientAmount = amount - providerGross;

        o.status = Status.Resolved;
        totalLocked -= amount;
        emit DisputeResolved(orderId, providerShareBps, providerNet, fee, clientAmount);

        if (providerNet > 0) usdc.safeTransfer(o.provider, providerNet);
        if (fee > 0) usdc.safeTransfer(treasury, fee);
        if (clientAmount > 0) usdc.safeTransfer(o.client, clientAmount);
    }

    // ─────────────────────────────── Views ───────────────────────────────

    function getOrder(uint256 orderId) external view returns (Order memory) {
        Order memory o = _orders[orderId];
        if (o.status == Status.None) revert OrderNotFound();
        return o;
    }

    /// @notice What the provider and the treasury would receive if the order were released now.
    function payout(uint256 orderId) external view returns (uint256 providerAmount, uint256 fee) {
        Order memory o = _orders[orderId];
        if (o.status == Status.None) revert OrderNotFound();
        fee = (uint256(o.amount) * o.feeBps) / BPS;
        providerAmount = o.amount - fee;
    }

    // ─────────────────────────────── Admin ───────────────────────────────

    /// @notice New orders use the new verifier; existing orders keep the one they were created with.
    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert ZeroAddress();
        emit VerifierUpdated(verifier, newVerifier);
        verifier = newVerifier;
    }

    function setArbiter(address newArbiter) external onlyOwner {
        if (newArbiter == address(0)) revert ZeroAddress();
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Only affects new orders; each order keeps the fee it was created with.
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setReviewPeriod(uint64 newPeriod) external onlyOwner {
        if (newPeriod < MIN_REVIEW || newPeriod > MAX_REVIEW) revert InvalidReviewPeriod();
        emit ReviewPeriodUpdated(reviewPeriod, newPeriod);
        reviewPeriod = newPeriod;
    }

    /// @notice Stops new orders only. Refunds, releases and disputes keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens sent here by mistake. Can never touch USDC locked for orders.
    function rescueTokens(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (address(token) == address(usdc) && usdc.balanceOf(address(this)) - amount < totalLocked) {
            revert LockedFunds();
        }
        token.safeTransfer(to, amount);
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _release(uint256 orderId, Order storage o) internal {
        uint256 amount = o.amount;
        uint256 fee = (amount * o.feeBps) / BPS;
        uint256 providerAmount = amount - fee;
        o.status = Status.Released;
        totalLocked -= amount;
        emit OrderReleased(orderId, o.provider, providerAmount, fee, msg.sender);
        if (fee > 0) usdc.safeTransfer(treasury, fee);
        usdc.safeTransfer(o.provider, providerAmount);
    }

    function _pay(address to, uint256 amount, uint256 unlock) internal {
        totalLocked -= unlock;
        usdc.safeTransfer(to, amount);
    }

    function _existing(uint256 orderId) internal view returns (Order storage o) {
        o = _orders[orderId];
        if (o.status == Status.None) revert OrderNotFound();
    }

    function _requireStatus(Order storage o, Status expected) internal view {
        if (o.status != expected) revert WrongStatus(o.status);
    }
}
