# 📚 StableStudy

**Learn with USDC on Arc Testnet** - A Web3 tutoring platform connecting students and tutors with instant USDC payments.

[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-purple)](https://docs.arc.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌐 Live Demo

**https://stablestudy.vercel.app**

---

## 📖 About

StableStudy is a Web3 tutoring platform built on **Arc Testnet** where students pay with USDC and tutors earn instantly.

### Features
- 💎 **Instant USDC payments** - No banks, no delays
- 🔒 **Transparent on-chain transactions** - Full visibility
- 🌍 **Global access** - Connect with anyone, anywhere
- 📈 **Sustainable 10% platform fee**

---

## 📊 Course Pricing

| Course | Price | Platform Fee (10%) | Tutor Receives |
|--------|-------|-------------------|----------------|
| Web3 Development | 1 USDC | 0.10 USDC | 0.90 USDC |
| DeFi Strategies | 1.5 USDC | 0.15 USDC | 1.35 USDC |
| Smart Contracts | 2 USDC | 0.20 USDC | 1.80 USDC |
| Arc Integration | 1.5 USDC | 0.15 USDC | 1.35 USDC |

---

## 🎯 How It Works

### For Students
1. Connect wallet
2. Browse courses
3. Pay with USDC (1-2 USDC)
4. Start learning instantly

### For Tutors
1. Register with 0.1 USDC
2. Create courses
3. Earn USDC when students enroll
4. Withdraw anytime

---

## 🛠️ Tech Stack

- **Frontend:** React 18 + Vite + Wagmi + ConnectKit
- **Backend:** Node.js + Express + PostgreSQL + Prisma
- **Blockchain:** Arc Testnet + USDC

---

## 🚀 Quick Start

```bash
git clone https://github.com/Kingkanzi0/stablestudy.git
cd stablestudy/backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

# New terminal
cd ../frontend
npm install
npm run dev
