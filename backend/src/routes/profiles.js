const express = require('express');
const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../db');
const { publicApiUrl } = require('../config');
const { requireUser, isAdmin } = require('../middleware/auth');
const { asyncHandler, HttpError, lower } = require('../utils');
const { emailProvider } = require('../services/email');

const router = express.Router();

const MAX_IMAGE_BYTES = 180 * 1024;
const imageUrl = (id) => (id ? `${publicApiUrl}/api/images/${id}` : null);

// Handles are stored without the @ and validated loosely; links must be https.
const handle = z
  .string()
  .trim()
  .max(60)
  .transform((v) => v.replace(/^@/, ''))
  .refine((v) => v === '' || /^[A-Za-z0-9_.\-]{1,60}$/.test(v), 'Letters, numbers, _ . - only')
  .optional();
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Must start with https://')
  .optional();

const socialsInput = z
  .object({ x: handle, telegram: handle, discord: handle, github: handle, linkedin: httpsUrl, website: httpsUrl })
  .partial();

const profileInput = z.object({
  displayName: z.string().trim().min(2, 'At least 2 characters').max(60).optional().or(z.literal('')),
  bio: z.string().trim().max(500).optional(),
  socials: socialsInput.optional(),
});

function cleanSocials(socials) {
  if (!socials) return null;
  const out = {};
  for (const [k, v] of Object.entries(socials)) if (v) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** Public view of a person: never includes their email. */
function publicProfile(user, tutor) {
  return {
    id: user?.id || null,
    address: user?.wallet || tutor?.address || null,
    displayName: user?.displayName || tutor?.displayName || null,
    bio: user?.bio || tutor?.bio || null,
    avatarUrl: imageUrl(user?.avatarId) || tutor?.avatarUrl || null,
    socials: user?.socials || (tutor?.website ? { website: tutor.website } : null),
    isTutor: Boolean(tutor?.registered),
  };
}

async function myProfile(user) {
  const tutor = user.wallet ? await prisma.tutor.findUnique({ where: { address: user.wallet } }) : null;
  return {
    ...publicProfile(user, tutor),
    email: user.email,
    wallet: user.wallet,
    isAdmin: isAdmin(user),
    emailSignInAvailable: Boolean(emailProvider()) || process.env.NODE_ENV !== 'production',
  };
}

/** "data:image/webp;base64,...." -> { mime, buffer }, checking the bytes really are that image type. */
function decodeImage(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Upload a PNG, JPEG or WebP image');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'That image is too large. Try a smaller one.');
  const sig = buffer.subarray(0, 12);
  const ok =
    (m[1] === 'image/png' && sig.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    (m[1] === 'image/jpeg' && sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) ||
    (m[1] === 'image/webp' && sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP');
  if (!ok) throw new HttpError(400, 'That file isn’t a valid image');
  return { mime: m[1], buffer };
}

async function storeImage(ownerId, dataUrl) {
  const { mime, buffer } = decodeImage(dataUrl);
  // Keep storage bounded: each account can hold a few dozen images.
  const count = await prisma.image.count({ where: { ownerId } });
  if (count >= 40) throw new HttpError(429, 'You’ve uploaded a lot of images. Delete some campaigns or contact us.');
  return prisma.image.create({ data: { ownerId, mime, data: buffer, bytes: buffer.length } });
}

// GET /api/me — the signed-in account
router.get(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => res.json({ profile: await myProfile(req.user) })),
);

// PUT /api/me — update name, bio and social handles
router.put(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const input = profileInput.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        displayName: input.displayName === undefined ? undefined : input.displayName || null,
        bio: input.bio === undefined ? undefined : input.bio || null,
        // Prisma needs DbNull (not plain null) to clear a JSON column
        socials: input.socials === undefined ? undefined : cleanSocials(input.socials) ?? Prisma.DbNull,
      },
    });
    res.json({ profile: await myProfile(user) });
  }),
);

// POST /api/me/avatar { image: dataUrl } — profile picture (the browser resizes it first)
router.post(
  '/me/avatar',
  requireUser,
  asyncHandler(async (req, res) => {
    const img = await storeImage(req.user.id, req.body?.image);
    const old = req.user.avatarId;
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarId: img.id } });
    if (old) prisma.image.deleteMany({ where: { id: old, ownerId: req.user.id } }).catch(() => {});
    // Tutors show their picture on courses too.
    if (user.wallet) {
      await prisma.tutor.updateMany({ where: { address: user.wallet }, data: { avatarUrl: imageUrl(img.id) } });
    }
    res.json({ profile: await myProfile(user) });
  }),
);

// DELETE /api/me/avatar
router.delete(
  '/me/avatar',
  requireUser,
  asyncHandler(async (req, res) => {
    const old = req.user.avatarId;
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { avatarId: null } });
    if (old) {
      await prisma.image.deleteMany({ where: { id: old, ownerId: req.user.id } });
      if (user.wallet) {
        await prisma.tutor.updateMany({ where: { address: user.wallet, avatarUrl: imageUrl(old) }, data: { avatarUrl: null } });
      }
    }
    res.json({ profile: await myProfile(user) });
  }),
);

// POST /api/images { image: dataUrl } — e.g. a campaign logo. Returns its id and URL.
router.post(
  '/images',
  requireUser,
  asyncHandler(async (req, res) => {
    const img = await storeImage(req.user.id, req.body?.image);
    res.status(201).json({ id: img.id, url: imageUrl(img.id) });
  }),
);

// GET /api/images/:id — public, cached forever (ids never change content)
router.get(
  '/images/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().regex(/^[a-z0-9]{10,40}$/).parse(req.params.id);
    const img = await prisma.image.findUnique({ where: { id } });
    if (!img) throw new HttpError(404, 'Image not found');
    res.set({
      'Content-Type': img.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // The site and API live on different domains
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(Buffer.from(img.data));
  }),
);

// GET /api/profiles/:address — public profile for a wallet (used next to names across the app)
router.get(
  '/profiles/:address',
  asyncHandler(async (req, res) => {
    const address = lower(z.string().regex(/^0x[a-fA-F0-9]{40}$/).parse(req.params.address));
    const [user, tutor] = await Promise.all([
      prisma.user.findUnique({ where: { wallet: address } }),
      prisma.tutor.findUnique({ where: { address } }),
    ]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ profile: { ...publicProfile(user, tutor), address } });
  }),
);

module.exports = { router, publicProfile, imageUrl };
