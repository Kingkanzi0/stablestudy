const { createPublicClient, http, defineChain } = require('viem');
const { network, contractAddress, escrowAddress } = require('./config');
const skillPayAbi = require('./contracts/skillPayAbi.json');
const escrowAbi = require('./contracts/escrowAbi.json');

const chain = defineChain({
  id: network.id,
  name: network.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [network.rpcUrl] } },
  blockExplorers: network.explorer
    ? { default: { name: 'Arcscan', url: network.explorer } }
    : undefined,
});

const publicClient = createPublicClient({
  chain,
  transport: http(network.rpcUrl, { retryCount: 3, timeout: 15_000 }),
});

const skillPay = {
  address: contractAddress,
  abi: skillPayAbi,
};

const escrow = escrowAddress ? { address: escrowAddress, abi: escrowAbi } : null;

/** Reads isEnrolled(courseId, student) directly from the contract. */
async function isEnrolledOnchain(onchainId, student) {
  return publicClient.readContract({
    ...skillPay,
    functionName: 'isEnrolled',
    args: [BigInt(onchainId), student],
  });
}

module.exports = { chain, publicClient, skillPay, escrow, isEnrolledOnchain };
