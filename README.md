# SolPay Links: The Social Commerce Layer for Solana 🚀

**Built for the Solana Frontier Hackathon (Colosseum)**

SolPay Links allows anyone—from independent freelancers in Nigeria to global e-commerce brands—to sell anything, anywhere, instantly using **Solana Blinks and Actions**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Solana](https://img.shields.io/badge/Powered%20by-Solana-blueviolet)](https://solana.com)

---

## 🌟 The Vision
Traditional cross-border payments are slow, expensive, and trapped behind "walled gardens." SolPay Links breaks these walls by turning a simple URL into a complete checkout experience that lives inside your favorite social apps.

### Key Features
- **Instant Blinks**: Share a payment link on X, WhatsApp, or Discord. It renders as a native payment card in Phantom, Backpack, and other Action-compliant wallets.
- **Merchant Dashboard**: A sleek, high-performance interface for creating links, tracking revenue, and managing customers.
- **No-Crypto-Needed Onboarding**: Integrated with **Privy** for email/social login and **MoonPay** for direct fiat-to-USDC/SOL purchases.
- **Infrastructure Grade**: Real-time on-chain payment detection via our proprietary Memo-based listener.

---

## 🏆 Frontier Hackathon Submission (Devnet)

- **Live Dashboard**: [https://solpay-links-dwkq-eight.vercel.app](https://solpay-links-dwkq-eight.vercel.app)
- **Actions API**: [https://solpay-links-production.up.railway.app](https://solpay-links-production.up.railway.app)
- **Video Demo**: [Coming Soon]
- **Testing Cluster**: Solana **Devnet**

### How to Judge/Test:
1. **Get Devnet SOL**: Visit [solfaucet.com](https://solfaucet.com) and fund your wallet.
2. **Create a Link**: Log in to the [Dashboard](https://solpay-links-dwkq-eight.vercel.app) using your email or Google account (powered by Privy).
3. **Share & Pay**: Copy your SolPay Link and paste it into any Action-compatible environment (e.g., [Dial.to](https://dial.to) or X).
4. **Instant Confirmation**: Watch the dashboard update in real-time as our listener detects your transaction!

---

## 🏗️ Architecture

The project is structured as a high-performance monorepo:

### 1. [Merchant Dashboard](./solpay-dashboard-out) (Next.js)
A premium merchant portal built with React 18, Tailwind CSS, and SWR for real-time data fetching. Uses Privy for seamless embedded wallet generation.

### 2. [Actions API](./solpay-links-out) (Express / Node.js)
The core transaction engine. It generates spec-compliant Solana Actions and manages the persistent state of payment links. 
- **Payment Listener**: A background worker that monitors the Solana network for payments.
- **Persistence**: File-based JSON storage (optimized for speed/portability).

### 3. [Smart Contract](./solpay-contract) (Anchor)
An optional on-chain program for governed payments, escrow, and platform fee distribution.

---

## 🛠️ Tech Stack
- **Languages**: TypeScript, Rust
- **Blockchain**: Solana Web3.js, SPL Token
- **Auth**: Privy (Embedded Wallets)
- **Payments**: MoonPay (Fiat-to-Crypto)
- **Styling**: Tailwind CSS
- **API**: Express, Zod (Validation)

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- A Solana Wallet (Phantom or Backpack recommended)

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/michietwelve/solpay-links.git
   cd solpay-links
   ```

2. Install dependencies for both projects:
   ```bash
   # Frontend
   cd solpay-dashboard-out && npm install
   # Backend
   cd ../solpay-links-out && npm install
   ```

3. Set up environment variables:
   Create `.env.local` in `solpay-dashboard-out` and `.env` in `solpay-links-out` based on the `.env.example` files provided in each folder.

4. Run the stack:
   ```bash
   # Start the API (Port 3001)
   cd solpay-links-out && npm run dev
   # Start the Dashboard (Port 3000)
   cd solpay-dashboard-out && npm run dev
   ```

---

## ⚖️ License
MIT © 2026 SolPay Links Team.
