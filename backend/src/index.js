const { env, network, contractAddress } = require('./config');
const app = require('./app');
const { prisma } = require('./db');
const { startIndexer, stopIndexer } = require('./services/indexer');

const server = app.listen(env.PORT, () => {
  console.log(`iSabi API listening on http://localhost:${env.PORT}`);
  console.log(`Network: ${network.name} (chain ${network.id})`);
  console.log(`Contract: ${contractAddress}`);
  startIndexer();
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopIndexer();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
