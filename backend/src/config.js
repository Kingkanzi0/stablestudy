const { z } = require('zod');
require('dotenv').config();

const NETWORKS = {
  mainnet: {
    id: 5042,
    name: 'Arc',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
  },
  testnet: {
    id: 5042002,
    name: 'Arc Testnet',
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorer: 'https://explorer.testnet.arc.io',
  },
  local: {
    id: 31337,
    name: 'Local (Anvil)',
    rpcUrl: 'http://127.0.0.1:8545',
    explorer: '',
  },
};

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed address');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:5001'),
  ARC_NETWORK: z.enum(['mainnet', 'testnet', 'local']).default('testnet'),
  RPC_URL: z.string().url().optional(),
  SKILLPAY_ADDRESS: address,
  START_BLOCK: z.coerce.bigint().default(0n),
  INDEXER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  INDEXER_BLOCK_RANGE: z.coerce.bigint().default(5000n),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('   See backend/.env.example');
  process.exit(1);
}

const env = parsed.data;
const network = NETWORKS[env.ARC_NETWORK];

module.exports = {
  env,
  network: { ...network, key: env.ARC_NETWORK, rpcUrl: env.RPC_URL || network.rpcUrl },
  allowedOrigins: env.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean),
  contractAddress: env.SKILLPAY_ADDRESS.toLowerCase(),
  USDC_DECIMALS: 6,
};
