// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SkillPay} from "../src/SkillPay.sol";

/// @notice Deploys SkillPay to Arc.
/// Env vars:
///   USDC_ADDRESS   USDC ERC-20 interface (Arc mainnet & testnet: 0x3600000000000000000000000000000000000000)
///   TREASURY       receives platform fees (use a multisig on mainnet)
///   OWNER          admin of the contract (use a multisig on mainnet)
///   FEE_BPS        platform fee in basis points (default 1000 = 10%, max 2000)
contract Deploy is Script {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (SkillPay sp) {
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);
        address treasury = vm.envAddress("TREASURY");
        address owner = vm.envAddress("OWNER");
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(1_000)));

        require(IERC20(usdc).totalSupply() > 0, "USDC address looks wrong");

        vm.startBroadcast();
        sp = new SkillPay(IERC20(usdc), treasury, owner, feeBps);
        vm.stopBroadcast();

        console2.log("SkillPay deployed at:", address(sp));
        console2.log("Chain id:", block.chainid);
        console2.log("USDC:", usdc);
        console2.log("Treasury:", treasury);
        console2.log("Owner:", owner);
        console2.log("Fee (bps):", feeBps);
        console2.log("Deployment block:", block.number);
    }
}
