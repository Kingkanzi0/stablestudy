const { formatUsdc } = require('./utils');
const { env } = require('./config');

const CATEGORIES = [
  'Web3 Development',
  'Smart Contracts',
  'Payments & Stablecoins',
  'DeFi',
  'Design',
  'Data & AI',
  'Business',
  'Languages',
  'Other',
];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];

const courseMetadataUri = (id) => `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/metadata/courses/${id}`;
const tutorMetadataUri = (address) =>
  `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/metadata/tutors/${address}`;

function tutorSummary(t) {
  if (!t) return null;
  return {
    address: t.address,
    displayName: t.displayName,
    headline: t.headline,
    avatarUrl: t.avatarUrl,
    registered: t.registered,
    suspended: t.suspended,
  };
}

function lessonOutline(l) {
  return { position: l.position, title: l.title, hasVideo: Boolean(l.videoUrl) };
}

function lessonFull(l) {
  return {
    position: l.position,
    title: l.title,
    content: l.content,
    videoUrl: l.videoUrl,
    resourceUrl: l.resourceUrl,
  };
}

function course(c) {
  return {
    id: c.id,
    onchainId: c.onchainId,
    title: c.title,
    summary: c.summary,
    description: c.description,
    category: c.category,
    level: c.level,
    durationMinutes: c.durationMinutes,
    coverColor: c.coverColor,
    status: c.status,
    active: c.active,
    priceUnits: c.priceUnits,
    price: formatUsdc(c.priceUnits),
    enrollmentCount: c.enrollmentCount,
    createdTx: c.createdTx,
    createdAt: c.createdAt,
    metadataURI: courseMetadataUri(c.id),
    tutor: tutorSummary(c.tutor),
    lessonCount: c.lessons ? c.lessons.length : undefined,
    lessons: c.lessons ? [...c.lessons].sort((a, b) => a.position - b.position).map(lessonOutline) : undefined,
  };
}

function enrollment(e) {
  return {
    id: e.id,
    onchainId: e.onchainId,
    student: e.student,
    txHash: e.txHash,
    blockNumber: e.blockNumber,
    price: formatUsdc(e.priceUnits),
    fee: formatUsdc(e.feeUnits),
    tutorAmount: formatUsdc(e.tutorUnits),
    createdAt: e.createdAt,
    course: e.course ? course(e.course) : undefined,
  };
}

module.exports = {
  CATEGORIES,
  LEVELS,
  courseMetadataUri,
  tutorMetadataUri,
  tutorSummary,
  lessonFull,
  course,
  enrollment,
};
