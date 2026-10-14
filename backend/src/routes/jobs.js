const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils');

const router = express.Router();

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Bounty'];
const JOB_CATEGORIES = [
  'Engineering',
  'Smart Contracts',
  'Design',
  'Product',
  'Marketing & Growth',
  'Community',
  'Content & Education',
  'Research',
  'Operations',
  'Other',
];
const PAY_UNITS = ['hour', 'month', 'year', 'project'];
const MAX_OPEN_JOBS_PER_WALLET = 10;

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//.test(u), 'must start with https://');

const applyTarget = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^https?:\/\/\S+$/.test(v) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Enter an https:// link or an email address',
  )
  .transform((v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : v));

const jobInput = z
  .object({
    title: z.string().trim().min(4).max(100),
    company: z.string().trim().min(2).max(80),
    companyUrl: httpUrl.optional().or(z.literal('').transform(() => undefined)),
    location: z.string().trim().min(2).max(80),
    type: z.enum(JOB_TYPES),
    category: z.enum(JOB_CATEGORIES),
    payMin: z.coerce.number().int().min(0).max(10_000_000).optional(),
    payMax: z.coerce.number().int().min(0).max(10_000_000).optional(),
    payUnit: z.enum(PAY_UNITS).optional(),
    description: z.string().trim().min(40).max(8_000),
    applyUrl: applyTarget,
    tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  })
  .refine((j) => j.payMin === undefined || j.payMax === undefined || j.payMax >= j.payMin, {
    message: 'Maximum pay must be at least the minimum',
    path: ['payMax'],
  })
  .refine((j) => (j.payMin === undefined && j.payMax === undefined) || j.payUnit, {
    message: 'Choose whether pay is per hour, month, year or project',
    path: ['payUnit'],
  });

function serialize(job, viewer) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyUrl: job.companyUrl,
    location: job.location,
    type: job.type,
    category: job.category,
    payMin: job.payMin,
    payMax: job.payMax,
    payUnit: job.payUnit,
    description: job.description,
    applyUrl: job.applyUrl,
    tags: job.tags,
    status: job.status,
    poster: job.posterAddress,
    isOwner: Boolean(viewer && viewer === job.posterAddress),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function ownJobOr404(id, wallet) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.posterAddress !== wallet) throw new HttpError(403, 'Only the person who posted this job can change it');
  return job;
}

// GET /api/jobs/meta
router.get('/meta', (_req, res) => res.json({ types: JOB_TYPES, categories: JOB_CATEGORIES, payUnits: PAY_UNITS }));

// GET /api/jobs — open jobs, newest first
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        search: z.string().trim().max(100).optional(),
        type: z.string().max(30).optional(),
        category: z.string().max(40).optional(),
        remote: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);

    const where = {
      status: 'OPEN',
      ...(q.type && q.type !== 'All' ? { type: q.type } : {}),
      ...(q.category && q.category !== 'All' ? { category: q.category } : {}),
      ...(q.remote === 'true' ? { location: { contains: 'remote', mode: 'insensitive' } } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { company: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              { tags: { has: q.search } },
            ],
          }
        : {}),
    };
    const jobs = await prisma.job.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ jobs: jobs.map((j) => serialize(j, req.wallet)), types: JOB_TYPES, categories: JOB_CATEGORIES });
  }),
);

// GET /api/jobs/mine — the signed-in wallet's posts, open and closed
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const jobs = await prisma.job.findMany({ where: { posterAddress: req.wallet }, orderBy: { createdAt: 'desc' } });
    res.json({ jobs: jobs.map((j) => serialize(j, req.wallet)) });
  }),
);

// GET /api/jobs/:id
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job || (job.status !== 'OPEN' && job.posterAddress !== req.wallet)) throw new HttpError(404, 'Job not found');
    res.json({ job: serialize(job, req.wallet) });
  }),
);

// POST /api/jobs — post a job
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = jobInput.parse(req.body);
    const open = await prisma.job.count({ where: { posterAddress: req.wallet, status: 'OPEN' } });
    if (open >= MAX_OPEN_JOBS_PER_WALLET) {
      throw new HttpError(429, `You can have up to ${MAX_OPEN_JOBS_PER_WALLET} open jobs. Close one to post another.`);
    }
    const job = await prisma.job.create({ data: { ...input, posterAddress: req.wallet } });
    res.status(201).json({ job: serialize(job, req.wallet) });
  }),
);

// PUT /api/jobs/:id — edit your post
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await ownJobOr404(req.params.id, req.wallet);
    const input = jobInput.parse(req.body);
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { ...input, companyUrl: input.companyUrl ?? null, payMin: input.payMin ?? null, payMax: input.payMax ?? null, payUnit: input.payUnit ?? null },
    });
    res.json({ job: serialize(job, req.wallet) });
  }),
);

// PATCH /api/jobs/:id/status — close or reopen
router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).parse(req.body);
    await ownJobOr404(req.params.id, req.wallet);
    const job = await prisma.job.update({ where: { id: req.params.id }, data: { status } });
    res.json({ job: serialize(job, req.wallet) });
  }),
);

module.exports = router;
