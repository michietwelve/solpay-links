/**
 * lib/stealth.ts
 * BiePay Stealth Address Protocol — Umbra-compatible implementation for Solana
 *
 * Cryptographic model:
 *   - Merchant publishes a stealth view keypair (X25519)
 *   - Sender generates an ephemeral X25519 keypair
 *   - ECDH shared secret → SHA-256 → 32-byte seed → Solana Keypair
 *   - The derived keypair IS the stealth address for that payment
 *   - Merchant scans on-chain memos for ephemeral pubkeys, re-derives the keypair,
 *     and can sweep funds from each stealth address
 */
import nacl from "tweetnacl";
import { createHash, randomBytes } from "crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const STEALTH_DOMAIN = "BiePay:stealth:v1";

// ─── Key Generation ────────────────────────────────────────────────────────

/** Generate a fresh X25519 stealth view keypair for a merchant */
export function generateStealthViewKeypair(): {
  publicKey: string;  // base58-encoded X25519 pubkey (stored in DB)
  secretKey: string;  // base58-encoded X25519 secret (merchant keeps securely)
} {
  const kp = nacl.box.keyPair();
  return {
    publicKey: bs58.encode(Buffer.from(kp.publicKey)),
    secretKey: bs58.encode(Buffer.from(kp.secretKey)),
  };
}

// ─── Address Derivation ────────────────────────────────────────────────────

/**
 * Derive a unique stealth address for a single payment.
 * Called by BiePay server when creating a stealth-enabled payment link.
 *
 * @param merchantViewPubkeyB58  base58 X25519 public key from merchant profile
 * @returns stealthAddress       Solana public key that funds will be sent to
 * @returns ephemeralPubkey      base58 X25519 ephemeral key — embedded in tx memo
 */
export function deriveStealthPaymentAddress(merchantViewPubkeyB58: string): {
  stealthAddress: string;      // Solana PublicKey (base58) — the payment destination
  ephemeralPubkey: string;     // X25519 pubkey (base58) — stored with link & on-chain
  ephemeralSecretKey: string;  // X25519 secret — server keeps to prove derivation
} {
  const merchantViewPubkey = bs58.decode(merchantViewPubkeyB58);

  // 1. Generate ephemeral X25519 keypair (one-time per link)
  const ephemeralSeed = randomBytes(32);
  const ephemeralKp = nacl.box.keyPair.fromSecretKey(ephemeralSeed);

  // 2. ECDH — shared secret = DH(ephemeralSecret, merchantViewPubkey)
  const sharedSecret = nacl.box.before(
    Uint8Array.from(merchantViewPubkey),
    ephemeralKp.secretKey
  );

  // 3. Hash shared secret + domain separator → 32-byte seed
  const seed = createHash("sha256")
    .update(Buffer.from(sharedSecret))
    .update(STEALTH_DOMAIN)
    .digest();

  // 4. Derive a valid Solana keypair from the seed
  const stealthKeypair = Keypair.fromSeed(seed);

  return {
    stealthAddress: stealthKeypair.publicKey.toBase58(),
    ephemeralPubkey: bs58.encode(Buffer.from(ephemeralKp.publicKey)),
    ephemeralSecretKey: bs58.encode(Buffer.from(ephemeralKp.secretKey)),
  };
}

// ─── Merchant Recovery ─────────────────────────────────────────────────────

/**
 * Merchant scans on-chain memos for "BiePay:stealth:<ephemeralPubkey>" announcements.
 * For each found ephemeral pubkey, call this to recover the stealth keypair
 * and sign a sweep transaction to move funds to their main wallet.
 *
 * @param merchantViewSecretB58  base58 X25519 secret key (merchant's private key)
 * @param ephemeralPubkeyB58     base58 ephemeral pubkey found in tx memo
 */
export function recoverStealthKeypair(
  merchantViewSecretB58: string,
  ephemeralPubkeyB58: string
): Keypair {
  const merchantViewSecret = bs58.decode(merchantViewSecretB58);
  const ephemeralPubkey = bs58.decode(ephemeralPubkeyB58);

  // ECDH — same shared secret as derivation step
  const sharedSecret = nacl.box.before(
    Uint8Array.from(ephemeralPubkey),
    Uint8Array.from(merchantViewSecret)
  );

  const seed = createHash("sha256")
    .update(Buffer.from(sharedSecret))
    .update(STEALTH_DOMAIN)
    .digest();

  return Keypair.fromSeed(seed);
}

// ─── Memo Builder ──────────────────────────────────────────────────────────

/** Formats the on-chain stealth announcement memo */
export function buildStealthMemo(ephemeralPubkey: string): string {
  return `BiePay:stealth:${ephemeralPubkey}`;
}

/** Parses an ephemeral pubkey from a memo string — returns null if not a stealth tx */
export function parseStealthMemo(memo: string): string | null {
  const match = memo.match(/^BiePay:stealth:([A-Za-z0-9]+)$/);
  return match ? match[1] : null;
}
