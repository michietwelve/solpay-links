# SolPay Links — Anchor Smart Contract

On-chain payment vault for SolPay Links. Every payment link is a PDA account.
Payments flow wallet-to-wallet through the program — the program enforces all
business rules (expiry, capacity, fee split) on-chain so neither the merchant
nor the API server can tamper with them.

---

## Quick start

```bash
# Prerequisites: Rust, Solana CLI, Anchor CLI 0.30.1
# Install Anchor: https://www.anchor-lang.com/docs/installation

# 1. Clone and install
anchor build

# 2. Run tests against a local validator
anchor test

# 3. Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## Program architecture

```
Merchant wallet
     │
     │  create_link(params)
     ▼
┌─────────────────────────────────────┐
│  PaymentLink PDA                    │
│  seeds: ["payment_link",            │
│          merchant_pubkey,           │
│          link_id_bytes]             │
│                                     │
│  • merchant      Pubkey             │
│  • recipient     Pubkey             │
│  • link_id       [u8; 10]           │
│  • token_mint    Option<Pubkey>     │
│  • amount        u64  (0=open)      │
│  • fee_bps       u16                │
│  • expires_at    i64  (0=never)     │
│  • max_payments  u64  (0=unlimited) │
│  • payment_count u64                │
│  • total_received u64               │
│  • status        Active|Completed   │
│                                     │
└─────────────────────────────────────┘
     │
     │  pay_sol / pay_spl
     ▼
Payer wallet ──(net)──► Recipient wallet
             ──(fee)──► Treasury wallet
```

---

## Instructions

### `create_link`
Initialises a new `PaymentLink` PDA. The PDA is derived from the merchant's
pubkey + the 10-byte link ID, so every merchant has their own namespace and
link IDs can be reused across merchants without collision.

**Params**
| Field | Type | Description |
|---|---|---|
| `link_id` | `[u8; 10]` | Must match the API-layer nanoid(10) |
| `amount` | `u64` | Base units. `0` = open amount |
| `fee_bps` | `u16` | Platform fee in BPS (50 = 0.5%) |
| `label` | `String` | Max 80 chars |
| `description` | `String` | Max 200 chars |
| `memo` | `Option<String>` | Max 32 chars, stored on-chain |
| `expires_at` | `i64` | Unix timestamp. `0` = never expires |
| `max_payments` | `u64` | `0` = unlimited |

---

### `pay_sol`
Executes a SOL payment. Splits the transfer: `net → recipient`, `fee → treasury`.

- Fixed-amount links: ignores the caller-supplied `pay_amount`; uses `link.amount`
- Open-amount links: `pay_amount` must be > 0
- Increments `payment_count`; sets `status = Completed` when `max_payments` reached
- Emits `PaymentMade` event (indexable by Helius webhooks)

---

### `pay_spl`
Same as `pay_sol` but for SPL tokens (USDC, USDT).

Uses `transfer_checked` which enforces mint address + decimals — prevents
spoofing a cheap token as USDC by passing the wrong accounts.

Auto-creates the recipient's and treasury's ATAs if they don't exist yet
(payer funds the rent via `init_if_needed`).

---

### `cancel_link`
Merchant-only. Sets `status = Cancelled`. No funds moved — the program never
holds funds in escrow (payments go directly to recipient). Guards:
- `has_one = merchant` — only the creating merchant can cancel
- Link must be `Active`

---

### `close_link`
Merchant-only. Closes the PDA and returns all rent lamports to the merchant.
- Link must be `Completed` or `Cancelled` (cannot close an active link)
- Anchor's `close = merchant` constraint handles the lamport transfer

---

## Security model

### What the program guarantees on-chain
- **Recipient integrity** — `address = payment_link.recipient` constraint means
  the payer cannot redirect funds to a different wallet by passing a different
  account.
- **Mint integrity** — `transfer_checked` with `mint = mint` constraint prevents
  token substitution attacks.
- **Authority** — `has_one = merchant` on cancel/close means only the keypair
  that created the link can modify it.
- **Arithmetic safety** — all additions use `checked_add` with explicit overflow
  error; fee uses `u128` intermediate to prevent overflow on large amounts.
- **No reentrancy** — Solana's single-threaded execution model prevents
  reentrancy by design; no CPI loops exist in this program.

### What the program does NOT do
- It does not custody funds between create and pay — payments are instant
  wallet-to-wallet transfers, not locked in a vault. This is intentional: it
  reduces attack surface and simplifies the trust model.
- It does not enforce the memo on-chain (memo is stored in the PDA for reference,
  the actual on-chain memo instruction is added by the API server's transaction
  builder in the Actions layer).

---

## Events

All events are emitted via `emit!()` and are indexable with Helius webhooks
or any Anchor event listener.

```typescript
// Listen for all PaymentMade events
program.addEventListener("PaymentMade", (event) => {
  console.log(`Payment: ${event.amount} → ${event.recipient}`);
  // Update your database, send webhook to merchant, email receipt, etc.
});
```

| Event | Fields |
|---|---|
| `LinkCreated` | `link, merchant, link_id, amount, token, label, timestamp` |
| `PaymentMade` | `link, payer, recipient, amount, fee, token, count, timestamp` |
| `LinkCancelled` | `link, merchant, timestamp` |

---

## Account size

`PaymentLink::LEN = 510 bytes` → ~0.004 SOL rent (reclaimed on close).

---

## Integration with the Actions API

The API backend (`solpay-links-api`) builds unsigned transactions and returns
them to Phantom. For the on-chain path, it constructs either `pay_sol` or
`pay_spl` instructions using `@coral-xyz/anchor` and the generated IDL — the
same IDL the client SDK uses.

The link ID is the bridge: the API stores `link.id` (nanoid string), converts
it to `[u8; 10]` via `linkIdToBytes()`, derives the PDA, and builds the
instruction. When Phantom signs and broadcasts, the program validates everything
on-chain.

---

## Folder structure

```
programs/solpay-links/
└── src/
    └── lib.rs          # Entire program (instructions, accounts, events, errors)

app/src/
└── client.ts           # TypeScript client SDK

tests/
└── solpay_links.ts     # Full lifecycle test suite (11 tests)

migrations/
└── deploy.ts           # Anchor migration script
```
