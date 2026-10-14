const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError, lower, formatUsdc } = require('../utils');
const S = require('../serializers');

const router = express.Router();
const addressParam = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address');

const optionalUrl = z
  .string()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//.test(u), 'must be an http(s) link')
  .optional()
  .or(z.literal('').transform(() => undefined));

const profileInput = z.object({
  displayName: z.string().trim().min(2).max(60),
  headline: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2_000).optional(),
  avatarUrl: optionalUrl,
  website: optionalUrl,
});

async function tutorStats(address) {
  const enrollments = await prisma.enrollment.findMany({
    where: { course: { tutorAddress: address } },
    select: { tutorUnits: true, student: true },
  });
  const earned = enrollments.reduce((sum, e) => sum + BigInt(e.tutorUnits), 0n);
  return {
    totalEnrollments: enrollments.length,
    uniqueStudents: new Set(enrollments.map((e) => e.student)).size,
    totalEarned: formatUsdc(earned.toString()),
  };
}

// GET /api/tutors/:address — public profile, published courses and stats
router.get(
  '/:address',
  asyncHandler(async (req, res) => {
    const address = lower(addressParam.parse(req.params.address));
    const tutor = await prisma.tutor.findUnique({ where: { address } });
    if (!tutor) throw new HttpError(404, 'Tutor not found');
    const courses = await prisma.course.findMany({
      where: { tutorAddress: address, status: 'PUBLISHED', active: true },
      include: { tutor: true, lessons: { select: { position: true, title: true, videoUrl: true } } },
      orderBy: { enrollmentCount: 'desc' },
    });
    res.json({
      tutor: { ...S.tutorSummary(tutor), bio: tutor.bio, website: tutor.website, createdAt: tutor.createdAt },
      courses: courses.map(S.course),
      stats: await tutorStats(address),
      metadataURI: S.tutorMetadataUri(address),
    });
  }),
);

// GET /api/tutors/me/dashboard — the signed-in tutor's own data, including drafts and recent sales
router.get(
  '/me/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tutor = await prisma.tutor.findUnique({ where: { address: req.wallet } });
    if (!tutor) return res.json({ tutor: null });
    const courses = await prisma.course.findMany({
      where: { tutorAddress: req.wallet },
      include: { tutor: true, lessons: { select: { position: true, title: true, videoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const sales = await prisma.enrollment.findMany({
      where: { course: { tutorAddress: req.wallet } },
      include: { course: { include: { tutor: true } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    res.json({
      tutor: { ...S.tutorSummary(tutor), bio: tutor.bio, website: tutor.website },
      courses: courses.map(S.course),
      recentSales: sales.map(S.enrollment),
      stats: await tutorStats(req.wallet),
      metadataURI: S.tutorMetadataUri(req.wallet),
    });
  }),
);

// PUT /api/tutors/me — create or update the signed-in wallet's tutor profile
router.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = profileInput.parse(req.body);
    const tutor = await prisma.tutor.upsert({
      where: { address: req.wallet },
      update: input,
      create: { ...input, address: req.wallet },
    });
    res.json({
      tutor: { ...S.tutorSummary(tutor), bio: tutor.bio, website: tutor.website },
      metadataURI: S.tutorMetadataUri(req.wallet),
    });
  }),
);

module.exports = router;
