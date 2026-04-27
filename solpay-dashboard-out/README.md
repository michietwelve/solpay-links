# SolPay Links — Merchant Dashboard

Next.js 14 App Router dashboard for creating and managing Solana payment links.

## Quick start

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL to your running solpay-links-api URL
npm run dev
# Open http://localhost:3001
```

## Stack
- **Next.js 14** App Router
- **@solana/wallet-adapter** — Phantom connect
- **SWR** — data fetching with 15s auto-refresh
- **Tailwind CSS** — utility styling

## Key files
```
app/
  layout.tsx          — wallet adapter + providers
  dashboard/page.tsx  — main dashboard (stats, table, modals)
components/
  dashboard/
    CreateLinkForm.tsx — validated form → POST /api/links
    ShareModal.tsx     — Blink/Action/PayPage URL + QR
hooks/
  useLinks.ts         — SWR hooks: useLinks, useStats, createLink
lib/
  api.ts              — typed fetch client for the Express API
```

## Features
- Live payment stats (volume, count, active links, fees)
- Create links with full validation — token, amount, expiry, max payments, memo, redirect
- Per-link detail slide-over with payment history
- 3-tab share modal: Blink URL / Action URL / Hosted payment page
- Auto-refresh every 15 seconds via SWR
- Wallet-gated: shows connect screen if no wallet
