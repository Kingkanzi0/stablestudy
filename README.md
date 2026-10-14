# SkillPay

**Learn from anyone. Pay them in seconds.**

SkillPay is a tutoring marketplace on [Arc](https://arc.io), Circle's stablecoin-native Layer 1. Students pay for courses in USDC; the payment is split inside one transaction (90% to the tutor, 10% platform fee) and settles with deterministic finality in under a second. SkillPay never holds user funds.

> Previously **StableStudy**. v2 replaces the mock payment flow with a real, tested smart contract, wallet sign-in, on-chain verification and a redesigned app.

Live demo: https://stablestudy.vercel.app (will move to the SkillPay domain)

---

## Why Arc

| Arc feature | How SkillPay uses it |
| --- | --- |
| USDC as gas | Students and tutors only ever hold one currency. No ETH needed. |
| Sub-second deterministic finality | Lessons unlock the moment a payment lands. No “waiting for confirmations”. |
| EVM compatibility | Standard Solidity, Foundry, viem and wagmi. |
| Low, predictable fees | Courses can be priced from 0.01 USDC, so micro-courses are viable. |

## How it works

```
Student wallet ──approve + enroll(courseId)──▶ SkillPay contract
                                                 │  (same transaction)
                                                 ├──▶ 90% USDC → tutor wallet
                                                 └──▶ 10% USDC → treasury
                       Enrolled event ──▶ API indexer ──▶ lessons unlocked
```

- **On-chain (source of truth):** tutors, courses, prices, enrolments, payments.
- **Off-chain (API + Postgres):** course text and lessons, tutor profiles, and a fast index of on-chain events. Each course's `metadataURI` on-chain points at its public metadata in the API.
- **Lesson content** is only served to wallets that have paid. The API checks its index first, then the contract itself (`isEnrolled`) if the indexer hasn't caught up.

## Features

**Students**: browse and search courses, see the exact on-chain price split before paying, pay with any browser wallet, access lessons immediately, keep a permanent receipt on Arcscan.

**Tutors**: free registration, course editor with lessons, video and resource links, publish on-chain with a USDC price, change price or hide courses at any time, live earnings dashboard and sales history. Earnings arrive instantly, so there's nothing to withdraw.

**Web3 jobs board**: anyone signed in with a wallet can post roles, contracts and bounties (with USDC pay ranges); learners browse, filter and apply, and each job links to related SkillPay courses.

**Platform**: fee capped at 20% in the contract, pause switch for emergencies, tutor and course moderation, two-step ownership transfer.

## Repository layout

```
contracts/   Solidity contract (Foundry): SkillPay.sol, 32 tests incl. fuzzing, deploy script
backend/     Node.js API: Express, Prisma/PostgreSQL, viem indexer, Sign-In with Ethereum
frontend/    React + Vite + wagmi app
docs/        Deployment guide and demo script
```

## Quick start (local)

Prerequisites: Node.js 20+, PostgreSQL, [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
# 1. Contracts: install deps and run the tests
cd contracts
./setup.sh
forge test

# 2. Local chain with a mock USDC and the SkillPay contract
anvil                                   # in its own terminal
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil test key, never use for real funds
forge create test/mocks/MockUSDC.sol:MockUSDC --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
# copy the "Deployed to" address, then:
USDC_ADDRESS=<mock usdc> TREASURY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
# mint yourself test USDC:
cast send <mock usdc> "mint(address,uint256)" <your wallet> 1000000000 --rpc-url http://127.0.0.1:8545 --private-key $PK

# 3. Backend
cd ../backend
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, ARC_NETWORK=local, SKILLPAY_ADDRESS
npm install
npx prisma migrate deploy
npm run dev

# 4. Frontend
cd ../frontend
cp .env.example .env        # VITE_ARC_NETWORK=local, VITE_SKILLPAY_ADDRESS, VITE_LOCAL_USDC_ADDRESS
npm install
npm run dev
```

Open http://localhost:5173. Add the Anvil network (chain id 31337, RPC http://127.0.0.1:8545) to your wallet if it isn't added automatically.

To run against **Arc Testnet** instead, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Test USDC is available from the [Circle faucet](https://faucet.circle.com).

## Network reference

| | Arc Mainnet | Arc Testnet |
| --- | --- | --- |
| Chain ID | 5042 | 5042002 |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |

Source: [Arc docs](https://docs.arc.io/arc/references/connect-to-arc).

## Roadmap

- **Crosschain checkout with CCTP**: pay from Base, Ethereum or Solana USDC; burn-and-mint lands on Arc and enrols in one flow.
- **Local-currency pricing with StableFX**: show and settle prices in EURC and other supported currencies.
- **Tutor payouts to bank** via Circle Payments Network.
- **Completion certificates** as non-transferable on-chain credentials.
- **WalletConnect** for mobile wallets.

## Security

The contract is non-custodial: `enroll` moves USDC straight from student to tutor and treasury, so a bug cannot drain a pool of deposits. It uses OpenZeppelin `SafeERC20`, `ReentrancyGuard`, `Pausable` and `Ownable2Step`, enforces a hard fee cap, and protects students from price changes with a `maxPrice` argument. It has **not** been professionally audited yet. Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#before-mainnet) before deploying with real funds.

## License

MIT
