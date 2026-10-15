// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SkillPayEscrow} from "../src/SkillPayEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract SkillPayEscrowTest is Test {
    SkillPayEscrow internal esc;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal agent = makeAddr("agent");
    address internal arbiter = makeAddr("arbiter");
    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal stranger = makeAddr("stranger");

    uint128 internal constant AMOUNT = 100e6; // 100 USDC
    uint16 internal constant FEE = 1_000; // 10%
    uint64 internal constant REVIEW = 3 days;
    bytes32 internal constant SPEC = keccak256("spec");
    bytes32 internal constant DELIVERY = keccak256("delivery");
    bytes32 internal constant REASON = keccak256("reason");

    function setUp() public {
        usdc = new MockUSDC();
        esc = new SkillPayEscrow(IERC20(address(usdc)), treasury, owner, agent, arbiter, FEE, REVIEW);
        usdc.mint(client, 10_000e6);
        vm.prank(client);
        usdc.approve(address(esc), type(uint256).max);
    }

    // ───────────── helpers ─────────────

    function _create() internal returns (uint256 id) {
        vm.prank(client);
        id = esc.createOrder(provider, AMOUNT, uint64(block.timestamp + 7 days), SPEC);
    }

    function _accepted() internal returns (uint256 id) {
        id = _create();
        vm.prank(provider);
        esc.accept(id);
    }

    function _delivered() internal returns (uint256 id) {
        id = _accepted();
        vm.prank(provider);
        esc.submitDelivery(id, DELIVERY);
    }

    function _status(uint256 id) internal view returns (SkillPayEscrow.Status) {
        return esc.getOrder(id).status;
    }

    function _assertReleased(uint256 id) internal view {
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Released));
        assertEq(usdc.balanceOf(provider), 90e6);
        assertEq(usdc.balanceOf(treasury), 10e6);
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(esc.totalLocked(), 0);
    }

    // ───────────── constructor ─────────────

    function test_Constructor() public view {
        assertEq(address(esc.usdc()), address(usdc));
        assertEq(esc.treasury(), treasury);
        assertEq(esc.verifier(), agent);
        assertEq(esc.arbiter(), arbiter);
        assertEq(esc.owner(), owner);
        assertEq(esc.feeBps(), FEE);
        assertEq(esc.reviewPeriod(), REVIEW);
    }

    function test_Constructor_Reverts() public {
        vm.expectRevert(SkillPayEscrow.ZeroAddress.selector);
        new SkillPayEscrow(IERC20(address(usdc)), treasury, owner, address(0), arbiter, FEE, REVIEW);
        vm.expectRevert(SkillPayEscrow.FeeTooHigh.selector);
        new SkillPayEscrow(IERC20(address(usdc)), treasury, owner, agent, arbiter, 2_001, REVIEW);
        vm.expectRevert(SkillPayEscrow.InvalidReviewPeriod.selector);
        new SkillPayEscrow(IERC20(address(usdc)), treasury, owner, agent, arbiter, FEE, 10 minutes);
    }

    // ───────────── create / cancel / decline ─────────────

    function test_CreateOrder_LocksFunds() public {
        uint256 id = _create();
        SkillPayEscrow.Order memory o = esc.getOrder(id);
        assertEq(id, 1);
        assertEq(o.client, client);
        assertEq(o.provider, provider);
        assertEq(o.amount, AMOUNT);
        assertEq(o.verifier, agent);
        assertEq(o.feeBps, FEE);
        assertEq(o.specHash, SPEC);
        assertEq(uint8(o.status), uint8(SkillPayEscrow.Status.Funded));
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);
        assertEq(esc.totalLocked(), AMOUNT);
    }

    function test_CreateOrder_Validation() public {
        uint64 dl = uint64(block.timestamp + 7 days);
        vm.startPrank(client);
        vm.expectRevert(SkillPayEscrow.InvalidProvider.selector);
        esc.createOrder(client, AMOUNT, dl, SPEC);
        vm.expectRevert(SkillPayEscrow.InvalidProvider.selector);
        esc.createOrder(address(0), AMOUNT, dl, SPEC);
        vm.expectRevert(SkillPayEscrow.InvalidAmount.selector);
        esc.createOrder(provider, 99_999, dl, SPEC);
        vm.expectRevert(SkillPayEscrow.InvalidDeadline.selector);
        esc.createOrder(provider, AMOUNT, uint64(block.timestamp + 30 minutes), SPEC);
        vm.expectRevert(SkillPayEscrow.InvalidDeadline.selector);
        esc.createOrder(provider, AMOUNT, uint64(block.timestamp + 366 days), SPEC);
        vm.expectRevert(SkillPayEscrow.EmptyHash.selector);
        esc.createOrder(provider, AMOUNT, dl, bytes32(0));
        vm.stopPrank();
    }

    function test_CreateOrder_RevertsWhenPaused() public {
        vm.prank(owner);
        esc.pause();
        vm.prank(client);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        esc.createOrder(provider, AMOUNT, uint64(block.timestamp + 7 days), SPEC);
    }

    function test_Cancel_RefundsBeforeAcceptance() public {
        uint256 id = _create();
        vm.prank(client);
        esc.cancel(id);
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Cancelled));
        assertEq(usdc.balanceOf(client), 10_000e6);
        assertEq(esc.totalLocked(), 0);
    }

    function test_Cancel_RevertsAfterAcceptance() public {
        uint256 id = _accepted();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(SkillPayEscrow.WrongStatus.selector, SkillPayEscrow.Status.Accepted));
        esc.cancel(id);
    }

    function test_Decline_Refunds() public {
        uint256 id = _create();
        vm.prank(provider);
        esc.decline(id);
        assertEq(usdc.balanceOf(client), 10_000e6);
    }

    function test_OnlyPartiesCanAct() public {
        uint256 id = _create();
        vm.startPrank(stranger);
        vm.expectRevert(SkillPayEscrow.NotClient.selector);
        esc.cancel(id);
        vm.expectRevert(SkillPayEscrow.NotProvider.selector);
        esc.accept(id);
        vm.expectRevert(SkillPayEscrow.NotProvider.selector);
        esc.decline(id);
        vm.stopPrank();
    }

    // ───────────── delivery + agent verification ─────────────

    function test_Accept_RevertsAfterDeadline() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 8 days);
        vm.prank(provider);
        vm.expectRevert(SkillPayEscrow.DeadlinePassed.selector);
        esc.accept(id);
    }

    function test_SubmitDelivery() public {
        uint256 id = _delivered();
        SkillPayEscrow.Order memory o = esc.getOrder(id);
        assertEq(uint8(o.status), uint8(SkillPayEscrow.Status.Delivered));
        assertEq(o.deliveryHash, DELIVERY);
        assertEq(o.deliveries, 1);
        assertEq(o.reviewEnds, block.timestamp + REVIEW);
    }

    function test_SubmitDelivery_RequiresAcceptance() public {
        uint256 id = _create();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SkillPayEscrow.WrongStatus.selector, SkillPayEscrow.Status.Funded));
        esc.submitDelivery(id, DELIVERY);
    }

    function test_Verify_Approve_Releases() public {
        uint256 id = _delivered();
        vm.prank(agent);
        esc.verify(id, true, REASON);
        _assertReleased(id);
    }

    function test_Verify_Reject_ThenRevisionApproved() public {
        uint256 id = _delivered();
        vm.prank(agent);
        esc.verify(id, false, REASON);
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Rejected));
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);

        vm.prank(provider);
        esc.submitDelivery(id, keccak256("v2"));
        assertEq(esc.getOrder(id).deliveries, 2);
        vm.prank(agent);
        esc.verify(id, true, REASON);
        _assertReleased(id);
    }

    function test_Verify_OnlyOrderVerifier() public {
        uint256 id = _delivered();
        vm.prank(stranger);
        vm.expectRevert(SkillPayEscrow.NotVerifier.selector);
        esc.verify(id, true, REASON);
        vm.prank(client);
        vm.expectRevert(SkillPayEscrow.NotVerifier.selector);
        esc.verify(id, true, REASON);
    }

    function test_Verify_UsesSnapshotVerifier() public {
        uint256 id = _delivered();
        address newAgent = makeAddr("newAgent");
        vm.prank(owner);
        esc.setVerifier(newAgent);
        vm.prank(newAgent);
        vm.expectRevert(SkillPayEscrow.NotVerifier.selector);
        esc.verify(id, true, REASON);
        vm.prank(agent);
        esc.verify(id, true, REASON);
        _assertReleased(id);
    }

    function test_Verify_RequiresReason() public {
        uint256 id = _delivered();
        vm.prank(agent);
        vm.expectRevert(SkillPayEscrow.EmptyHash.selector);
        esc.verify(id, true, bytes32(0));
    }

    function test_MaxDeliveries() public {
        uint256 id = _delivered();
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(agent);
            esc.verify(id, false, REASON);
            vm.prank(provider);
            esc.submitDelivery(id, keccak256(abi.encode(i)));
        }
        vm.prank(agent);
        esc.verify(id, false, REASON);
        vm.prank(provider);
        vm.expectRevert(SkillPayEscrow.TooManyDeliveries.selector);
        esc.submitDelivery(id, keccak256("v4"));
    }

    // ───────────── client approval + timeouts ─────────────

    function test_ClientApprove_Releases() public {
        uint256 id = _delivered();
        vm.prank(client);
        esc.approve(id);
        _assertReleased(id);
    }

    function test_ClientCanOverruleRejection() public {
        uint256 id = _delivered();
        vm.prank(agent);
        esc.verify(id, false, REASON);
        vm.prank(client);
        esc.approve(id);
        _assertReleased(id);
    }

    function test_ClaimAfterReview() public {
        uint256 id = _delivered();
        vm.prank(provider);
        vm.expectRevert(SkillPayEscrow.ReviewNotOver.selector);
        esc.claimAfterReview(id);
        vm.warp(block.timestamp + REVIEW + 1);
        vm.prank(provider);
        esc.claimAfterReview(id);
        _assertReleased(id);
    }

    function test_RefundExpired_NoDelivery() public {
        uint256 id = _accepted();
        vm.prank(client);
        vm.expectRevert(SkillPayEscrow.DeadlineNotPassed.selector);
        esc.refundExpired(id);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(client);
        esc.refundExpired(id);
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Refunded));
        assertEq(usdc.balanceOf(client), 10_000e6);
        assertEq(esc.totalLocked(), 0);
    }

    function test_RefundExpired_AfterRejection() public {
        uint256 id = _delivered();
        vm.prank(agent);
        esc.verify(id, false, REASON);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(provider);
        vm.expectRevert(SkillPayEscrow.DeadlinePassed.selector);
        esc.submitDelivery(id, keccak256("late"));
        vm.prank(client);
        esc.refundExpired(id);
        assertEq(usdc.balanceOf(client), 10_000e6);
    }

    function test_RefundExpired_NotWhileDelivered() public {
        uint256 id = _delivered();
        vm.warp(block.timestamp + 8 days);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(SkillPayEscrow.WrongStatus.selector, SkillPayEscrow.Status.Delivered));
        esc.refundExpired(id);
    }

    // ───────────── disputes ─────────────

    function test_Dispute_FreezesAndBlocksVerifier() public {
        uint256 id = _delivered();
        vm.prank(client);
        esc.dispute(id);
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Disputed));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(SkillPayEscrow.WrongStatus.selector, SkillPayEscrow.Status.Disputed));
        esc.verify(id, true, REASON);
        vm.warp(block.timestamp + REVIEW + 1);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SkillPayEscrow.WrongStatus.selector, SkillPayEscrow.Status.Disputed));
        esc.claimAfterReview(id);
    }

    function test_Dispute_OnlyParties() public {
        uint256 id = _delivered();
        vm.prank(stranger);
        vm.expectRevert(SkillPayEscrow.NotParty.selector);
        esc.dispute(id);
    }

    function test_Resolve_Split() public {
        uint256 id = _delivered();
        vm.prank(provider);
        esc.dispute(id);
        vm.prank(arbiter);
        esc.resolve(id, 6_000); // 60% to provider
        // provider gross 60, fee 6, provider net 54, client 40
        assertEq(usdc.balanceOf(provider), 54e6);
        assertEq(usdc.balanceOf(treasury), 6e6);
        assertEq(usdc.balanceOf(client), 10_000e6 - 100e6 + 40e6);
        assertEq(usdc.balanceOf(address(esc)), 0);
        assertEq(uint8(_status(id)), uint8(SkillPayEscrow.Status.Resolved));
    }

    function test_Resolve_OnlyArbiter() public {
        uint256 id = _delivered();
        vm.prank(client);
        esc.dispute(id);
        vm.prank(owner);
        vm.expectRevert(SkillPayEscrow.NotArbiter.selector);
        esc.resolve(id, 5_000);
        vm.prank(arbiter);
        vm.expectRevert(SkillPayEscrow.InvalidShare.selector);
        esc.resolve(id, 10_001);
    }

    // ───────────── safety ─────────────

    function test_PauseDoesNotTrapFunds() public {
        uint256 id = _delivered();
        vm.prank(owner);
        esc.pause();
        vm.prank(agent);
        esc.verify(id, true, REASON);
        _assertReleased(id);
    }

    function test_FeeSnapshotPerOrder() public {
        uint256 id = _delivered();
        vm.prank(owner);
        esc.setFeeBps(2_000);
        vm.prank(client);
        esc.approve(id);
        assertEq(usdc.balanceOf(treasury), 10e6); // still 10%
    }

    function test_RescueCannotTouchLockedFunds() public {
        _create();
        usdc.mint(address(esc), 5e6); // sent by mistake
        vm.startPrank(owner);
        vm.expectRevert(SkillPayEscrow.LockedFunds.selector);
        esc.rescueTokens(IERC20(address(usdc)), owner, 6e6);
        esc.rescueTokens(IERC20(address(usdc)), owner, 5e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(esc)), AMOUNT);
    }

    function test_AdminOnlyOwner() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        esc.setVerifier(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        esc.setArbiter(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        esc.setFeeBps(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        esc.pause();
        vm.stopPrank();
    }

    function testFuzz_ReleaseSplitExact(uint128 amount, uint16 fee) public {
        amount = uint128(bound(amount, esc.MIN_AMOUNT(), 10_000e6));
        fee = uint16(bound(fee, 0, esc.MAX_FEE_BPS()));
        vm.prank(owner);
        esc.setFeeBps(fee);
        vm.prank(client);
        uint256 id = esc.createOrder(provider, amount, uint64(block.timestamp + 1 days), SPEC);
        (uint256 p, uint256 f) = esc.payout(id);
        vm.prank(provider);
        esc.accept(id);
        vm.prank(provider);
        esc.submitDelivery(id, DELIVERY);
        vm.prank(agent);
        esc.verify(id, true, REASON);
        assertEq(usdc.balanceOf(provider), p);
        assertEq(usdc.balanceOf(treasury), f);
        assertEq(p + f, amount);
    }

    function testFuzz_ResolveConserves(uint16 share) public {
        share = uint16(bound(share, 0, 10_000));
        uint256 id = _delivered();
        vm.prank(client);
        esc.dispute(id);
        uint256 before = usdc.balanceOf(client);
        vm.prank(arbiter);
        esc.resolve(id, share);
        uint256 total = usdc.balanceOf(provider) + usdc.balanceOf(treasury) + (usdc.balanceOf(client) - before);
        assertEq(total, AMOUNT);
        assertEq(usdc.balanceOf(address(esc)), 0);
    }
}

/// @dev Drives random sequences of actions; the invariant test checks the books always balance.
contract EscrowHandler is Test {
    SkillPayEscrow internal esc;
    MockUSDC internal usdc;
    address internal client;
    address internal provider;
    address internal agent;
    address internal arbiter;
    uint256[] public ids;

    constructor(SkillPayEscrow e, MockUSDC u, address c, address p, address a, address arb) {
        esc = e;
        usdc = u;
        client = c;
        provider = p;
        agent = a;
        arbiter = arb;
    }

    function create(uint128 amount) external {
        amount = uint128(bound(amount, 100_000, 1_000e6));
        usdc.mint(client, amount);
        vm.prank(client);
        usdc.approve(address(esc), amount);
        vm.prank(client);
        ids.push(esc.createOrder(provider, amount, uint64(block.timestamp + 2 days), keccak256("s")));
    }

    function act(uint256 seed, uint8 action) external {
        if (ids.length == 0) return;
        uint256 id = ids[seed % ids.length];
        action = action % 9;
        if (action == 0) { vm.prank(provider); _try(abi.encodeCall(esc.accept, (id))); }
        else if (action == 1) { vm.prank(provider); _try(abi.encodeCall(esc.submitDelivery, (id, keccak256("d")))); }
        else if (action == 2) { vm.prank(agent); _try(abi.encodeCall(esc.verify, (id, seed % 2 == 0, keccak256("r")))); }
        else if (action == 3) { vm.prank(client); _try(abi.encodeCall(esc.approve, (id))); }
        else if (action == 4) { vm.prank(client); _try(abi.encodeCall(esc.cancel, (id))); }
        else if (action == 5) { vm.prank(client); _try(abi.encodeCall(esc.dispute, (id))); }
        else if (action == 6) { vm.prank(arbiter); _try(abi.encodeCall(esc.resolve, (id, uint16(seed % 10_001)))); }
        else if (action == 7) { vm.prank(client); _try(abi.encodeCall(esc.refundExpired, (id))); }
        else vm.warp(block.timestamp + (seed % 4 days));
    }

    function _try(bytes memory data) internal {
        (bool ok,) = address(esc).call(data);
        ok; // reverts are expected for invalid transitions
    }
}

contract SkillPayEscrowInvariantTest is StdInvariant, Test {
    SkillPayEscrow internal esc;
    MockUSDC internal usdc;

    function setUp() public {
        usdc = new MockUSDC();
        address agent = makeAddr("agent");
        address arbiter = makeAddr("arbiter");
        esc = new SkillPayEscrow(IERC20(address(usdc)), makeAddr("treasury"), address(this), agent, arbiter, 1_000, 1 days);
        EscrowHandler h = new EscrowHandler(esc, usdc, makeAddr("client"), makeAddr("provider"), agent, arbiter);
        targetContract(address(h));
    }

    /// The contract always holds exactly the USDC owed to open orders.
    function invariant_LockedMatchesBalance() public view {
        assertEq(usdc.balanceOf(address(esc)), esc.totalLocked());
    }
}
