// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SkillPay} from "../src/SkillPay.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SkillPayTest is Test {
    SkillPay internal sp;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal tutor = makeAddr("tutor");
    address internal student = makeAddr("student");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant ONE_USDC = 1e6;
    uint16 internal constant FEE = 1_000; // 10%

    event Enrolled(
        uint256 indexed courseId,
        address indexed student,
        address indexed tutor,
        uint256 price,
        uint256 fee,
        uint256 tutorAmount
    );

    function setUp() public {
        usdc = new MockUSDC();
        sp = new SkillPay(IERC20(address(usdc)), treasury, owner, FEE);
        usdc.mint(student, 1_000 * ONE_USDC);
        vm.prank(student);
        usdc.approve(address(sp), type(uint256).max);
    }

    // ───────────── helpers ─────────────

    function _registerTutor(address who) internal {
        vm.prank(who);
        sp.registerTutor("https://api.skillpay.app/meta/tutor/1");
    }

    function _createCourse(uint96 price) internal returns (uint256 id) {
        _registerTutor(tutor);
        vm.prank(tutor);
        id = sp.createCourse(price, "https://api.skillpay.app/meta/course/1");
    }

    // ───────────── constructor ─────────────

    function test_Constructor() public view {
        assertEq(address(sp.usdc()), address(usdc));
        assertEq(sp.treasury(), treasury);
        assertEq(sp.owner(), owner);
        assertEq(sp.feeBps(), FEE);
    }

    function test_Constructor_RevertsOnZeroAddresses() public {
        vm.expectRevert(SkillPay.ZeroAddress.selector);
        new SkillPay(IERC20(address(0)), treasury, owner, FEE);
        vm.expectRevert(SkillPay.ZeroAddress.selector);
        new SkillPay(IERC20(address(usdc)), address(0), owner, FEE);
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(SkillPay.FeeTooHigh.selector);
        new SkillPay(IERC20(address(usdc)), treasury, owner, 2_001);
    }

    // ───────────── tutors ─────────────

    function test_RegisterTutor() public {
        _registerTutor(tutor);
        SkillPay.Tutor memory t = sp.getTutor(tutor);
        assertTrue(t.registered);
        assertFalse(t.suspended);
        assertEq(sp.tutorCount(), 1);
    }

    function test_RegisterTutor_RevertsTwice() public {
        _registerTutor(tutor);
        vm.expectRevert(SkillPay.AlreadyRegistered.selector);
        _registerTutor(tutor);
    }

    function test_RegisterTutor_RevertsOnLongUri() public {
        string memory longUri = string(new bytes(513));
        vm.prank(tutor);
        vm.expectRevert(SkillPay.UriTooLong.selector);
        sp.registerTutor(longUri);
    }

    function test_UpdateTutorProfile() public {
        _registerTutor(tutor);
        vm.prank(tutor);
        sp.updateTutorProfile("ipfs://new");
        assertEq(sp.getTutor(tutor).profileURI, "ipfs://new");
    }

    function test_UpdateTutorProfile_RevertsIfNotTutor() public {
        vm.prank(stranger);
        vm.expectRevert(SkillPay.NotRegisteredTutor.selector);
        sp.updateTutorProfile("ipfs://x");
    }

    // ───────────── courses ─────────────

    function test_CreateCourse() public {
        uint256 id = _createCourse(ONE_USDC);
        assertEq(id, 1);
        SkillPay.Course memory c = sp.getCourse(id);
        assertEq(c.tutor, tutor);
        assertEq(c.price, ONE_USDC);
        assertTrue(c.active);
        assertEq(sp.getTutor(tutor).courseCount, 1);
    }

    function test_CreateCourse_RevertsIfNotTutor() public {
        vm.prank(stranger);
        vm.expectRevert(SkillPay.NotRegisteredTutor.selector);
        sp.createCourse(ONE_USDC, "x");
    }

    function test_CreateCourse_RevertsOnBadPrice() public {
        _registerTutor(tutor);
        vm.startPrank(tutor);
        vm.expectRevert(SkillPay.InvalidPrice.selector);
        sp.createCourse(9_999, "x");
        vm.expectRevert(SkillPay.InvalidPrice.selector);
        sp.createCourse(10_000 * 1e6 + 1, "x");
        vm.stopPrank();
    }

    function test_UpdateCourse() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(tutor);
        sp.updateCourse(id, 2 * ONE_USDC, false, "ipfs://v2");
        SkillPay.Course memory c = sp.getCourse(id);
        assertEq(c.price, 2 * ONE_USDC);
        assertFalse(c.active);
        assertEq(c.metadataURI, "ipfs://v2");
    }

    function test_UpdateCourse_RevertsIfNotOwnerTutor() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(stranger);
        vm.expectRevert(SkillPay.NotCourseTutor.selector);
        sp.updateCourse(id, ONE_USDC, true, "x");
    }

    function test_GetCourse_RevertsIfMissing() public {
        vm.expectRevert(SkillPay.CourseNotFound.selector);
        sp.getCourse(42);
    }

    // ───────────── enrollment ─────────────

    function test_Enroll_SplitsPayment() public {
        uint256 id = _createCourse(ONE_USDC);
        uint256 before = usdc.balanceOf(student);

        vm.expectEmit(true, true, true, true);
        emit Enrolled(id, student, tutor, ONE_USDC, 100_000, 900_000);
        vm.prank(student);
        sp.enroll(id, ONE_USDC);

        assertEq(usdc.balanceOf(student), before - ONE_USDC);
        assertEq(usdc.balanceOf(treasury), 100_000);
        assertEq(usdc.balanceOf(tutor), 900_000);
        assertEq(usdc.balanceOf(address(sp)), 0, "contract must never hold funds");
        assertTrue(sp.isEnrolled(id, student));
        assertEq(sp.getCourse(id).enrollments, 1);
        assertEq(sp.getTutor(tutor).totalStudents, 1);
        assertEq(sp.getTutor(tutor).totalEarned, 900_000);
        assertEq(sp.totalVolume(), ONE_USDC);
        assertEq(sp.totalEnrollments(), 1);
    }

    function test_Enroll_RevertsTwice() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.startPrank(student);
        sp.enroll(id, ONE_USDC);
        vm.expectRevert(SkillPay.AlreadyEnrolled.selector);
        sp.enroll(id, ONE_USDC);
        vm.stopPrank();
    }

    function test_Enroll_RevertsIfInactive() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(tutor);
        sp.updateCourse(id, ONE_USDC, false, "x");
        vm.prank(student);
        vm.expectRevert(SkillPay.CourseInactive.selector);
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_RevertsIfMissing() public {
        vm.prank(student);
        vm.expectRevert(SkillPay.CourseNotFound.selector);
        sp.enroll(7, ONE_USDC);
    }

    function test_Enroll_RevertsInOwnCourse() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(tutor);
        vm.expectRevert(SkillPay.CannotEnrollInOwnCourse.selector);
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_RevertsIfPriceRaised() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(tutor);
        sp.updateCourse(id, 5 * ONE_USDC, true, "x");
        vm.prank(student);
        vm.expectRevert(abi.encodeWithSelector(SkillPay.PriceChanged.selector, 5 * ONE_USDC, ONE_USDC));
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_RevertsWithoutApproval() public {
        uint256 id = _createCourse(ONE_USDC);
        usdc.mint(stranger, ONE_USDC);
        vm.prank(stranger);
        vm.expectRevert();
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_RevertsIfTutorSuspended() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(owner);
        sp.setTutorSuspended(tutor, true);
        vm.prank(student);
        vm.expectRevert(SkillPay.TutorIsSuspended.selector);
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_RevertsWhenPaused() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(owner);
        sp.pause();
        vm.prank(student);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        sp.enroll(id, ONE_USDC);
    }

    function test_Enroll_ZeroFee() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(owner);
        sp.setFeeBps(0);
        vm.prank(student);
        sp.enroll(id, ONE_USDC);
        assertEq(usdc.balanceOf(tutor), ONE_USDC);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function testFuzz_Enroll_SplitIsExact(uint96 price, uint16 feeBps) public {
        price = uint96(bound(price, sp.MIN_PRICE(), sp.MAX_PRICE()));
        feeBps = uint16(bound(feeBps, 0, sp.MAX_FEE_BPS()));
        vm.prank(owner);
        sp.setFeeBps(feeBps);
        uint256 id = _createCourse(price);
        usdc.mint(student, price);

        (uint256 qPrice, uint256 qFee, uint256 qTutor) = sp.quote(id);
        vm.prank(student);
        sp.enroll(id, price);

        assertEq(qPrice, price);
        assertEq(usdc.balanceOf(treasury), qFee);
        assertEq(usdc.balanceOf(tutor), qTutor);
        assertEq(qFee + qTutor, price);
        assertEq(usdc.balanceOf(address(sp)), 0);
    }

    // ───────────── admin ─────────────

    function test_Admin_OnlyOwner() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sp.setFeeBps(500);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sp.setTreasury(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sp.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sp.setCourseActive(1, false);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sp.rescueTokens(IERC20(address(usdc)), stranger, 1);
        vm.stopPrank();
    }

    function test_SetFeeBps_RevertsAboveCap() public {
        vm.prank(owner);
        vm.expectRevert(SkillPay.FeeTooHigh.selector);
        sp.setFeeBps(2_001);
    }

    function test_SetTreasury() public {
        vm.prank(owner);
        sp.setTreasury(stranger);
        assertEq(sp.treasury(), stranger);
        vm.prank(owner);
        vm.expectRevert(SkillPay.ZeroAddress.selector);
        sp.setTreasury(address(0));
    }

    function test_SetCourseActive_Moderation() public {
        uint256 id = _createCourse(ONE_USDC);
        vm.prank(owner);
        sp.setCourseActive(id, false);
        assertFalse(sp.getCourse(id).active);
    }

    function test_SuspendedTutorCannotCreateCourse() public {
        _registerTutor(tutor);
        vm.prank(owner);
        sp.setTutorSuspended(tutor, true);
        vm.prank(tutor);
        vm.expectRevert(SkillPay.TutorIsSuspended.selector);
        sp.createCourse(ONE_USDC, "x");
    }

    function test_RescueTokens() public {
        usdc.mint(address(sp), 5 * ONE_USDC);
        vm.prank(owner);
        sp.rescueTokens(IERC20(address(usdc)), treasury, 5 * ONE_USDC);
        assertEq(usdc.balanceOf(treasury), 5 * ONE_USDC);
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        sp.transferOwnership(stranger);
        assertEq(sp.owner(), owner);
        vm.prank(stranger);
        sp.acceptOwnership();
        assertEq(sp.owner(), stranger);
    }
}
