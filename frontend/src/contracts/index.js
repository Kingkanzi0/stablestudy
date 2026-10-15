import { erc20Abi } from 'viem'
import { skillPayAbi } from './skillPayAbi'
import { escrowAbi } from './escrowAbi'
import { network } from '../config/network'

export const skillPay = { address: network.skillPayAddress, abi: skillPayAbi, chainId: network.chain.id }
export const usdc = { address: network.usdcAddress, abi: erc20Abi, chainId: network.chain.id }
export const escrow = { address: network.escrowAddress, abi: escrowAbi, chainId: network.chain.id }
