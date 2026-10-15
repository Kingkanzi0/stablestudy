# SkillPay verifier agent

The agent that decides whether escrow work meets its spec. It:

1. reads its queue of delivered orders from the SkillPay API,
2. opens the delivery link and asks Claude to check it against each acceptance criterion,
3. saves a written report (both parties can read it on the order page),
4. signs `verify(orderId, approved, reportHash)` on the SkillPayEscrow contract from its own **Circle Agent Wallet** on Arc.

The escrow contract only lets the agent **release** payment to the provider or mark a delivery **rejected**. It can never send funds anywhere else. Approval needs every criterion met; that rule is enforced in code, not left to the model. The client can always approve directly, and disputes go to a human arbiter.

## Set up (once)

You need Node.js 20.18+.

```bash
# 1. Circle CLI + an agent wallet on Arc
npm install -g @circle-fin/cli
circle wallet login you@example.com --testnet        # enter the emailed code yourself
circle wallet list --type agent --chain ARC-TESTNET   # copy the address
circle wallet fund --address <agent address> --chain ARC-TESTNET   # 20 test USDC for gas

# 2. The agent
cd agent
npm install
cp .env.example .env   # then fill it in (see below)
```

Fill in `.env`:

| Setting | Value |
| --- | --- |
| `SKILLPAY_API_URL` | Your API, e.g. `https://skillpay-api-gc6o.onrender.com/api` |
| `AGENT_API_KEY` | The same value as `AGENT_API_KEY` in Render |
| `ESCROW_ADDRESS` | The SkillPayEscrow contract |
| `AGENT_ADDRESS` | The agent wallet from `circle wallet list` |
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) |

The escrow's `verifier` must be this agent wallet address (set at deployment, or later with `setVerifier`).

## Run

```bash
npm run once     # review whatever is waiting, then stop
npm start        # keep running, checking every 30 seconds
```

Set `DRY_RUN=true` to write reports without signing anything on-chain.

## Testing without Circle or Claude

`SIGNER=key` with `AGENT_PRIVATE_KEY`, and `JUDGE=mock` (approves unless the provider's notes contain `REJECT`). Mock judging is refused on mainnet. `npm test` runs the unit tests; CI also runs a full end-to-end test on a local chain.
