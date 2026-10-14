const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { isEnrolledOnchain } = require('../chain');
const { asyncHandler, HttpError, lower } = require('../utils');
const S = require('../serializers');

const router = express.Router();

const include = {
  tutor: true,
  lessons: { select: { position: true, title: true, videoUrl: true } },
};

const httpsUrl = z
  .string()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//.test(u), 'must be an http(s) link');

const lessonInput = z.object({
  title: z.string().trim().min(2).max(120),
  content: z.string().trim().min(1).max(20_000),
  videoUrl: httpsUrl.optional().or(z.literal('').transform(() => undefined)),
  resourceUrl: httpsUrl.optional().or(z.literal('').transform(() => undefined)),
});

const courseInput = z.object({
  title: z.string().trim().min(4).max(90),
  summary: z.string().trim().min(10).max(200),
  description: z.string().trim().min(20).max(5_000),
  category: z.enum(S.CATEGORIES),
  level: z.enum(S.LEVELS),
  durationMinutes: z.coerce.number().int().min(5).max(10_000).optional(),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  lessons: z.array(lessonInput).min(1).max(50),
});

async function findCourseOr404(id) {
  const course = await prisma.course.findUnique({ where: { id }, include });
  if (!course) throw new HttpError(404, 'Course not found');
  return course;
}

// GET /api/courses — published, active courses (filterable)
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        search: z.string().trim().max(100).optional(),
        category: z.string().max(60).optional(),
        tutor: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
        sort: z.enum(['popular', 'newest', 'price_low', 'price_high']).default('popular'),
      })
      .parse(req.query);

    const tutor = lower(q.tutor);
    const ownView = tutor && req.wallet === tutor; // tutors see their drafts & hidden courses
    const where = {
      ...(ownView ? {} : { status: 'PUBLISHED', active: true, tutor: { suspended: false } }),
      ...(tutor ? { tutorAddress: tutor } : {}),
      ...(q.category && q.category !== 'All' ? { category: q.category } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { summary: { contains: q.search, mode: 'insensitive' } },
              { category: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy =
      q.sort === 'newest' ? { createdAt: 'desc' } : { enrollmentCount: 'desc' };

    let courses = await prisma.course.findMany({ where, include, orderBy, take: 200 });
    // priceUnits is a string column, so sort by price in JS.
    if (q.sort === 'price_low' || q.sort === 'price_high') {
      const dir = q.sort === 'price_low' ? 1 : -1;
      courses = courses.sort((a, b) => {
        const pa = BigInt(a.priceUnits || 0);
        const pb = BigInt(b.priceUnits || 0);
        return pa === pb ? 0 : pa > pb ? dir : -dir;
      });
    }
    res.json({ courses: courses.map(S.course), categories: S.CATEGORIES, levels: S.LEVELS });
  }),
);

// GET /api/courses/meta — categories and levels for forms
router.get('/meta', (_req, res) => res.json({ categories: S.CATEGORIES, levels: S.LEVELS }));

// GET /api/courses/:id — public details + lesson outline
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const course = await findCourseOr404(req.params.id);
    if (course.status !== 'PUBLISHED' && course.tutorAddress !== req.wallet) {
      throw new HttpError(404, 'Course not found');
    }
    res.json({ course: S.course(course) });
  }),
);

// GET /api/courses/:id/content — full lessons for enrolled students and the tutor
router.get(
  '/:id/content',
  requireAuth,
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { lessons: { orderBy: { position: 'asc' } } },
    });
    if (!course) throw new HttpError(404, 'Course not found');

    let allowed = course.tutorAddress === req.wallet;
    if (!allowed && course.onchainId !== null) {
      const indexed = await prisma.enrollment.findUnique({
        where: { onchainId_student: { onchainId: course.onchainId, student: req.wallet } },
      });
      // Fall back to the contract if the indexer has not caught up yet.
      allowed = Boolean(indexed) || (await isEnrolledOnchain(course.onchainId, req.wallet));
    }
    if (!allowed) throw new HttpError(403, 'Enroll in this course to unlock its lessons');

    res.json({ courseId: course.id, lessons: course.lessons.map(S.lessonFull) });
  }),
);

// POST /api/courses — create a draft; the tutor then publishes it on-chain with the returned metadataURI
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = courseInput.parse(req.body);
    const tutor = await prisma.tutor.findUnique({ where: { address: req.wallet } });
    if (!tutor) throw new HttpError(400, 'Create your tutor profile first');
    if (tutor.suspended) throw new HttpError(403, 'Your tutor account is suspended');

    const drafts = await prisma.course.count({ where: { tutorAddress: req.wallet, status: 'DRAFT' } });
    if (drafts >= 20) throw new HttpError(429, 'Too many unpublished drafts. Publish or delete some first.');

    const { lessons, ...fields } = input;
    const course = await prisma.course.create({
      data: {
        ...fields,
        tutorAddress: req.wallet,
        lessons: { create: lessons.map((l, i) => ({ ...l, position: i + 1 })) },
      },
      include,
    });
    res.status(201).json({ course: S.course(course), metadataURI: S.courseMetadataUri(course.id) });
  }),
);

// PUT /api/courses/:id — tutor edits metadata and lessons (price/visibility live on-chain)
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await findCourseOr404(req.params.id);
    if (existing.tutorAddress !== req.wallet) throw new HttpError(403, 'Only the tutor can edit this course');
    const input = courseInput.parse(req.body);
    const { lessons, ...fields } = input;

    const course = await prisma.$transaction(async (tx) => {
      await tx.lesson.deleteMany({ where: { courseId: existing.id } });
      return tx.course.update({
        where: { id: existing.id },
        data: {
          ...fields,
          lessons: { create: lessons.map((l, i) => ({ ...l, position: i + 1 })) },
        },
        include,
      });
    });
    res.json({ course: S.course(course) });
  }),
);

// DELETE /api/courses/:id — only unpublished drafts can be deleted
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await findCourseOr404(req.params.id);
    if (existing.tutorAddress !== req.wallet) throw new HttpError(403, 'Only the tutor can delete this course');
    if (existing.status !== 'DRAFT') {
      throw new HttpError(400, 'Published courses cannot be deleted. Hide them instead.');
    }
    await prisma.course.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

module.exports = router;
