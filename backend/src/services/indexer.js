const { decodeEventLog } = require('viem');
const { prisma } = require('../db');
const { publicClient, skillPay, escrow } = require('../chain');
const { processEscrowLog } = require('./escrow');
const { env, contractAddress } = require('../config');
const { lower } = require('../utils');

const COURSE_URI_RE = /\/api\/metadata\/courses\/([a-z0-9]+)\/?$/i;

function shortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function ensureTutor(address) {
  return prisma.tutor.upsert({
    where: { address },
    update: {},
    create: { address, displayName: shortAddress(address) },
  });
}

function decode(log) {
  try {
    return decodeEventLog({ abi: skillPay.abi, data: log.data, topics: log.topics });
  } catch {
    return null; // not a SkillPay event we know about
  }
}

const handlers = {
  async TutorRegistered({ tutor }) {
    const address = lower(tutor);
    await ensureTutor(address);
    await prisma.tutor.update({ where: { address }, data: { registered: true } });
  },

  async TutorSuspended({ tutor, suspended }) {
    const address = lower(tutor);
    await ensureTutor(address);
    await prisma.tutor.update({ where: { address }, data: { suspended } });
  },

  async CourseCreated({ courseId, tutor, price, metadataURI }, log) {
    const onchainId = Number(courseId);
    const tutorAddress = lower(tutor);
    const existing = await prisma.course.findUnique({ where: { onchainId } });
    if (existing) return;

    await ensureTutor(tutorAddress);
    const data = {
      onchainId,
      status: 'PUBLISHED',
      priceUnits: price.toString(),
      active: true,
      createdTx: log.transactionHash,
    };

    // Link to the draft whose metadata URI was used, but only if the same tutor owns it.
    const match = COURSE_URI_RE.exec(metadataURI || '');
    if (match) {
      const draft = await prisma.course.findUnique({ where: { id: match[1] } });
      if (draft && draft.tutorAddress === tutorAddress && draft.onchainId === null) {
        await prisma.course.update({ where: { id: draft.id }, data });
        return;
      }
    }

    // Course created outside the SkillPay app: keep a placeholder so enrolments still index.
    await prisma.course.create({
      data: {
        ...data,
        tutorAddress,
        title: `Course #${onchainId}`,
        summary: 'Published directly on-chain.',
        description: metadataURI ? `Metadata: ${metadataURI}` : '',
        category: 'Other',
        level: 'All levels',
      },
    });
  },

  async CourseUpdated({ courseId, price, active }) {
    await prisma.course.updateMany({
      where: { onchainId: Number(courseId) },
      data: { priceUnits: price.toString(), active },
    });
  },

  async Enrolled({ courseId, student, price, fee, tutorAmount }, log) {
    const onchainId = Number(courseId);
    const course = await prisma.course.findUnique({ where: { onchainId } });
    if (!course) {
      console.warn(`[indexer] Enrolled for unknown course #${onchainId}, tx ${log.transactionHash}`);
      return;
    }
    try {
      await prisma.$transaction([
        prisma.enrollment.create({
          data: {
            courseId: course.id,
            onchainId,
            student: lower(student),
            txHash: log.transactionHash,
            logIndex: Number(log.logIndex),
            blockNumber: Number(log.blockNumber),
            priceUnits: price.toString(),
            feeUnits: fee.toString(),
            tutorUnits: tutorAmount.toString(),
          },
        }),
        prisma.course.update({
          where: { id: course.id },
          data: { enrollmentCount: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      if (err.code !== 'P2002') throw err; // P2002 = already indexed
    }
  },
};

/** Processes raw logs from the SkillPay and escrow contracts. Safe to call repeatedly with the same logs. */
async function processLogs(logs) {
  const results = [];
  for (const log of logs) {
    const escrowEvent = await processEscrowLog(log);
    if (escrowEvent) {
      results.push(escrowEvent);
      continue;
    }
    if (lower(log.address) !== contractAddress) continue;
    const event = decode(log);
    if (!event) continue;
    const handler = handlers[event.eventName];
    if (handler) await handler(event.args, log);
    results.push(event.eventName);
  }
  return results;
}

/** Indexes the SkillPay events in one transaction right away (called by the app after a tx). */
async function syncTransaction(hash) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  if (receipt.status !== 'success') return { status: receipt.status, events: [] };
  const events = await processLogs(receipt.logs);
  return { status: 'success', events, blockNumber: receipt.blockNumber.toString() };
}

// ───────────── background poller ─────────────

let running = false;
let timer = null;

// Each contract is followed separately (IndexerState id 1 = SkillPay, id 2 = escrow), so the escrow
// can be deployed and added later without re-scanning SkillPay's history.
function streams() {
  const list = [{ id: 1, address: skillPay.address, start: env.START_BLOCK }];
  if (escrow) list.push({ id: 2, address: escrow.address, start: env.ESCROW_START_BLOCK });
  return list;
}

async function getLastBlock(stream) {
  const state = await prisma.indexerState.findUnique({ where: { id: stream.id } });
  return state ? state.lastBlock : stream.start > 0n ? stream.start - 1n : 0n;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const latest = await publicClient.getBlockNumber();
    for (const stream of streams()) {
      let from = (await getLastBlock(stream)) + 1n;
      while (from <= latest) {
        const to = from + env.INDEXER_BLOCK_RANGE - 1n < latest ? from + env.INDEXER_BLOCK_RANGE - 1n : latest;
        const logs = await publicClient.getLogs({ address: stream.address, fromBlock: from, toBlock: to });
        await processLogs(logs);
        await prisma.indexerState.upsert({
          where: { id: stream.id },
          update: { lastBlock: to },
          create: { id: stream.id, lastBlock: to },
        });
        from = to + 1n;
      }
    }
  } catch (err) {
    console.error('[indexer] error:', err.shortMessage || err.message);
  } finally {
    running = false;
  }
}

function startIndexer() {
  if (!env.INDEXER_ENABLED) {
    console.log('[indexer] disabled');
    return;
  }
  console.log(`[indexer] watching ${streams().map((s) => s.address).join(', ')} every ${env.INDEXER_INTERVAL_MS}ms`);
  tick();
  timer = setInterval(tick, env.INDEXER_INTERVAL_MS);
}

function stopIndexer() {
  if (timer) clearInterval(timer);
}

module.exports = { processLogs, syncTransaction, startIndexer, stopIndexer, COURSE_URI_RE };
