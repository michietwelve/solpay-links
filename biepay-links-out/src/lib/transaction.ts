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
  getMint,
} from "@solana/spl-token";
import { PaymentLink, TOKEN_MINT, TOKEN_DECIMALS, SupportedToken } from "../types";
import { buildStealthMemo } from "./stealth";

// ─── Platform fee config ──────────────────────────────────────────────────

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS ?? "50", 10); // 0.5%
const TREASURY = process.env.TREASURY_WALLET;
const FEE_PAYER_SECRET = process.env.FEE_PAYER_SECRET;
const ESCROW_SECRET = process.env.ESCROW_SECRET || process.env.FEE_PAYER_SECRET;

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

// ─── Jupiter Integration ──────────────────────────────────────────────────

async function getJupiterQuote(inputMint: string, outputMint: string, amount: bigint, slippageBps: number) {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount.toString()}&slippageBps=${slippageBps}`;
  console.log(`[Jupiter] Fetching quote: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jupiter quote failed: ${err}`);
  }
  return res.json();
}

async function getJupiterSwapInstructions(quoteResponse: any, userPublicKey: string) {
  const res = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jupiter swap instructions failed: ${err}`);
  }
  return res.json();
}

function instructionDataToTxInstruction(ix: any): TransactionInstruction {
  if (!ix) return null as any;
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((acc: any) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
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
  let recipient = link.isStealthEnabled && link.stealthAddress
    ? new PublicKey(link.stealthAddress)
    : new PublicKey(link.recipientWallet);
    
  if (link.isEscrowEnabled) {
    if (!ESCROW_SECRET) throw new Error("Server Escrow Wallet not configured.");
    recipient = Keypair.fromSecretKey(bs58.decode(ESCROW_SECRET)).publicKey;
  }
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
  
  // 4. Viral Growth Loop: Referrer gets a cut (Funded by Merchant)
  if (referrerWallet && link.referralBps && link.referralBps > 0) {
    referralRebate = (amountLamports * BigInt(link.referralBps)) / 10_000n;
  }

  // 5. Loyalty Cashback: Payer gets a cut back (Funded by Merchant)
  let cashbackAmount = 0n;
  if (link.cashbackBps && link.cashbackBps > 0) {
    cashbackAmount = (amountLamports * BigInt(link.cashbackBps)) / 10_000n;
  }

  const netAmount = amountLamports - fee - referralRebate - cashbackAmount;

  // Transfer to recipient (Merchant receives net amount)
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

  // Referral rebate (Payer -> Referrer)
  if (referralRebate > 0n && referrerWallet) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(referrerWallet),
        lamports: referralRebate,
      })
    );
  }

  // NOTE: Cashback is already accounted for in netAmount (merchant receives less).
  // We do NOT add a self-transfer — Solana rejects SOL self-transfers and they waste compute.
  // Cashback can be communicated to the user via the receipt page.

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`BiePay:${referenceId}`));

  // 2. Optional user-visible memo
  if (link.memo) {
    tx.add(buildMemoInstruction(link.memo));
  }

  // Stealth Announcement
  if (link.isStealthEnabled && link.ephemeralPubkey) {
    tx.add(buildMemoInstruction(buildStealthMemo(link.ephemeralPubkey)));
  }

  tx.add(buildMemoInstruction(`BiePay:ref:${referenceId}`));
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
  let recipient = link.isStealthEnabled && link.stealthAddress
    ? new PublicKey(link.stealthAddress)
    : new PublicKey(link.recipientWallet);

  if (link.isEscrowEnabled) {
    if (!ESCROW_SECRET) throw new Error("Server Escrow Wallet not configured.");
    recipient = Keypair.fromSecretKey(bs58.decode(ESCROW_SECRET)).publicKey;
  }
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

  // 4. Viral Growth Loop (Funded by Merchant)
  if (referrerWallet && link.referralBps && link.referralBps > 0) {
    referralRebate = (amountRaw * BigInt(link.referralBps)) / 10_000n;
  }

  // 5. Loyalty Cashback (Funded by Merchant)
  let cashbackAmount = 0n;
  if (link.cashbackBps && link.cashbackBps > 0) {
    cashbackAmount = (amountRaw * BigInt(link.cashbackBps)) / 10_000n;
  }

  const netAmount = amountRaw - fee - referralRebate - cashbackAmount;

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

  // NOTE: Cashback is already accounted for in netAmount (merchant receives less).
  // SPL self-transfers are rejected by the token program — do not add them.
  // Cashback display is handled on the receipt page.

  // 1. Mandatory tracking memo for our listener
  tx.add(buildMemoInstruction(`BiePay:${referenceId}`));

  // 2. Optional user-visible memo
  if (link.memo) {
    tx.add(buildMemoInstruction(link.memo));
  }

  // Stealth Announcement
  if (link.isStealthEnabled && link.ephemeralPubkey) {
    tx.add(buildMemoInstruction(buildStealthMemo(link.ephemeralPubkey)));
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
    
    const inputMint = inputToken === "SOL" ? "So11111111111111111111111111111111111111112" : TOKEN_MINT[inputToken as SupportedToken];
    const outputMint = link.token === "SOL" ? "So11111111111111111111111111111111111111112" : TOKEN_MINT[link.token];
    
    if (!inputMint || !outputMint) throw new Error("Invalid token mint for swap");

    try {
      // 1. Get Quote
      const quote = await getJupiterQuote(inputMint, outputMint, amountLamports, link.maxSlippageBps) as any;
      
      // 2. Get Instructions
      const {
        computeBudgetInstructions,
        setupInstructions,
        swapInstruction,
        cleanupInstruction,
        addressLookupTableAddresses,
      } = await getJupiterSwapInstructions(quote, payerWallet) as any;

      // 3. Update transaction building
      // We will create a new transaction and add Jupiter instructions
      const tx = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = payer;

      // Add Compute Budget
      computeBudgetInstructions.forEach((ix: any) => tx.add(instructionDataToTxInstruction(ix)));
      
      // Add Setup
      setupInstructions.forEach((ix: any) => tx.add(instructionDataToTxInstruction(ix)));
      
      // Add Swap
      tx.add(instructionDataToTxInstruction(swapInstruction));
      
      // Add Cleanup
      if (cleanupInstruction) tx.add(instructionDataToTxInstruction(cleanupInstruction));

      // 4. Add the rest of BiePay logic (fees, memos, etc.)
      // Note: Since Jupiter handled the swap, the "output" is now in the payer's ATA or wallet.
      // We still need to transfer from payer to merchant.
      
      // We reuse the existing builders but they need to know they are part of a larger TX
      // For now, let's just add the transfer instructions directly here.
      
      const transferTx = link.token === "SOL" 
        ? await buildSolTransferTx(connection, payer, link, BigInt(quote.outAmount), referenceId, referrerWallet)
        : await buildSplTransferTx(connection, payer, link, BigInt(quote.outAmount), outputMint, referenceId, referrerWallet);
      
      transferTx.instructions.forEach(ix => tx.add(ix));
      
      return { transaction: tx, amountHuman };
    } catch (err) {
      console.error("[Jupiter] Any-to-Any swap failed:", err);
      throw new Error(`Swap failed: ${(err as Error).message}. Try paying in ${link.token} directly.`);
    }
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
  let baseAmount: bigint;

  // 1. Tipping Point Logic: If we've hit the count, use the reduced price
  if (link.tippingPointCount && link.paymentCount >= link.tippingPointCount && link.tippingPointAmountLamports) {
    console.log(`[Tipping Point] Threshold reached (${link.paymentCount}/${link.tippingPointCount}). Using reduced price.`);
    baseAmount = link.tippingPointAmountLamports;
  } else if (link.amountLamports !== null) {
    baseAmount = link.amountLamports;
  } else if (inputAmount !== undefined && inputAmount > 0) {
    const decimals = TOKEN_DECIMALS[link.token];
    baseAmount = BigInt(Math.round(inputAmount * 10 ** decimals));
  } else {
    throw new Error("Amount is required for open-amount payment links.");
  }

  // 2. Apply Discount BPS
  if (link.discountBps && link.discountBps > 0) {
    const discount = (baseAmount * BigInt(link.discountBps)) / 10_000n;
    console.log(`[Discount] Applying ${link.discountBps} BPS discount: -${discount} units.`);
    baseAmount = baseAmount - discount;
  }

  return baseAmount;
}

// ─── Escrow Settlement Builder ──────────────────────────────────────────

export async function buildEscrowSettlementTransaction(
  connection: Connection,
  payerWallet: string,
  destinationWallet: string,
  token: string,
  amountLamports: bigint,
  type: "release" | "refund"
): Promise<Transaction> {
  if (!ESCROW_SECRET) throw new Error("Server Escrow Wallet not configured");
  const escrowKeypair = Keypair.fromSecretKey(bs58.decode(ESCROW_SECRET));
  const payer = new PublicKey(payerWallet);
  const destination = new PublicKey(destinationWallet);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer;

  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }));
  tx.add(buildMemoInstruction(`BiePay:escrow:${type}`));

  if (token === "SOL") {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: destination,
        lamports: amountLamports,
      })
    );
  } else {
    const mint = new PublicKey(TOKEN_MINT[token as SupportedToken]!);
    const tokenProgram = await getMintTokenProgram(connection, mint);
    const decimals = TOKEN_DECIMALS[token as SupportedToken];
    
    const escrowAta = getAssociatedTokenAddressSync(mint, escrowKeypair.publicKey, false, tokenProgram);
    const destinationAta = getAssociatedTokenAddressSync(mint, destination, false, tokenProgram);

    const destAtaInfo = await connection.getAccountInfo(destinationAta);
    if (!destAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          destinationAta,
          destination,
          mint,
          tokenProgram
        )
      );
    }

    tx.add(
      createTransferCheckedInstruction(
        escrowAta,
        mint,
        destinationAta,
        escrowKeypair.publicKey,
        amountLamports,
        decimals,
        [],
        tokenProgram
      )
    );
  }

  // The server partially signs the transfer from its escrow wallet
  tx.partialSign(escrowKeypair);
  
  return tx;
}
