const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireUser, requireAdmin, readSession, userForSession, isAdmin } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils');
const { imageUrl, publicProfile } = require('./profiles');

const router = express.Router();

const TYPES = ['AIRDROP', 'TESTNET', 'QUEST', 'INCENTIVE', 'POINTS', 'OTHER'];
const COSTS = ['FREE', 'GAS', 'DEPOSIT'];
const CHAINS = ['Arc', 'Multi-chain', 'Other EVM'];

const https = z
  .string()
  .trim()
  .max(400)
  .regex(/^https:\/\/[^\s]+$/, 'Must be an https:// link');
const optionalHttps = https.optional().or(z.literal('').transform(() => undefined));
const optionalDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((v) => (v ? new Date(v) : null));

const campaignInput = z
  .object({
    projectName: z.string().trim().min(2).max(60),
    title: z.string().trim().min(4).max(100),
    logoId: z.string().regex(/^[a-z0-9]{10,40}$/).optional().or(z.literal('').transform(() => undefined)),
    summary: z.string().trim().min(10).max(200),
    description: z.string().trim().min(20).max(6000),
    type: z.enum(TYPES),
    reward: z.string().trim().min(2).max(120),
    cost: z.enum(COSTS).default('FREE'),
    chain: z.enum(CHAINS).default('Arc'),
    startsAt: optionalDate,
    endsAt: optionalDate,
    websiteUrl: https,
    xUrl: optionalHttps,
    discordUrl: optionalHttps,
    telegramUrl: optionalHttps,
    steps: z
      .array(
        z.object({
          title: z.string().trim().min(2).max(120),
          details: z.string().trim().max(1000).optional().default(''),
          url: optionalHttps,
        }),
      )
      .min(1, 'Add at least one step')
      .max(15),
    tags: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  })
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, { message: 'End must be after start', path: ['endsAt'] });

/** Upcoming / live / ended, worked out from the dates. */
function phase(c, now = new Date()) {
  if (c.startsAt && c.startsAt > now) return 'UPCOMING';
  if (c.endsAt && c.endsAt < now) return 'ENDED';
  return 'LIVE';
}

function serialize(c, { owner, full = false, viewer } = {}) {
  const base = {
    id: c.id,
    projectName: c.projectName,
    title: c.title,
    logoUrl: imageUrl(c.logoId),
    logoId: c.logoId,
    summary: c.summary,
    type: c.type,
    reward: c.reward,
    cost: c.cost,
    chain: c.chain,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    phase: phase(c),
    featured: c.featured,
    tags: c.tags,
    views: c.views,
    createdAt: c.createdAt,
  };
  if (!full) return base;
  const canManage = viewer && (viewer.id === c.ownerId || isAdmin(viewer));
  return {
    ...base,
    description: c.description,
    websiteUrl: c.websiteUrl,
    xUrl: c.xUrl,
    discordUrl: c.discordUrl,
    telegramUrl: c.telegramUrl,
    steps: c.steps,
    postedBy: owner ? publicProfile(owner) : null,
    ...(canManage ? { status: c.status, reviewNote: c.reviewNote, canManage: true } : {}),
  };
}

const listQuery = z.object({
  type: z.enum(TYPES).optional(),
  phase: z.enum(['LIVE', 'UPCOMING', 'ENDED']).optional(),
  chain: z.enum(CHAINS).optional(),
  cost: z.enum(COSTS).optional(),
  q: z.string().trim().max(80).optional(),
});

// GET /api/campaigns — approved campaigns, live first
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = listQuery.parse(req.query);
    const now = new Date();
    const where = { status: 'APPROVED' };
    if (f.type) where.type = f.type;
    if (f.chain) where.chain = f.chain;
    if (f.cost) where.cost = f.cost;
    if (f.q) {
      where.OR = [
        { projectName: { contains: f.q, mode: 'insensitive' } },
        { title: { contains: f.q, mode: 'insensitive' } },
        { tags: { has: f.q } },
      ];
    }
    if (f.phase === 'UPCOMING') where.startsAt = { gt: now };
    if (f.phase === 'ENDED') where.endsAt = { lt: now };
    if (f.phase === 'LIVE') {
      where.AND = [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ];
    }
    const rows = await prisma.campaign.findMany({ where, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 200 });
    const order = { LIVE: 0, UPCOMING: 1, ENDED: 2 };
    const campaigns = rows.map((c) => serialize(c)).sort((a, b) => order[a.phase] - order[b.phase] || b.featured - a.featured);
    res.json({ campaigns, types: TYPES, costs: COSTS, chains: CHAINS });
  }),
);

// GET /api/campaigns/mine — what the signed-in account has submitted
router.get(
  '/mine',
  requireUser,
  asyncHandler(async (req, res) => {
    const rows = await prisma.campaign.findMany({ where: { ownerId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ campaigns: rows.map((c) => ({ ...serialize(c), status: c.status, reviewNote: c.reviewNote })) });
  }),
);

// GET /api/campaigns/review — admin queue
router.get(
  '/review',
  requireUser,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.campaign.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
    res.json({ campaigns: rows.map((c) => ({ ...serialize(c, { full: true, viewer: _req.user }) })) });
  }),
);

// GET /api/campaigns/:id — anyone for approved campaigns; owner and admins see the rest
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!c) throw new HttpError(404, 'Campaign not found');
    const viewer = await userForSession(readSession(req)).catch(() => null);
    if (c.status !== 'APPROVED' && !(viewer && (viewer.id === c.ownerId || isAdmin(viewer)))) {
      throw new HttpError(404, 'Campaign not found');
    }
    const owner = await prisma.user.findUnique({ where: { id: c.ownerId } });
    if (c.status === 'APPROVED') prisma.campaign.update({ where: { id: c.id }, data: { views: { increment: 1 } } }).catch(() => {});
    res.json({ campaign: serialize(c, { owner, full: true, viewer }) });
  }),
);

async function checkLogo(logoId, userId) {
  if (!logoId) return;
  const img = await prisma.image.findUnique({ where: { id: logoId }, select: { ownerId: true } });
  if (!img || img.ownerId !== userId) throw new HttpError(400, 'Upload the logo again');
}

// POST /api/campaigns — submit for review (admins publish straight away)
router.post(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    const input = campaignInput.parse(req.body);
    await checkLogo(input.logoId, req.user.id);
    const pending = await prisma.campaign.count({ where: { ownerId: req.user.id, status: 'PENDING' } });
    if (pending >= 5) throw new HttpError(429, 'You have 5 campaigns waiting for review already.');
    const admin = isAdmin(req.user);
    const c = await prisma.campaign.create({
      data: { ...input, ownerId: req.user.id, status: admin ? 'APPROVED' : 'PENDING' },
    });
    res.status(201).json({ campaign: serialize(c, { owner: req.user, full: true, viewer: req.user }) });
  }),
);

async function ownedOr404(id, user) {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c || (c.ownerId !== user.id && !isAdmin(user))) throw new HttpError(404, 'Campaign not found');
  return c;
}

// PUT /api/campaigns/:id — edits go back to review unless an admin makes them
router.put(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    const existing = await ownedOr404(req.params.id, req.user);
    const input = campaignInput.parse(req.body);
    await checkLogo(input.logoId, existing.ownerId);
    const c = await prisma.campaign.update({
      where: { id: existing.id },
      data: { ...input, status: isAdmin(req.user) ? existing.status : 'PENDING', reviewNote: null },
    });
    res.json({ campaign: serialize(c, { owner: req.user, full: true, viewer: req.user }) });
  }),
);

// DELETE /api/campaigns/:id
router.delete(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    const c = await ownedOr404(req.params.id, req.user);
    await prisma.campaign.delete({ where: { id: c.id } });
    if (c.logoId) prisma.image.deleteMany({ where: { id: c.logoId } }).catch(() => {});
    res.status(204).end();
  }),
);

// POST /api/campaigns/:id/review { approve, note?, featured? } — admins only
router.post(
  '/:id/review',
  requireUser,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ approve: z.boolean(), note: z.string().trim().max(500).optional(), featured: z.boolean().optional() })
      .parse(req.body);
    const c = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        status: input.approve ? 'APPROVED' : 'REJECTED',
        reviewNote: input.note || null,
        featured: input.featured ?? undefined,
      },
    });
    res.json({ campaign: serialize(c, { full: true, viewer: req.user }) });
  }),
);

module.exports = router;
