/**
 * solpay-links-api / src/lib/onchain.ts
 *
 * Replaces the raw web3.js transaction builder (transaction.ts) when you want
 * the API to build PROGRAM instructions (pay_sol / pay_spl) instead of bare
 * SystemProgram.transfer calls.
 *
 * Drop-in: swap the import in routes/actions.ts from
 *   import { buildPaymentTransaction } from "./transaction"
 * to
 *   import { buildPaymentTransaction } from "./onchain"
 *
 * Both export the same signature.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PaymentLink, TOKEN_MINT, TOKEN_DECIMALS } from "../types";

// ─── Program constants ────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  "SoLPaYLinks1111111111111111111111111111111"
);

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// ─── PDA helpers ──────────────────────────────────────────────────────────────

export function linkIdToBytes(id: string): Uint8Array {
  const buf = Buffer.alloc(10);
  Buffer.from(id, "utf-8").copy(buf, 0, 0, 10);
  return buf;
}

export function findPaymentLinkPDA(
  merchant: PublicKey,
  linkId: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment_link"), merchant.toBuffer(), linkIdToBytes(linkId)],
    PROGRAM_ID
  );
}

// ─── On-chain transaction builder ────────────────────────────────────────────

export async function buildPaymentTransaction(
  connection: Connection,
  payerWallet: string,
  link: PaymentLink,
  amountBaseUnits: bigint
): Promise<{ transaction: Transaction; amountHuman: string }> {
  const payer = new PublicKey(payerWallet);
  const merchant = new PublicKey(link.recipientWallet); // merchant == creator
  const recipient = new PublicKey(link.recipientWallet);
  const treasury = process.env.TREASURY_WALLET
    ? new PublicKey(process.env.TREASURY_WALLET)
    : null;

  const decimals = TOKEN_DECIMALS[link.token];
  const amountHuman = (Number(amountBaseUnits) / 10 ** decimals).toFixed(
    link.token === "SOL" ? 4 : 2
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer;

  // Priority fee
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }));

  // Derive the PDA for this link
  const [linkPda] = findPaymentLinkPDA(merchant, link.id);

  if (link.token === "SOL") {
    // ── pay_sol instruction ─────────────────────────────────────────────────
    // We build it manually (no IDL in the API layer) using the instruction
    // discriminator + borsh-encoded args. This avoids a heavyweight Anchor
    // dependency in the Express server — it only needs @solana/web3.js.

    const discriminator = Buffer.from([
      // sha256("global:pay_sol")[0..8] — pre-computed
      0x61, 0x5e, 0x8b, 0x0d, 0x94, 0x32, 0x11, 0xf4,
    ]);

    // pay_amount: u64 little-endian (0 = use fixed amount on-chain)
    const amountBuf = Buffer.alloc(8);
    const amountView = new DataView(amountBuf.buffer);
    const lo = Number(amountBaseUnits & 0xffffffffn);
    const hi = Number(amountBaseUnits >> 32n);
    amountView.setUint32(0, lo, true);
    amountView.setUint32(4, hi, true);

    const data = Buffer.concat([discriminator, amountBuf]);

    const keys = [
      { pubkey: linkPda,   isSigner: false, isWritable: true  },
      { pubkey: payer,     isSigner: true,  isWritable: true  },
      { pubkey: recipient, isSigner: false, isWritable: true  },
      {
        pubkey: treasury ?? SystemProgram.programId,
        isSigner: false,
        isWritable: !!treasury,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    tx.add({ keys, programId: PROGRAM_ID, data });
  } else {
    // ── pay_spl instruction ─────────────────────────────────────────────────
    const mintAddress = TOKEN_MINT[link.token];
    if (!mintAddress) throw new Error(`No mint for ${link.token}`);

    const mint = new PublicKey(mintAddress);
    const payerAta     = getAssociatedTokenAddressSync(mint, payer);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient);
    const treasuryAta  = treasury
      ? getAssociatedTokenAddressSync(mint, treasury)
      : null;

    const discriminator = Buffer.from([
      // sha256("global:pay_spl")[0..8] — pre-computed
      0x3e, 0x3a, 0x9d, 0x21, 0x5c, 0x8f, 0x4a, 0x01,
    ]);

    const amountBuf = Buffer.alloc(8);
    const amountView = new DataView(amountBuf.buffer);
    const lo = Number(amountBaseUnits & 0xffffffffn);
    const hi = Number(amountBaseUnits >> 32n);
    amountView.setUint32(0, lo, true);
    amountView.setUint32(4, hi, true);

    const data = Buffer.concat([discriminator, amountBuf]);

    const keys = [
      { pubkey: linkPda,     isSigner: false, isWritable: true  },
      { pubkey: payer,       isSigner: true,  isWritable: true  },
      { pubkey: mint,        isSigner: false, isWritable: false },
      { pubkey: payerAta,    isSigner: false, isWritable: true  },
      { pubkey: recipientAta,isSigner: false, isWritable: true  },
      { pubkey: recipient,   isSigner: false, isWritable: false },
      {
        pubkey: treasuryAta ?? TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: !!treasuryAta,
      },
      {
        pubkey: treasury ?? SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: TOKEN_PROGRAM_ID,            isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId,     isSigner: false, isWritable: false },
    ];

    tx.add({ keys, programId: PROGRAM_ID, data });
  }

  // Optional on-chain memo (same as before)
  const memoText = link.memo ?? `SolPay:${link.id}`;
  tx.add({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, "utf-8"),
  });

  return { transaction: tx, amountHuman };
}

export { linkIdToBytes as encodeId };
