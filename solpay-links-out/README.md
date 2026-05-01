# BiePay Links — Actions API Backend

Stripe-grade payment links for the Solana economy. Built on the Solana Actions / Blinks spec — every link is a shareable URL that Phantom, Backpack, and any Actions-aware wallet renders as a native payment UI.

---

## Architecture

```
Merchant dashboard
       │
       ▼
POST /api/links          ← create a payment link
       │
       └─► link.id = "aBc1234XyZ"

       ┌─────────────────────────────────────────────────┐
       │  Payer receives:                                 │
       │  https://dial.to/?action=solana-action:          │
       │    https://api.biepay.link/actions/aBc1234XyZ   │
       └─────────────────────────────────────────────────┘
               │
               │  Phantom / Backpack fetches:
               ▼
       GET /actions/:linkId       ← returns Blink metadata
               │
               │  User clicks "Pay 5 USDC"
               ▼
       POST /actions/:linkId/pay  ← returns serialized tx
               │
               │  Wallet signs + broadcasts
               ▼
       ✅ Payment confirmed on-chain
```

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env — set RPC_ENDPOINT, TREASURY_WALLET, API_BASE_URL

# 3. Dev server (hot reload)
npm run dev

# 4. Test the health endpoint
curl http://localhost:3000/health
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `RPC_ENDPOINT` | Yes | devnet | Solana RPC URL (use Helius/QuickNode in prod) |
| `API_BASE_URL` | Yes | `http://localhost:3000` | Your public API URL (used to build Blink URLs) |
| `TREASURY_WALLET` | No | — | Your wallet for platform fees |
| `PLATFORM_FEE_BPS` | No | `50` | Fee in basis points (50 = 0.5%) |
| `ICON_URL` | No | placeholder | PNG/SVG icon shown in Phantom UI |

---

## API Reference

### `GET /actions.json`
Required by Blinks spec. Maps `/pay/**` routes to the Actions API.

---

### `GET /actions/:linkId`
Returns Blink metadata for a payment link.

**Response (200)**
```json
{
  "type": "action",
  "icon": "https://biepay.link/icon.png",
  "title": "Invoice #42 — Acme Corp",
  "description": "Payment for web development services",
  "label": "Pay 500 USDC",
  "links": {
    "actions": [
      {
        "type": "transaction",
        "href": "https://api.biepay.link/actions/aBc1234XyZ/pay",
        "label": "Pay 500 USDC"
      }
    ]
  }
}
```

For **open-amount** links, `links.actions[0]` includes a `parameters` array
with a `number` input so the user can type an amount in Phantom's UI.

**Response when disabled (expired / completed)**
```json
{
  "type": "action",
  "disabled": true,
  "error": { "message": "This payment link has expired." },
  ...
}
```

---

### `POST /actions/:linkId/pay`
Builds and returns a serialized, unsigned Solana transaction.

**Request body**
```json
{
  "account": "7xKXtg...",   // payer's wallet pubkey (required)
  "amount": 5.00            // only for open-amount links
}
```

**Response (200)**
```json
{
  "type": "transaction",
  "transaction": "<base64-encoded serialized transaction>",
  "message": "Paying 500.00 USDC to Invoice #42 — Acme Corp."
}
```

The wallet deserializes the transaction, shows the user a preview, they sign it,
and the wallet broadcasts it. **The server never sees the private key.**

---

### `POST /api/links`
Create a new payment link.

**Request body**
```json
{
  "recipientWallet": "7xKXtg2...",
  "amount": 50.00,               // omit for open-amount
  "token": "USDC",               // "SOL" | "USDC" | "USDT"
  "label": "Invoice #42",
  "description": "Web dev payment — March 2026",
  "memo": "INV-042",             // max 32 chars, appears on-chain
  "expiresInMinutes": 1440,      // 24h
  "maxPayments": 1,
  "redirectUrl": "https://yoursite.com/thank-you",
  "merchantId": "merchant_abc123"
}
```

**Response (201)**
```json
{
  "link": { ... },
  "urls": {
    "blinkUrl":   "https://dial.to/?action=solana-action:https%3A%2F%2F...",
    "actionUrl":  "solana-action:https://api.biepay.link/actions/aBc1234XyZ",
    "payPageUrl": "https://biepay.link/pay/aBc1234XyZ"
  }
}
```

---

### `GET /api/links/:id/payments`
Returns all payment records for a link (pending + confirmed).

---

## Transaction flow detail

### SOL payments
1. `ComputeBudgetProgram.setComputeUnitPrice` — priority fee for fast inclusion
2. `SystemProgram.transfer` — net amount to recipient
3. `SystemProgram.transfer` — 0.5% platform fee to treasury (if configured)
4. `MemoProgram` — link ID or custom memo written on-chain

### SPL token payments (USDC / USDT)
1. Priority fee instruction
2. Create recipient ATA if it doesn't exist yet (payer funds the rent)
3. `createTransferCheckedInstruction` — net amount to recipient ATA
4. `createTransferCheckedInstruction` — platform fee to treasury ATA
5. Memo instruction

### Why `requireAllSignatures: false`?
The server builds the transaction but **does not sign it**. The wallet receives
the base64-encoded transaction, shows the user a preview, and only then signs
and broadcasts. This is the entire security model of Solana Actions.

---

## Extending for production

| What | How |
|---|---|
| **Persistence** | Replace `src/lib/store.ts` with a Postgres adapter (Drizzle/Prisma). Same interface, zero route changes. |
| **Webhooks** | Add an event listener (Helius webhooks or `@solana/web3.js` `onLogs`) to `confirmPayment()` on-chain confirmation. |
| **Auth** | Add a JWT middleware on `POST /api/links` and scope links to merchant sessions. |
| **Mainnet tokens** | Update `TOKEN_MINT` in `src/types/index.ts` — USDC mainnet mint is already set. |
| **Rate limiting** | Add `express-rate-limit` on POST routes to prevent spam. |

---

## Deploying

```bash
# Build
npm run build

# Start production server
npm start
```

For a hackathon deployment: Railway, Render, or Fly.io all work great with `npm start`. Point `API_BASE_URL` to your public URL.

For the Blinks spec to work on mainnet:
1. Deploy at a public HTTPS URL
2. Register your domain at https://dial.to/register (Dialect Actions Registry)
3. Verify the `actions.json` is accessible at your root domain

---

## Project structure

```
src/
├── index.ts               # Express app + server bootstrap
├── types/
│   └── index.ts           # Zod schemas, shared interfaces, token config
├── lib/
│   ├── store.ts           # In-memory link/payment store (swap for DB)
│   └── transaction.ts     # SOL + SPL transaction builders
├── middleware/
│   └── actions.ts         # CORS / Actions headers, error helpers
└── routes/
    ├── actions.ts         # GET + POST Solana Actions endpoints
    ├── links.ts           # Merchant CRUD API
    └── actionsJson.ts     # /actions.json spec file
```
