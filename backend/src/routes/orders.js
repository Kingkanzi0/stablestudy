const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { parseUnits } = require('viem');
const { prisma } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { escrowAddress, USDC_DECIMALS } = require('../config');
const { hashRecord } = require('../services/escrow');
const { asyncHandler, HttpError, lower, formatUsdc } = require('../utils');

const router = express.Router();

const ORDER_CATEGORIES = [
  'Web development',
  'Smart contracts',
  'Design',
  'Writing & content',
  'Tutoring session',
  'Research & analysis',
  'Marketing',
  'Other',
];
const MAX_OPEN_DRAFTS = 20;
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Enter a valid 0x wallet address');

const orderInput = z.object({
  provider: address,
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().min(20).max(6_000),
  criteria: z.array(z.string().trim().min(3).max(300)).min(1, 'Add at least one acceptance criterion').max(12),
  category: z.enum(ORDER_CATEGORIES),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'Enter an amount like 50 or 49.99'),
  deadline: z.coerce.date(),
});

const deliveryInput = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//.test(u), 'must start with https://'),
  notes: z.string().trim().min(10, 'Tell the reviewer what you delivered').max(4_000),
});

// ───────────── serializers ─────────────

function serializeOrder(o, viewer) {
  return {
    id: o.id,
    onchainId: o.onchainId,
    client: o.clientAddress,
    provider: o.providerAddress,
    role: viewer === o.clientAddress ? 'client' : viewer === o.providerAddress ? 'provider' : null,
    title: o.title,
    description: o.description,
    criteria: o.criteria,
    category: o.category,
    amountUnits: o.amountUnits,
    amount: formatUsdc(o.amountUnits),
    deadline: o.deadline,
    deadlineUnix: Math.floor(new Date(o.deadline).getTime() / 1000),
    specHash: o.specHash,
    status: o.status,
    verifier: o.verifierAddress,
    reviewEnds: o.reviewEnds,
    createdTx: o.createdTx,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function serializeDelivery(d) {
  return {
    id: d.id,
    number: d.number,
    url: d.url,
    notes: d.notes,
    deliveryHash: d.deliveryHash,
    submitted: d.number !== null,
    submittedTx: d.submittedTx,
    createdAt: d.createdAt,
  };
}

function serializeVerdict(v) {
  return {
    id: v.id,
    deliveryNumber: v.deliveryNumber,
    approved: v.approved,
    summary: v.summary,
    checks: v.checks,
    model: v.model,
    reasonHash: v.reasonHash,
    txHash: v.txHash,
    onchain: Boolean(v.txHash),
    createdAt: v.createdAt,
  };
}

function serializeDetail(o, viewer) {
  return {
    order: serializeOrder(o, viewer),
    spec: o.specJson,
    deliveries: [...o.deliveries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(serializeDelivery),
    verdicts: [...o.verdicts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(serializeVerdict),
    events: [...o.events]
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
      .map((e) => ({ type: e.type, data: e.data, txHash: e.txHash, blockNumber: e.blockNumber, at: e.createdAt })),
  };
}

const detailInclude = { deliveries: true, verdicts: true, events: true };

async function partyOrderOr404(id, wallet) {
  const order = await prisma.order.findUnique({ where: { id }, include: detailInclude });
  if (!order || (order.clientAddress !== wallet && order.providerAddress !== wallet)) {
    throw new HttpError(404, 'Order not found');
  }
  return order;
}

// ───────────── routes ─────────────

// GET /api/orders/meta
router.get('/meta', (_req, res) => {
  res.json({ categories: ORDER_CATEGORIES, escrow: escrowAddress, enabled: Boolean(escrowAddress) });
});

// GET /api/orders/mine — orders where the signed-in wallet is client or provider
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        OR: [{ clientAddress: req.wallet }, { providerAddress: req.wallet, status: { not: 'DRAFT' } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    res.json({ orders: orders.map((o) => serializeOrder(o, req.wallet)) });
  }),
);

// GET /api/orders/:id — full detail for the client or provider
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await partyOrderOr404(req.params.id, req.wallet);
    if (order.status === 'DRAFT' && order.clientAddress !== req.wallet) throw new HttpError(404, 'Order not found');
    res.json(serializeDetail(order, req.wallet));
  }),
);

// POST /api/orders — the client writes the spec; returns the hash to lock on-chain
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!escrowAddress) throw new HttpError(503, 'Escrow is not set up on this server yet');
    const input = orderInput.parse(req.body);
    const provider = lower(input.provider);
    if (provider === req.wallet) throw new HttpError(400, 'You can’t hire your own wallet');

    const units = parseUnits(input.amount, USDC_DECIMALS);
    if (units < 100_000n || units > 1_000_000n * 10n ** 6n) {
      throw new HttpError(400, 'Amount must be between 0.10 and 1,000,000 USDC', [
        { field: 'amount', message: 'Between 0.10 and 1,000,000 USDC' },
      ]);
    }
    const now = Date.now();
    const deadlineMs = input.deadline.getTime();
    if (deadlineMs < now + 2 * 3600_000 || deadlineMs > now + 360 * 86400_000) {
      throw new HttpError(400, 'Deadline must be between 2 hours and 360 days from now', [
        { field: 'deadline', message: 'Between 2 hours and 360 days from now' },
      ]);
    }
    const drafts = await prisma.order.count({ where: { clientAddress: req.wallet, status: 'DRAFT' } });
    if (drafts >= MAX_OPEN_DRAFTS) throw new HttpError(429, 'Too many unfunded drafts. Delete some first.');

    const deadline = new Date(Math.floor(deadlineMs / 1000) * 1000);
    const spec = {
      app: 'SkillPay',
      version: 1,
      escrow: escrowAddress,
      client: req.wallet,
      provider,
      title: input.title,
      description: input.description,
      criteria: input.criteria,
      category: input.category,
      amountUnits: units.toString(),
      deadline: Math.floor(deadline.getTime() / 1000),
      nonce: crypto.randomBytes(16).toString('hex'),
    };
    const { json, hash } = hashRecord(spec);

    const order = await prisma.order.create({
      data: {
        clientAddress: req.wallet,
        providerAddress: provider,
        title: input.title,
        description: input.description,
        criteria: input.criteria,
        category: input.category,
        amountUnits: units.toString(),
        deadline,
        specHash: hash,
        specJson: json,
      },
      include: detailInclude,
    });
    res.status(201).json(serializeDetail(order, req.wallet));
  }),
);

// DELETE /api/orders/:id — only unfunded drafts
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await partyOrderOr404(req.params.id, req.wallet);
    if (order.clientAddress !== req.wallet || order.status !== 'DRAFT') {
      throw new HttpError(400, 'Only unfunded drafts can be deleted');
    }
    await prisma.order.delete({ where: { id: order.id } });
    res.status(204).end();
  }),
);

// POST /api/orders/:id/deliveries — provider records the work; returns the hash to submit on-chain
router.post(
  '/:id/deliveries',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await partyOrderOr404(req.params.id, req.wallet);
    if (order.providerAddress !== req.wallet) throw new HttpError(403, 'Only the provider can deliver');
    if (order.status !== 'ACCEPTED' && order.status !== 'REJECTED') {
      throw new HttpError(400, 'This order isn’t waiting for a delivery');
    }
    if (order.deadline < new Date()) throw new HttpError(400, 'The delivery deadline has passed');
    const input = deliveryInput.parse(req.body);
    const { json, hash } = hashRecord({
      app: 'SkillPay',
      version: 1,
      order: order.specHash,
      provider: req.wallet,
      url: input.url,
      notes: input.notes,
      nonce: crypto.randomBytes(16).toString('hex'),
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, url: input.url, notes: input.notes, deliveryHash: hash, recordJson: json },
    });
    res.status(201).json({ delivery: serializeDelivery(delivery) });
  }),
);

module.exports = { router, serializeDetail, serializeOrder, detailInclude };
