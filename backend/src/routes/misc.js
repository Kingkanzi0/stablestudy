const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { syncTransaction } = require('../services/indexer');
const { network, contractAddress, escrowAddress } = require('../config');
const { asyncHandler, HttpError, lower, formatUsdc } = require('../utils');
const S = require('../serializers');

const router = express.Router();
const addressParam = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address');

// GET /api/health
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const state = await prisma.indexerState.findUnique({ where: { id: 1 } }).catch(() => null);
    res.json({
      status: 'ok',
      service: 'SkillPay API',
      version: '2.0.0',
      network: { name: network.name, chainId: network.id, explorer: network.explorer },
      contract: contractAddress,
      escrow: escrowAddress,
      indexedBlock: state ? state.lastBlock.toString() : null,
    });
  }),
);

// GET /api/config — what the frontend needs to talk to the right chain and contract
router.get('/config', (_req, res) => {
  res.json({
    network: { key: network.key, name: network.name, chainId: network.id, explorer: network.explorer },
    contract: contractAddress,
    escrow: escrowAddress,
    categories: S.CATEGORIES,
    levels: S.LEVELS,
  });
});

// GET /api/stats — platform totals for the landing page
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [courses, tutors, enrollments, openJobs] = await Promise.all([
      prisma.course.count({ where: { status: 'PUBLISHED', active: true } }),
      prisma.tutor.count({ where: { registered: true, suspended: false } }),
      prisma.enrollment.findMany({ select: { priceUnits: true, tutorUnits: true, student: true } }),
      prisma.job.count({ where: { status: 'OPEN' } }),
    ]);
    const volume = enrollments.reduce((s, e) => s + BigInt(e.priceUnits), 0n);
    const paidToTutors = enrollments.reduce((s, e) => s + BigInt(e.tutorUnits), 0n);
    res.json({
      courses,
      tutors,
      enrollments: enrollments.length,
      learners: new Set(enrollments.map((e) => e.student)).size,
      volume: formatUsdc(volume.toString()),
      paidToTutors: formatUsdc(paidToTutors.toString()),
      openJobs,
    });
  }),
);

// GET /api/students/:address/enrollments — courses a wallet has paid for (public on-chain data)
router.get(
  '/students/:address/enrollments',
  asyncHandler(async (req, res) => {
    const student = lower(addressParam.parse(req.params.address));
    const enrollments = await prisma.enrollment.findMany({
      where: { student },
      include: { course: { include: { tutor: true, lessons: { select: { position: true, title: true, videoUrl: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ enrollments: enrollments.map(S.enrollment) });
  }),
);

// POST /api/sync — index a just-confirmed transaction immediately instead of waiting for the poller
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const { txHash } = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(req.body);
    try {
      res.json(await syncTransaction(txHash));
    } catch (err) {
      if (err.name === 'TransactionReceiptNotFoundError') {
        throw new HttpError(404, 'Transaction not found yet, try again in a moment');
      }
      throw err;
    }
  }),
);

// ───────────── public metadata (referenced by on-chain URIs) ─────────────

router.get(
  '/metadata/courses/:id',
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { tutor: true, lessons: { select: { position: true, title: true, videoUrl: true } } },
    });
    if (!course) throw new HttpError(404, 'Metadata not found');
    const c = S.course(course);
    res.set('Cache-Control', 'public, max-age=60').json({
      name: c.title,
      summary: c.summary,
      description: c.description,
      category: c.category,
      level: c.level,
      durationMinutes: c.durationMinutes,
      tutor: c.tutor && { address: c.tutor.address, name: c.tutor.displayName },
      lessons: c.lessons.map((l) => l.title),
      external_url: c.onchainId ? `course/${c.id}` : undefined,
    });
  }),
);

router.get(
  '/metadata/tutors/:address',
  asyncHandler(async (req, res) => {
    const address = lower(addressParam.parse(req.params.address));
    const tutor = await prisma.tutor.findUnique({ where: { address } });
    if (!tutor) throw new HttpError(404, 'Metadata not found');
    res.set('Cache-Control', 'public, max-age=60').json({
      name: tutor.displayName,
      headline: tutor.headline,
      bio: tutor.bio,
      image: tutor.avatarUrl,
      website: tutor.website,
    });
  }),
);

module.exports = router;
