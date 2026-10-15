# Deploying SkillPay

Deploy to **Arc Testnet first**, run the full demo there, then repeat the same steps on **Arc Mainnet**. The only differences are the RPC, the network name in env files, and that mainnet uses real USDC.

You'll deploy three things:

| Part | Where | What it needs |
| --- | --- | --- |
| Smart contract | Arc | A deployer wallet with a little USDC for gas |
| Backend API | Render, Railway or Fly.io | PostgreSQL database, env vars |
| Frontend | Vercel | env vars |

---

## 1. Prepare wallets

Use separate wallets for separate jobs:

- **Deployer**: only sends the deploy transaction. Needs about 1 USDC for gas.
- **Owner**: controls fee, pause and moderation. On mainnet use a multisig such as [Safe](https://safe.global) if it's available on Arc, or at minimum a hardware wallet.
- **Treasury**: receives the 10% platform fee. Can be the same multisig.

Never paste a private key into a `.env` file or a terminal command. Import the deployer into Foundry's encrypted keystore instead:

```bash
cast wallet import skillpay-deployer --interactive
```

Testnet USDC: https://faucet.circle.com (select Arc Testnet).

## 2. Deploy the contract

```bash
cd contracts
./setup.sh
forge test                        # must be all green

export TREASURY=0xYourTreasury
export OWNER=0xYourOwner
export FEE_BPS=1000               # 10%

# Testnet
forge script script/Deploy.s.sol --rpc-url arc_testnet --account skillpay-deployer --broadcast

# Mainnet (after testnet is fully tested)
forge script script/Deploy.s.sol --rpc-url arc_mainnet --account skillpay-deployer --broadcast
```

The script prints the **contract address** and the **deployment block**. Save both.

Contract verification on Arcscan: check the current instructions at https://docs.arc.io, then run `forge verify-contract` with the settings they give. Verified source makes the contract readable to users and judges.

## 3. Database

Create a PostgreSQL database (Render, Railway, Neon and Supabase all work). Copy its connection string.

## 4. Backend API

Create a web service from the `backend` folder.

- Build command: `npm install && npx prisma migrate deploy`
- Start command: `npm start`
- Environment variables:

```
NODE_ENV=production
DATABASE_URL=<your postgres url>
JWT_SECRET=<output of: openssl rand -hex 32>
PUBLIC_API_URL=https://api.your-domain.com          # the API's own public URL
CLIENT_URL=https://your-domain.com                  # the frontend URL(s), comma separated
ARC_NETWORK=testnet                                 # or mainnet
SKILLPAY_ADDRESS=<contract address from step 2>
START_BLOCK=<deployment block from step 2>
RPC_URL=<optional: Alchemy/QuickNode URL for reliability>
INDEXER_ENABLED=true
```

Important: `PUBLIC_API_URL` is written into every course's on-chain `metadataURI`. Set it to the final domain **before** tutors publish courses on mainnet, because changing it later means old courses point at the old URL.

Check it: `https://api.your-domain.com/api/health` should return `"status":"ok"` and the right chain ID.

## 5. Frontend

Import the repo into Vercel with **Root Directory** set to `frontend` (framework: Vite). Environment variables:

```
VITE_ARC_NETWORK=testnet          # or mainnet
VITE_SKILLPAY_ADDRESS=<contract address>
VITE_API_URL=https://api.your-domain.com/api
VITE_RPC_URL=<optional>
```

`vercel.json` already rewrites all routes to `index.html`, so deep links like `/courses/abc` work.

## 6. Smoke test (do this on testnet, then again on mainnet with a 0.01 USDC course)

1. Connect a wallet, go to **Teach**, sign in, save a profile, register as a tutor.
2. Create a course with two lessons, then **Publish** it at 0.01 USDC.
3. From a second wallet, open the course and pay. Check on Arcscan that the tutor received 90% and the treasury 10%.
4. Open the course from **My learning**. Lessons should load.
5. Confirm the course and sale appear on the tutor dashboard.

---

## Before mainnet

These matter because real money moves through the contract:

- [ ] All CI checks pass (contracts, backend, frontend).
- [ ] Full smoke test passed on Arc Testnet.
- [ ] Owner and treasury are a multisig or hardware wallet, not a hot wallet.
- [ ] `PUBLIC_API_URL` and `CLIENT_URL` point at final domains.
- [ ] `JWT_SECRET` is long and random, and not reused from testnet.
- [ ] Database backups are enabled.
- [ ] Contract source verified on Arcscan.
- [ ] An independent security review or audit of `SkillPay.sol`. The contract is small and non-custodial, which limits the blast radius, but it hasn't been audited.
- [ ] Terms of use and a privacy notice published on the site (you're running a marketplace with payments; check what applies where you operate).

## Operating the contract

All admin calls come from the owner wallet, for example with `cast`:

```bash
# Pause new enrolments and course creation in an emergency
cast send $SKILLPAY "pause()" --rpc-url arc_mainnet --account owner
cast send $SKILLPAY "unpause()" --rpc-url arc_mainnet --account owner

# Change the fee to 8% (max 20%)
cast send $SKILLPAY "setFeeBps(uint16)" 800 --rpc-url arc_mainnet --account owner

# Hide a course that breaks the rules / suspend a tutor
cast send $SKILLPAY "setCourseActive(uint256,bool)" 12 false --rpc-url arc_mainnet --account owner
cast send $SKILLPAY "setTutorSuspended(address,bool)" 0xTutor true --rpc-url arc_mainnet --account owner
```

---

## Escrow and the verifier agent

The escrow lets anyone hire a provider: the client's USDC is locked in `SkillPayEscrow`, and an AI verifier agent with its own Circle Agent Wallet on Arc checks the delivery against the agreed acceptance criteria before releasing it.

### 1. Create the agent wallet

On the computer that will run the agent:

```bash
npm install -g @circle-fin/cli
circle wallet login you@example.com --testnet
circle wallet list --type agent --chain ARC-TESTNET
circle wallet fund --address <agent address> --chain ARC-TESTNET
```

Keep the agent wallet address: it becomes the escrow's `verifier`.

### 2. Deploy SkillPayEscrow

Remix (same steps as SkillPay; use `SkillPayEscrow.sol`, compiler 0.8.28, EVM prague, optimizer 10000) with these constructor values:

| Field | Value |
| --- | --- |
| `usdc_` | `0x3600000000000000000000000000000000000000` |
| `treasury_` | your treasury wallet |
| `owner_` | your owner wallet |
| `verifier_` | the agent wallet address from step 1 |
| `arbiter_` | the wallet that settles disputes (you, for now) |
| `feeBps_` | `1000` (10%) |
| `reviewPeriod_` | `259200` (3 days; a delivery nobody reviews in that time can be claimed by the provider) |

Or with Foundry: `TREASURY=… OWNER=… VERIFIER=… ARBITER=… forge script script/DeployEscrow.s.sol --rpc-url arc_testnet --account skillpay-deployer --broadcast`.

Save the contract address and the deployment block.

### 3. Connect it

- **Render → skillpay-api → Environment:** add `ESCROW_ADDRESS`, `ESCROW_START_BLOCK` (deployment block) and `AGENT_API_KEY` (`openssl rand -hex 32`). Save and redeploy.
- **Vercel → stablestudy → Environment Variables:** add `VITE_ESCROW_ADDRESS`, then redeploy.

### 4. Run the agent

See [`agent/README.md`](../agent/README.md): `npm install`, fill `.env` (same `AGENT_API_KEY`, the escrow address, the agent wallet, an Anthropic API key), then `npm start`.

### 5. Test the flow (two wallets)

1. Wallet A: **Escrow → Hire with escrow**, enter wallet B as the provider, two criteria, 1 USDC, lock it.
2. Wallet B: open the order, **Accept**, then submit a link that meets only one criterion. The agent should reject it, with a report.
3. Wallet B: submit a link that meets both. The agent should approve, and wallet B should receive 0.90 USDC.

### Running the arbiter

Disputed orders wait for `resolve(orderId, providerShareBps)` from the arbiter wallet (Remix → Deployed Contracts → `resolve`). `providerShareBps` is the provider's share out of 10000, e.g. `6000` = 60% to the provider (minus the fee) and 40% back to the client.
