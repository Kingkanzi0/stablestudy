const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../db');
const { env } = require('../config');
const { hashRecord } = require('../services/escrow');
const { asyncHandler, HttpError, lower, formatUsdc } = require('../utils');

/**
 * API for the verifier agent. The agent reads its queue of deliveries to review, posts its written
 * report here (which returns the hash it must sign on-chain), then calls verify() on the escrow
 * contract from its own Arc agent wallet. This API never moves funds.
 */
const router = express.Router();

function requireAgent(req, _res, next) {
  if (!env.AGENT_API_KEY) return next(new HttpError(503, 'Agent access is not configured on this server'));
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(env.AGENT_API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(new HttpError(401, 'Invalid agent key'));
  next();
}

router.use(requireAgent);

const verdictInput = z.object({
  deliveryNumber: z.number().int().min(1).max(3),
  agent: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  model: z.string().max(80).optional(),
  summary: z.string().trim().min(10).max(2_000),
  checks: z
    .array(
      z.object({
        criterion: z.string().max(300),
        met: z.boolean(),
        note: z.string().trim().max(1_000),
      }),
    )
    .min(1)
    .max(12),
  approved: z.boolean(),
});

async function latestDelivery(orderId) {
  return prisma.delivery.findFirst({
    where: { orderId, number: { not: null } },
    orderBy: { number: 'desc' },
  });
}

// GET /api/agent/queue — delivered orders that have no report for their latest delivery yet
router.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const agent = req.query.agent ? lower(String(req.query.agent)) : null;
    const orders = await prisma.order.findMany({
      where: { status: 'DELIVERED', ...(agent ? { verifierAddress: agent } : {}) },
      include: { deliveries: true, verdicts: true },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    const items = [];
    for (const o of orders) {
      const d = o.deliveries.filter((x) => x.number !== null).sort((a, b) => b.number - a.number)[0];
      if (!d) continue;
      const done = o.verdicts.find((v) => v.deliveryNumber === d.number && v.txHash);
      if (done) continue;
      const pending = o.verdicts.find((v) => v.deliveryNumber === d.number && !v.txHash);
      items.push({
        orderId: o.id,
        onchainId: o.onchainId,
        verifier: o.verifierAddress,
        reviewEnds: o.reviewEnds,
        spec: {
          title: o.title,
          description: o.description,
          criteria: o.criteria,
          category: o.category,
          amount: formatUsdc(o.amountUnits),
          specHash: o.specHash,
        },
        delivery: { number: d.number, url: d.url, notes: d.notes, deliveryHash: d.deliveryHash },
        // A report saved earlier whose on-chain transaction never landed: the agent can resend it.
        pendingReport: pending ? { reasonHash: pending.reasonHash, approved: pending.approved } : null,
      });
    }
    res.json({ items });
  }),
);

// POST /api/agent/orders/:id/verdict — store the report and return the hash to sign on-chain
router.post(
  '/orders/:id/verdict',
  asyncHandler(async (req, res) => {
    const input = verdictInput.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.status !== 'DELIVERED') throw new HttpError(409, `Order is ${order.status}, not waiting for review`);
    if (order.verifierAddress && order.verifierAddress !== lower(input.agent)) {
      throw new HttpError(403, 'This order is assigned to a different verifier');
    }
    const delivery = await latestDelivery(order.id);
    if (!delivery || delivery.number !== input.deliveryNumber) {
      throw new HttpError(409, 'That is not the latest submitted delivery');
    }
    // A report can only approve when every criterion is met.
    const allMet = input.checks.every((c) => c.met);
    if (input.approved && !allMet) throw new HttpError(400, 'Cannot approve while a criterion is unmet');

    const { json, hash } = hashRecord({
      app: 'SkillPay',
      version: 1,
      order: order.specHash,
      delivery: delivery.deliveryHash,
      deliveryNumber: delivery.number,
      agent: lower(input.agent),
      model: input.model || null,
      approved: input.approved,
      summary: input.summary,
      checks: input.checks,
    });

    // Replace any earlier report for this delivery that never made it on-chain.
    await prisma.verdict.deleteMany({ where: { orderId: order.id, deliveryNumber: delivery.number, txHash: null } });
    const verdict = await prisma.verdict.create({
      data: {
        orderId: order.id,
        deliveryNumber: delivery.number,
        approved: input.approved,
        summary: input.summary,
        checks: input.checks,
        model: input.model || null,
        reasonHash: hash,
        reportJson: json,
      },
    });
    res.status(201).json({ reasonHash: verdict.reasonHash, onchainId: order.onchainId, approved: verdict.approved });
  }),
);

module.exports = router;
