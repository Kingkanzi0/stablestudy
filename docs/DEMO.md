# iSabi demo script (Arc House builders check-in)

About 4 minutes. Have two browser profiles ready: **Tutor** and **Student**, both with test USDC on Arc Testnet, and the iSabi contract open on Arcscan in a third tab.

## 1. The problem (30 s)

Freelance tutors teaching across borders lose days and a big cut to payouts: platform holds, bank transfers, FX fees. Students in many countries can't easily pay them at all.

## 2. The idea (20 s)

iSabi is a tutoring marketplace on Arc. Students pay in USDC, the tutor gets 90% in the same transaction, and it's final in under a second. iSabi never holds the money.

## 3. Live: tutor publishes a course (60 s)

In the **Tutor** profile:

1. Teach → signed-in dashboard (earnings, enrolments, courses).
2. New course → title, two lessons → Save draft.
3. Publish → set **1 USDC** → confirm in wallet.

Point out: price and ownership now live on-chain; the course text is off-chain metadata linked by URI.

## 4. Live: student pays and learns (60 s)

In the **Student** profile:

1. Explore → open the new course. The payment panel shows the split read directly from the contract.
2. Approve and pay → two wallet prompts → "You're enrolled" appears almost instantly.
3. Start learning → lessons unlock.

Switch to Arcscan: one transaction, two USDC transfers (0.90 to tutor, 0.10 to treasury). Switch to the tutor dashboard: the sale is already there.

## 5. Under the hood (40 s)

- `SkillPay.sol`: non-custodial, fee hard-capped at 20%, `maxPrice` protects students if a tutor changes the price, pause and moderation, 32 Foundry tests including fuzzing of the split.
- API indexes contract events and gates lesson content behind Sign-In with Ethereum plus an on-chain `isEnrolled` check.
- Arc specifics: USDC gas, USDC ERC-20 interface at `0x3600…0000` with 6 decimals, deterministic finality so no reorg handling.

## 6. Next (20 s)

CCTP checkout so students can pay from any chain, StableFX for local-currency pricing, completion credentials on-chain, then mainnet launch.

## Ask

Feedback on the CCTP checkout flow, and intros to tutors or learning communities who want to pilot it.
