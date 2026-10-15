const { keccak256, toBytes, decodeEventLog } = require('viem');
const { prisma } = require('../db');
const { escrow } = require('../chain');
const { lower } = require('../utils');

// ───────────── canonical records + hashes ─────────────
// Specs, deliveries and agent reports live off-chain; their keccak256 hashes are committed on-chain,
// so anyone can check the record they see is the one both parties and the agent signed against.

/** JSON with keys sorted at every level, so the same record always hashes the same way. */
function canonicalJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v)
        .sort()
        .reduce((acc, k) => {
          if (v[k] !== undefined) acc[k] = sort(v[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

function hashRecord(record) {
  const json = canonicalJson(record);
  return { json, hash: keccak256(toBytes(json)) };
}

// ───────────── on-chain event handlers ─────────────

const STATUS_BY_EVENT = {
  OrderAccepted: 'ACCEPTED',
  OrderCancelled: 'CANCELLED',
  OrderRefunded: 'REFUNDED',
  OrderDisputed: 'DISPUTED',
  OrderReleased: 'RELEASED',
  DisputeResolved: 'RESOLVED',
};

function plain(args) {
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : typeof v === 'string' ? v.toLowerCase() : v]),
  );
}

async function recordEvent(order, name, args, log) {
  try {
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: name,
        data: plain(args),
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex),
        blockNumber: Number(log.blockNumber),
      },
    });
    return true;
  } catch (err) {
    if (err.code === 'P2002') return false; // already indexed
    throw err;
  }
}

async function onOrderCreated(args, log) {
  const specHash = lower(args.specHash);
  let order = await prisma.order.findUnique({ where: { specHash } });
  const data = {
    onchainId: Number(args.orderId),
    status: 'FUNDED',
    verifierAddress: lower(args.verifier),
    createdTx: log.transactionHash,
  };
  if (order && order.onchainId === null && order.clientAddress === lower(args.client)) {
    order = await prisma.order.update({ where: { id: order.id }, data });
  } else if (!order) {
    // Created outside the app: keep a placeholder so the order still shows up for both parties.
    order = await prisma.order.create({
      data: {
        ...data,
        clientAddress: lower(args.client),
        providerAddress: lower(args.provider),
        title: `Order #${args.orderId}`,
        description: 'Created directly on-chain. The spec was not shared with iSabi.',
        criteria: [],
        category: 'Other',
        amountUnits: args.amount.toString(),
        deadline: new Date(Number(args.deadline) * 1000),
        specHash,
        specJson: '',
      },
    });
  } else if (order.onchainId !== Number(args.orderId)) {
    return; // a different order already claimed this spec hash
  }
  await recordEvent(order, 'OrderCreated', args, log);
}

async function findOrder(orderId) {
  return prisma.order.findUnique({ where: { onchainId: Number(orderId) } });
}

const handlers = {
  OrderCreated: onOrderCreated,

  async DeliverySubmitted(args, log) {
    const order = await findOrder(args.orderId);
    if (!order) return;
    if (!(await recordEvent(order, 'DeliverySubmitted', args, log))) return;
    await prisma.delivery.updateMany({
      where: { orderId: order.id, deliveryHash: lower(args.deliveryHash) },
      data: { number: Number(args.delivery), submittedTx: log.transactionHash },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED', reviewEnds: new Date(Number(args.reviewEnds) * 1000) },
    });
  },

  async DeliveryVerified(args, log) {
    const order = await findOrder(args.orderId);
    if (!order) return;
    if (!(await recordEvent(order, 'DeliveryVerified', args, log))) return;
    await prisma.verdict.updateMany({
      where: { orderId: order.id, reasonHash: lower(args.reasonHash) },
      data: { txHash: log.transactionHash },
    });
    if (!args.approved) await prisma.order.update({ where: { id: order.id }, data: { status: 'REJECTED' } });
    // An approval is followed by OrderReleased in the same transaction, which sets RELEASED.
  },
};

for (const [name, status] of Object.entries(STATUS_BY_EVENT)) {
  handlers[name] = async (args, log) => {
    const order = await findOrder(args.orderId);
    if (!order) return;
    if (!(await recordEvent(order, name, args, log))) return;
    await prisma.order.update({ where: { id: order.id }, data: { status } });
  };
}

/** Handles one raw log from the escrow contract. Returns the event name or null. */
async function processEscrowLog(log) {
  if (!escrow || lower(log.address) !== escrow.address) return null;
  let event;
  try {
    event = decodeEventLog({ abi: escrow.abi, data: log.data, topics: log.topics });
  } catch {
    return null;
  }
  const handler = handlers[event.eventName];
  if (handler) await handler(event.args, log);
  return event.eventName;
}

module.exports = { canonicalJson, hashRecord, processEscrowLog };
