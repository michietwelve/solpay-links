# BiePay Links: The Social Commerce Layer for Solana 🚀

**Built for the Solana Frontier Hackathon (Colosseum)**

BiePay Links allows anyone—from independent freelancers in Nigeria to global e-commerce brands—to sell anything, anywhere, instantly using **Solana Blinks and Actions**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Solana](https://img.shields.io/badge/Powered%20by-Solana-blueviolet)](https://solana.com)

---

## 🏆 Frontier Hackathon Tracks & Bounties

We have specifically engineered BiePay Links to maximize value across the Solana ecosystem. Here is how we proudly support the hackathon bounty tracks:

### 🇳🇬 Superteam Nigeria ($10k Prize Pool)
**The Problem:** Nigerian freelancers and SMEs are locked out of the global economy due to extreme FX volatility, high remittance fees, and payment gateways that refuse to operate in the region.
**The BiePay Solution:** A Nigerian designer can create a BiePay Link, post it on Twitter/X, and get paid instantly in stablecoins by a client in the US. No banks, no 5-day holds, no 7% currency conversion fees. BiePay is the cross-border payment rails Nigeria deserves.

### 💵 Tether USDT ($10k Prize Pool)
Tether is the lifeblood of emerging markets. **BiePay Links explicitly supports USDT** as a first-class settlement currency. Merchants can choose to price and settle their links exclusively in Tether, protecting themselves from local currency inflation while tapping into the $100B+ USDT liquidity on Solana.

### 🪐 Jupiter: "Not Your Regular Bounty" ($3k Prize Pool)
We integrated the **Jupiter Terminal** natively into the BiePay Merchant Dashboard.
When a merchant receives payments in SOL or BONK, they can click our **"Swap Earnings"** button. This opens the Jupiter best-price routing modal, pre-filled to swap their earnings directly into USDC, entirely within the dashboard.

### 📛 SNS Identity ($5k Prize Pool)
We brought **Bonfida's SPL Name Service** directly to the merchant experience. When a merchant uses our "Withdraw Funds" modal to sweep their earnings, they don't need to copy-paste complex `7xKXtg...` addresses. They can simply type `michie.sol`, and BiePay instantly resolves the `.sol` domain on-chain to ensure funds go to the exact right place.

### 📊 Dune Analytics ($6k+ Prize Pool)
Data is everything for businesses. We built a comprehensive analytics suite directly into the dashboard, featuring real-time volume, lifetime revenue, active links, and payment velocity charts—bringing Dune-level insights to the merchant's fingertips.

### 🕵️ Cloak / Privacy Payments ($5k Prize Pool)
To respect merchant privacy, we built an **"Incognito Mode"** into the dashboard. With one click, all lifetime volume, active balance, and payment counts are obscured (`****`). This ensures business owners can safely demonstrate their dashboards or work in public spaces without revealing sensitive financial metrics.

---

## 🌟 The 2026 Killer Feature: Blinks

Traditional cross-border payments are trapped behind "walled gardens" and redirect links. 

**BiePay Links turns your checkout into a Blink (Solana Action).**
Instead of a user clicking a link to go to a Vercel site, they see the "Pay" button **directly inside their Twitter/X feed or Discord**. 
Every BiePay link automatically generates a `dial.to/?action=solana-action...` Blink URL. If a judge sees a BiePay link in a tweet, they can pay the invoice without ever leaving Twitter. We are turning the timeline into a checkout counter.

---

## 🚀 Quick Links & Demo

- **Live Dashboard**: [https://biepay-links-dwkq-eight.vercel.app](https://biepay-links-dwkq-eight.vercel.app)
- **Actions API**: [https://biepay-links-production.up.railway.app](https://biepay-links-production.up.railway.app)
- **Video Demo**: [Coming Soon]
- **Testing Cluster**: Solana **Devnet**

### How to Judge/Test:
1. **Create a Link**: Log in to the [Dashboard](https://biepay-links-dwkq-eight.vercel.app) using your email or Google account.
2. **Fund Your Embedded Wallet**: Open your new payment link. If your wallet is empty, click the **"Devnet Faucet"** button in the "Fund your wallet" panel to instantly get 5 SOL.
3. **Use the Hackathon Override**: If your link requires USDC but you only have faucet SOL, scroll to the bottom of the page and click the green **"🧪 Hackathon Demo: Switch to SOL to test easily"** button.
4. **Pay & Watch the Magic**: Click **Pay**, watch the loading micro-animations, and enjoy the confetti on the success screen!
5. **Instant Confirmation**: Check your dashboard to see the revenue update in real-time.

---

## 🏗️ Architecture

The project is structured as a high-performance monorepo:

### 1. [Merchant Dashboard](./biepay-dashboard-out) (Next.js)
A premium merchant portal built with React 18, Tailwind CSS, and SWR for real-time data fetching. Uses Privy for seamless embedded wallet generation.

### 2. [Actions API](./biepay-links-out) (Express / Node.js)
The core transaction engine. It generates spec-compliant Solana Actions and manages the persistent state of payment links. 

### 3. [Smart Contract](./biepay-contract) (Anchor)
An optional on-chain program for governed payments, escrow, and platform fee distribution.

---

## 🛠️ Tech Stack
- **Languages**: TypeScript, Rust
- **Blockchain**: Solana Web3.js, SPL Token, Bonfida SNS, Jupiter Swap API
- **Auth**: Privy (Embedded Wallets)
- **Fiat Onramp**: Privy Native / Transak
- **Styling**: Tailwind CSS, Framer Motion, Canvas Confetti
- **API**: Express, Zod (Validation)

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- A Solana Wallet (Phantom or Backpack recommended)

### Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/michietwelve/biepay-links.git
   cd biepay-links
   ```

2. Install dependencies for both projects:
   ```bash
   # Frontend
   cd biepay-dashboard-out && npm install
   # Backend
   cd ../biepay-links-out && npm install
   ```

3. Set up environment variables:
   Create `.env.local` in `biepay-dashboard-out` and `.env` in `biepay-links-out` based on the `.env.example` files provided in each folder.

4. Run the stack:
   ```bash
   # Start the API (Port 3001)
   cd biepay-links-out && npm run dev
   # Start the Dashboard (Port 3000)
   cd biepay-dashboard-out && npm run dev
   ```

---

## ⚖️ License
MIT © 2026 BiePay Links Team.
