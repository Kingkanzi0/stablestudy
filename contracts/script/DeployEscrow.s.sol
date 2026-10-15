// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SkillPayEscrow} from "../src/SkillPayEscrow.sol";

/// @notice Deploys SkillPayEscrow to Arc.
/// Env vars:
///   USDC_ADDRESS   default 0x3600000000000000000000000000000000000000 (Arc USDC ERC-20)
///   TREASURY       receives platform fees
///   OWNER          admin (use a multisig on mainnet)
///   VERIFIER       the verifier agent's wallet (Circle Agent Wallet on Arc)
///   ARBITER        human arbiter for disputes
///   FEE_BPS        default 1000 (10%)
///   REVIEW_PERIOD  seconds, default 259200 (3 days)
contract DeployEscrow is Script {
    function run() external returns (SkillPayEscrow esc) {
        address usdc = vm.envOr("USDC_ADDRESS", address(0x3600000000000000000000000000000000000000));
        uint16 fee = uint16(vm.envOr("FEE_BPS", uint256(1_000)));
        uint64 review = uint64(vm.envOr("REVIEW_PERIOD", uint256(3 days)));
        vm.startBroadcast();
        esc = new SkillPayEscrow(
            IERC20(usdc),
            vm.envAddress("TREASURY"),
            vm.envAddress("OWNER"),
            vm.envAddress("VERIFIER"),
            vm.envAddress("ARBITER"),
            fee,
            review
        );
        vm.stopBroadcast();
        console2.log("SkillPayEscrow deployed at:", address(esc));
        console2.log("Deployment block:", block.number);
    }
}
