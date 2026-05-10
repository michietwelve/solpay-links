import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  Keypair,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PaymentLink, TOKEN_MINT, TOKEN_DECIMALS } from "../types";

// ─── Platform fee config ──────────────────────────────────────────────────

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS ?? "50", 10); // 0.5%
const TREASURY = process.env.TREASURY_WALLET;
const FEE_PAYER_SECRET = process.env.FEE_PAYER_SECRET;

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
  if (TREASURY?.includes("11111") || TREASURY?.length < 32) return 0n;
  return (amount * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
}

// ─── SOL transfer ─────────────────────────────────────────────────────────

async function buildSolTransferTx(
  connection: Connection,
  payer: PublicKey,
  link: PaymentLink,
  amountLamports: bigint,
  referenceId: string,
  referrerWallet?: string
): Promise<Transaction> {
  const recipient = new PublicKey(link.recipientWallet);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  
  // 3. Gasless Sponsorship: If secret is available, server pays for gas
  let sponsorKeypair: Keypair | null = null;
  if (FEE_PAYER_SECRET) {
    try {
      sponsorKeypair = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_SECRET));
      tx.feePayer = sponsorKeypair.publicKey;
      console.log(`[Gasless] Sponsoring transaction via ${tx.feePayer.toBase58()}`);
    } catch (err) {
      console.error("[Gasless] Failed to load sponsor keypair:", err);
      tx.feePayer = payer;
    }
  } else {
    tx.feePayer = payer;
  }

  // Priority fee for faster inclusion
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  );

  let fee = calculateFee(amountLamports);
  let referralRebate = 0n;
  
  // Viral Growth Loop: Referrer gets a cut
  if (referrerWallet && link.referralBps && link.referralBps > 0) {
    referralRebate = (amountLamports * BigInt(link.referralBps)) / 10_000n;
  }

  const netAmount = amountLamports - fee - referralRebate;

  // Transfer to recipient
  if (netAmount > 0n) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: netAmount,
      })
    );
  }

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

  // Referral rebate
  if (referralRebate > 0n && referrerWallet) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(referrerWallet),
        lamports: referralRebate,
      })
    );
  }

  // Yield-Powered Cashback: Treasury sends 1-2% back to payer
  if (link.cashbackBps && link.cashbackBps > 0 && TREASURY) {
    const cashbackAmount = (amountLamports * BigInt(link.cashbackBps)) / 10_000n;
    if (cashbackAmount > 0n) {
      console.log(`[Cashback] Routing ${cashbackAmount} lamports back to payer.`);
      tx.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(TREASURY),
          toPubkey: payer,
          lamports: cashbackAmount,
        })
      );
    }
  }

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`BiePay:${referenceId}`));

  // 2. Optional user-visible memo
  if (link.memo) {
    tx.add(buildMemoInstruction(link.memo));
  }

  // 11. cNFT Loyalty Receipt (Simplified placeholder for demo)
  tx.add(buildMemoInstruction(`BiePay:cNFT:LoyaltyReceipt:${link.merchantId.slice(0, 8)}`));

  // If sponsoring, the server MUST sign here so the wallet only needs to sign for the transfers.
  if (FEE_PAYER_SECRET) {
    try {
      const sponsor = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_SECRET));
      tx.partialSign(sponsor);
    } catch (err) {
      // already logged
    }
  }

  return tx;
}

// ─── SPL token transfer ───────────────────────────────────────────────────

// Detect whether a mint uses the standard Token Program or Token-2022
async function getMintTokenProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found on chain`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function buildSplTransferTx(
  connection: Connection,
  payer: PublicKey,
  link: PaymentLink,
  amountRaw: bigint,         // in token's smallest unit
  mintAddress: string,
  referenceId: string,
  referrerWallet?: string
): Promise<Transaction> {
  const recipient = new PublicKey(link.recipientWallet);
  const mint = new PublicKey(mintAddress);
  const decimals = TOKEN_DECIMALS[link.token];

  // Detect correct token program for this mint (Token or Token-2022)
  const tokenProgram = await getMintTokenProgram(connection, mint);

  const payerAta = getAssociatedTokenAddressSync(mint, payer, false, tokenProgram);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient, false, tokenProgram);

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
        mint,
        tokenProgram
      )
    );
  }

  let fee = calculateFee(amountRaw);
  let referralRebate = 0n;

  if (referrerWallet && link.referralBps && link.referralBps > 0) {
    referralRebate = (amountRaw * BigInt(link.referralBps)) / 10_000n;
  }

  const netAmount = amountRaw - fee - referralRebate;

  // Transfer to recipient
  if (netAmount > 0n) {
    tx.add(
      createTransferCheckedInstruction(
        payerAta,
        mint,
        recipientAta,
        payer,
        netAmount,
        decimals,
        [],
        tokenProgram
      )
    );
  }

  // Platform fee to treasury ATA
  if (fee > 0n && TREASURY) {
    const treasuryPubkey = new PublicKey(TREASURY);
    const treasuryAta = getAssociatedTokenAddressSync(mint, treasuryPubkey, false, tokenProgram);

    const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta);
    if (!treasuryAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          treasuryAta,
          treasuryPubkey,
          mint,
          tokenProgram
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
        tokenProgram
      )
    );
  }

  // Referral rebate to referrer ATA
  if (referralRebate > 0n && referrerWallet) {
    const referrerPubkey = new PublicKey(referrerWallet);
    const referrerAta = getAssociatedTokenAddressSync(mint, referrerPubkey, false, tokenProgram);

    const referrerAtaInfo = await connection.getAccountInfo(referrerAta);
    if (!referrerAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          referrerAta,
          referrerPubkey,
          mint,
          tokenProgram
        )
      );
    }

    tx.add(
      createTransferCheckedInstruction(
        payerAta,
        mint,
        referrerAta,
        payer,
        referralRebate,
        decimals,
        [],
        tokenProgram
      )
    );
  }

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`BiePay:${referenceId}`));

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
  amountLamports: bigint,          // canonical amount in token's base unit
  referenceId: string,
  inputToken?: string,             // The token the user wants to pay with (Jupiter Any-to-Any)
  referrerWallet?: string          // For the Viral Discount Loop
): Promise<{ transaction: any; amountHuman: string }> {
  const payer = new PublicKey(payerWallet);
  const decimals = TOKEN_DECIMALS[link.token];
  const amountHuman = (Number(amountLamports) / 10 ** decimals).toFixed(
    link.token === "SOL" ? 4 : 2
  );

  // 1. Handle "Any-to-Any" Jupiter Swap if inputToken differs
  const isJupiterSwap = inputToken && inputToken !== link.token;
  
  if (isJupiterSwap) {
    console.log(`[Jupiter] Preparing Any-to-Any swap from ${inputToken} to ${link.token}`);
    // In a real implementation, we would hit Jupiter API here.
    // For the hackathon demo, we will simulate the multi-instruction transaction
    // as Jupiter swaps can be finicky on Devnet.
  }

  // 2. Handle Lootbox (1% chance to win free purchase)
  let finalAmount = amountLamports;
  if (link.isLootboxEnabled && Math.random() < 0.01) {
    console.log("🎉 LOOTBOX WON! Setting amount to 0.");
    finalAmount = 0n;
  }

  // 3. Handle Cashback / Referral Rebates
  // If referralBps is set, we route a portion directly to the referrer.
  // This logic is injected into buildSolTransferTx/buildSplTransferTx

  let transaction: Transaction;

  if (link.token === "SOL") {
    transaction = await buildSolTransferTx(
      connection,
      payer,
      link,
      finalAmount,
      referenceId,
      referrerWallet
    );
  } else {
    const mint = TOKEN_MINT[link.token];
    if (!mint) throw new Error(`No mint address for ${link.token}`);
    transaction = await buildSplTransferTx(
      connection,
      payer,
      link,
      finalAmount,
      mint,
      referenceId,
      referrerWallet
    );
  }

  // 4. Handle Savings Round-Up
  if (link.isRoundupEnabled && link.roundupVaultAddress && link.token !== "SOL") {
    const rawAmount = Number(finalAmount) / 10**decimals;
    const roundUpAmount = Math.ceil(rawAmount) - rawAmount;
    
    if (roundUpAmount > 0) {
      const roundupLamports = BigInt(Math.round(roundUpAmount * 10**decimals));
      console.log(`[Round-Up] Adding ${roundUpAmount} ${link.token} to vault.`);
      
      const mint = new PublicKey(TOKEN_MINT[link.token]!);
      const vault = new PublicKey(link.roundupVaultAddress);
      const payerAta = getAssociatedTokenAddressSync(mint, payer);
      const vaultAta = getAssociatedTokenAddressSync(mint, vault);
      
      // Add transfer instruction to the existing legacy transaction
      transaction.add(
        createTransferCheckedInstruction(
          payerAta,
          mint,
          vaultAta,
          payer,
          roundupLamports,
          decimals
        )
      );
    }
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
  // Tipping Point Logic: If we've hit the count, use the reduced price
  if (link.tippingPointCount && link.paymentCount >= link.tippingPointCount && link.tippingPointAmountLamports) {
    console.log(`[Tipping Point] Threshold reached (${link.paymentCount}/${link.tippingPointCount}). Using reduced price.`);
    return link.tippingPointAmountLamports;
  }

  if (link.amountLamports !== null) return link.amountLamports;
  if (inputAmount !== undefined && inputAmount > 0) {
    const decimals = TOKEN_DECIMALS[link.token];
    return BigInt(Math.round(inputAmount * 10 ** decimals));
  }
  throw new Error("Amount is required for open-amount payment links.");
}
