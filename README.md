# BiePay Links: Institutional Commerce Layer for Solana

**Official Submission for the Solana Frontier Hackathon**

BiePay Links provides high-throughput payment infrastructure for independent freelancers and global brands using Solana Actions and Blinks.

---

## Technical Integration Tracks

BiePay Links is engineered to support specific ecosystem tracks within the Solana Frontier competition:

### Superteam Nigeria
BiePay addresses payment barriers for West African freelancers by providing instant settlement in stablecoins. This bypasses the friction of traditional FX conversion and international wire delays, enabling direct participation in the global digital economy.

### Tether USDT
USDT is a critical settlement layer for emerging markets. BiePay treats USDT as a first-class citizen, allowing merchants to price, accept, and settle payments in Tether to maintain capital stability against local currency volatility.

### Jupiter Integration
We have integrated the Jupiter Terminal natively. Merchants can swap earnings into alternative assets directly from their dashboard using Jupiter's best-price routing, streamlining liquidity management without leaving the application.

### Palm USD (PUSD)
BiePay natively supports PUSD as a settlement currency. This qualifies the platform for the **Palm USD x Superteam UAE** track, providing merchants in the MENA region with a robust, USD-pegged stablecoin option for global trade.

**Protocol Program ID:** `FEzAVNf3syjNViUQ16GiKz3x15srLxvLPdM9KUyf4pJm`

### SNS Identity
The platform utilizes Bonfida SPL Name Service for identity resolution. When performing withdrawals, merchants can use .sol domains instead of raw public keys, reducing manual entry errors and improving the security of fund transfers.

### Analytics Suite
The dashboard includes a full-stack analytics engine providing real-time data on volume, revenue, and payment velocity, giving merchants professional-grade insights into their business performance.

### Privacy Infrastructure
BiePay includes an Incognito Mode for professional privacy. This allows merchants to manage their platform in shared environments by obscuring sensitive financial metrics and balances with a single toggle.

### AI Assistant
The dashboard features an integrated assistant for business intelligence. Utilizing privacy-preserving data processing, the assistant provides immediate answers regarding top-performing links and revenue trends using local inference.

### Enterprise Webhooks
BiePay supports automated business workflows via standard webhooks. Merchants can configure external endpoints to receive JSON-formatted POST notifications upon successful on-chain payment confirmation.

### Auditory Feedback
The application uses high-fidelity auditory cues to confirm successful state changes. This provides a professional user experience consistent with high-end fintech hardware.

---

## Core Functionality: Solana Blinks

BiePay Links leverages Solana Actions to eliminate friction in social commerce. Every payment link is automatically converted into a Blink, allowing the checkout process to occur directly within supported clients like Twitter/X or Discord. This removes the need for external redirects and significantly improves conversion rates for merchants sharing links on social media.

---

## Deployment and Documentation

- **Production Dashboard**: [https://biepay-links-dwkq-eight.vercel.app](https://biepay-links-dwkq-eight.vercel.app)
- **API Documentation**: [https://biepay-links-production.up.railway.app](https://biepay-links-production.up.railway.app)
- **Technical Demo**: [Insert Link Here]
- **Network**: Solana Devnet

### Testing Instructions
1. Authenticate via the Merchant Dashboard using email or a social provider.
2. Generate a new payment link.
3. To test the payment flow, use the integrated faucet in the checkout page to fund your embedded wallet.
4. Complete a transaction and verify the real-time update in your merchant analytics.

---

## Architecture

The project is structured as a TypeScript-focused monorepo:

1. **Dashboard**: Built with Next.js and Tailwind CSS. Utilizes Privy for secure embedded wallet management and authentication.
2. **Backend API**: Node.js and Express server handling link state, transaction generation, and webhook delivery.
3. **Database**: Prisma ORM with PostgreSQL for persistent merchant and transaction records.

---

## Tech Stack
- **Frameworks**: Next.js, Express
- **Blockchain**: Solana Web3.js, SPL Token, Bonfida SNS, Jupiter Swap API
- **Authentication**: Privy
- **Persistence**: Prisma
- **State Management**: SWR, Zustand

---

## Development Setup

### Installation

**Backend API**
```bash
cd biepay-links-out
npm install
npm run dev
```

**Frontend Dashboard**
```bash
cd biepay-dashboard-out
npm install
npm run dev
```

### Environment Configuration

**Frontend (.env.local):**
```env
NEXT_PUBLIC_PRIVY_APP_ID=your_id
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ACTION_BASE_URL=https://your-tunnel.ngrok-free.app
```

**Backend (.env):**
```env
PORT=3001
DATABASE_URL="file:./dev.db"
RPC_ENDPOINT=https://api.devnet.solana.com
PRIVY_APP_ID=your_id
PRIVY_APP_SECRET=your_secret
```

---

## Troubleshooting

**Q: Jupiter Swap fails to load token metadata.**
A: Token resolution requires Mainnet-Beta RPC access. The application is configured to route these specific requests through a Mainnet node regardless of the primary network setting.

**Q: RPC rate limiting errors.**
A: Public RPC nodes are subject to subject to strict throughput limits. For production workloads, we recommend the use of a dedicated RPC provider.

---

MIT License © 2026 BiePay Links.
