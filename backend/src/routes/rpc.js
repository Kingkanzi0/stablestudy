const express = require('express');
const { network } = require('../config');

/**
 * Read-only JSON-RPC proxy to Arc.
 * Some browsers, privacy shields and wallets block direct calls to public RPC
 * endpoints, so the frontend reads chain data through this API instead.
 * Transactions are never sent here: they are signed and sent by the user's wallet.
 */
const router = express.Router();

const ALLOWED = new Set([
  'eth_chainId',
  'net_version',
  'eth_blockNumber',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getLogs',
]);
const MAX_BATCH = 20;

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

router.post('/', async (req, res) => {
  const body = req.body;
  const calls = Array.isArray(body) ? body : [body];

  if (!calls.length || calls.length > MAX_BATCH) {
    return res.status(400).json(rpcError(null, -32600, `Send between 1 and ${MAX_BATCH} requests`));
  }
  const blocked = calls.find((c) => !c || typeof c.method !== 'string' || !ALLOWED.has(c.method));
  if (blocked) {
    return res.status(400).json(rpcError(blocked?.id, -32601, `Method ${blocked?.method} is not available here`));
  }

  try {
    const upstream = await fetch(network.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await upstream.text();
    res.status(upstream.ok ? 200 : 502).type('application/json').send(text);
  } catch (err) {
    console.error('[rpc] upstream error:', err.message);
    res.status(502).json(rpcError(calls[0]?.id, -32603, 'Arc RPC is not reachable right now'));
  }
});

module.exports = router;
