import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PaymentLink, TOKEN_MINT, TOKEN_DECIMALS } from "../types";

// ─── Platform fee config ──────────────────────────────────────────────────

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS ?? "50", 10); // 0.5%
const TREASURY = process.env.TREASURY_WALLET;

// ─── Memo program ─────────────────────────────────────────────────────────

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

function buildMemoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, "utf-8"),
  });
}

// ─── Fee calculation ──────────────────────────────────────────────────────

function calculateFee(amount: bigint): bigint {
  if (!TREASURY || PLATFORM_FEE_BPS === 0) return 0n;
  // Safety check: skip fee if treasury is clearly a placeholder or invalid length
  if (TREASURY.includes("11111") || TREASURY.length < 32) return 0n;
  return (amount * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
}

// ─── SOL transfer ─────────────────────────────────────────────────────────

async function buildSolTransferTx(
  connection: Connection,
  payer: PublicKey,
  link: PaymentLink,
  amountLamports: bigint
): Promise<Transaction> {
  const recipient = new PublicKey(link.recipientWallet);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer;

  // Priority fee for faster inclusion
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  );

  const fee = calculateFee(amountLamports);
  const netAmount = amountLamports - fee;

  // Transfer to recipient
  tx.add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: recipient,
      lamports: netAmount,
    })
  );

  // Platform fee to treasury
  if (fee > 0n && TREASURY) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(TREASURY),
        lamports: fee,
      })
    );
  }

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`SolPay:${link.id}`));

  // 2. Optional user-visible memo
  if (link.memo) {
    tx.add(buildMemoInstruction(link.memo));
  }

  return tx;
}

// ─── SPL token transfer ───────────────────────────────────────────────────

async function buildSplTransferTx(
  connection: Connection,
  payer: PublicKey,
  link: PaymentLink,
  amountRaw: bigint,         // in token's smallest unit
  mintAddress: string
): Promise<Transaction> {
  const recipient = new PublicKey(link.recipientWallet);
  const mint = new PublicKey(mintAddress);
  const decimals = TOKEN_DECIMALS[link.token];

  const payerAta = getAssociatedTokenAddressSync(mint, payer);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer;

  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  );

  // Create recipient ATA if it doesn't exist yet (payer covers rent)
  const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
  if (!recipientAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer,
        recipientAta,
        recipient,
        mint
      )
    );
  }

  const fee = calculateFee(amountRaw);
  const netAmount = amountRaw - fee;

  // Transfer to recipient
  tx.add(
    createTransferCheckedInstruction(
      payerAta,
      mint,
      recipientAta,
      payer,
      netAmount,
      decimals,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Platform fee to treasury ATA
  if (fee > 0n && TREASURY) {
    const treasuryPubkey = new PublicKey(TREASURY);
    const treasuryAta = getAssociatedTokenAddressSync(mint, treasuryPubkey);

    const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta);
    if (!treasuryAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          treasuryAta,
          treasuryPubkey,
          mint
        )
      );
    }

    tx.add(
      createTransferCheckedInstruction(
        payerAta,
        mint,
        treasuryAta,
        payer,
        fee,
        decimals,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`SolPay:${link.id}`));

  // 2. Optional user-visible memo
  if (link.memo) {
    tx.add(buildMemoInstruction(link.memo));
  }

  return tx;
}

// ─── Public builder ───────────────────────────────────────────────────────

export async function buildPaymentTransaction(
  connection: Connection,
  payerWallet: string,
  link: PaymentLink,
  amountLamports: bigint          // canonical amount in token's base unit
): Promise<{ transaction: Transaction; amountHuman: string }> {
  const payer = new PublicKey(payerWallet);
  const decimals = TOKEN_DECIMALS[link.token];
  const amountHuman = (Number(amountLamports) / 10 ** decimals).toFixed(
    link.token === "SOL" ? 4 : 2
  );

  let transaction: Transaction;

  if (link.token === "SOL") {
    transaction = await buildSolTransferTx(
      connection,
      payer,
      link,
      amountLamports
    );
  } else {
    const mint = TOKEN_MINT[link.token];
    if (!mint) throw new Error(`No mint address for ${link.token}`);
    transaction = await buildSplTransferTx(
      connection,
      payer,
      link,
      amountLamports,
      mint
    );
  }

  return { transaction, amountHuman };
}

// ─── Serialise for Actions response ──────────────────────────────────────

export function serialiseTransaction(tx: Transaction): string {
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

// ─── Amount resolver ──────────────────────────────────────────────────────
// Converts user-supplied float (e.g. "5.00") to bigint base units

export function resolveAmount(
  link: PaymentLink,
  inputAmount?: number
): bigint {
  if (link.amountLamports !== null) return link.amountLamports;
  if (inputAmount !== undefined && inputAmount > 0) {
    const decimals = TOKEN_DECIMALS[link.token];
    return BigInt(Math.round(inputAmount * 10 ** decimals));
  }
  throw new Error("Amount is required for open-amount payment links.");
}
