# BiePay Links: The Social Commerce Layer for Solana 🚀

**Built for the Solana Frontier Hackathon (Colosseum)**

BiePay Links allows anyone—from independent freelancers in Nigeria to global e-commerce brands—to sell anything, anywhere, instantly using **Solana Blinks and Actions**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Solana](https://img.shields.io/badge/Powered%20by-Solana-blueviolet)](https://solana.com)

---

## 🏆 Frontier Hackathon Tracks 

We have specifically engineered BiePay Links to maximize value across the Solana ecosystem. Here is how we proudly support the hackathon bounty tracks:

### 🇳🇬 Superteam Nigeria 
**The Problem:** Nigerian freelancers and SMEs are locked out of the global economy due to extreme FX volatility, high remittance fees, and payment gateways that refuse to operate in the region.
**The BiePay Solution:** A Nigerian designer can create a BiePay Link, post it on Twitter/X, and get paid instantly in stablecoins by a client in the US. No banks, no 5-day holds, no 7% currency conversion fees. BiePay is the cross-border payment rails Nigeria deserves.

### 💵 Tether USDT 
Tether is the lifeblood of emerging markets. **BiePay Links explicitly supports USDT** as a first-class settlement currency. Merchants can choose to price and settle their links exclusively in Tether, protecting themselves from local currency inflation while tapping into the $100B+ USDT liquidity on Solana.

### 🪐 Jupiter: 
We integrated the **Jupiter Terminal** natively into the BiePay Merchant Dashboard.
When a merchant receives payments in SOL or BONK, they can click our **"Swap Earnings"** button. This opens the Jupiter best-price routing modal, pre-filled to swap their earnings directly into USDC, entirely within the dashboard.

### 📛 SNS Identity 
We brought **Bonfida's SPL Name Service** directly to the merchant experience. When a merchant uses our "Withdraw Funds" modal to sweep their earnings, they don't need to copy-paste complex `7xKXtg...` addresses. They can simply type `michie.sol`, and BiePay instantly resolves the `.sol` domain on-chain to ensure funds go to the exact right place.

### 📊 Dune Analytics 
Data is everything for businesses. We built a comprehensive analytics suite directly into the dashboard, featuring real-time volume, lifetime revenue, active links, and payment velocity charts—bringing Dune-level insights to the merchant's fingertips.

### 🕵️ Cloak / Privacy Payments 
To respect merchant privacy, we built an **"Incognito Mode"** into the dashboard. With one click, all lifetime volume, active balance, and payment counts are obscured (`****`). This ensures business owners can safely demonstrate their dashboards or work in public spaces without revealing sensitive financial metrics.

---

## 🌟 The Killer Feature: Blinks

Traditional cross-border payments are trapped behind "walled gardens" and redirect links. 

**BiePay Links turns your checkout into a Blink (Solana Action).**
Instead of a user clicking a link to go to a Vercel site, they see the "Pay" button **directly inside their Twitter/X feed or Discord**. 
Every BiePay link automatically generates a `dial.to/?action=solana-action...` Blink URL. If a judge sees a BiePay link in a tweet, they can pay the invoice without ever leaving Twitter. We are turning the timeline into a checkout counter.

---

## 🚀 Quick Links & Demo

- **Live Dashboard**: [https://biepay-links-dwkq-eight.vercel.app](https://biepay-links-dwkq-eight.vercel.app)
- **Actions API**: [https://biepay-links-production.up.railway.app](https://biepay-links-production.up.railway.app)
- **Video Demo**: [Insert YouTube/Loom Link Here - REPLACE BEFORE DEADLINE]
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
*Note: Smart contracts are pre-deployed to Devnet; no local Anchor setup is required for testing.*

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

**Terminal 1: Backend API**
```bash
cd biepay-links-out
npm install
npm run dev
```

**Terminal 2: Frontend Dashboard**
```bash
cd biepay-dashboard-out
npm install
npm run dev
```

### Environment Variables

For the application to run successfully, you must configure the following critical environment variables. 

**Frontend (`biepay-dashboard-out/.env.local`):**
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ACTION_BASE_URL=https://your-ngrok-url.ngrok-free.app # Required for local Blinks
```

**Backend (`biepay-links-out/.env`):**
```env
PORT=3001
DATABASE_URL="file:./dev.db"
RPC_ENDPOINT=https://api.devnet.solana.com
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

### Local Networking (The "CORS" Trap)
If you are testing the **Solana Blinks** functionality locally on your machine, you must use a secure tunnel (like `ngrok` or `localtunnel`). 
Solana's blockchain and wallets (like Phantom) cannot resolve `http://localhost:3001`. 
1. Run `ngrok http 3001`
2. Set your `NEXT_PUBLIC_ACTION_BASE_URL` in the frontend to the secure HTTPS ngrok URL.
*(If you are just testing the dashboard UI, standard localhost is fine).*

---

## ❓ Troubleshooting / FAQ

**Q: The Jupiter Swap tokens are missing or showing `?`**
A: Jupiter only supports Mainnet-Beta. Ensure your network connection is stable; the dashboard forces the terminal to use a Mainnet RPC to resolve tokens even when the app is on Devnet.

**Q: "Your RPC is not responding to any requests"**
A: Public RPCs are heavily rate-limited. We recommend waiting a few seconds or utilizing a dedicated RPC key in production.

**Q: I created a link but cannot delete it?**
A: Due to the enterprise BOLA security we implemented, you must ensure your `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are correctly set in the backend `.env`. If they are missing, the backend defaults to a secure fallback that may reject deletions.

---

## ⚖️ License
MIT © 2026 BiePay Links Team.
