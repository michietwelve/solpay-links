import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { recoverStealthKeypair } from "./stealth";
import { prisma } from "./db";

export async function scanForStealthBalances(connection: Connection, merchantId: string, stealthSecret: string) {
  // 1. Get all stealth links for this merchant
  const links = await prisma.paymentLink.findMany({
    where: { 
      merchantId, 
      isStealthEnabled: true, 
      ephemeralPubkey: { not: null } 
    }
  });

  const results = [];

  for (const link of links) {
    try {
      const kp = recoverStealthKeypair(stealthSecret, link.ephemeralPubkey!);
      const balance = await connection.getBalance(kp.publicKey);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(kp.publicKey, { programId: TOKEN_PROGRAM_ID });
      const hasTokens = tokenAccounts.value.some(ta => ta.account.data.parsed.info.tokenAmount.uiAmount > 0);
      
      if (balance > 0 || hasTokens) {
        results.push({
          address: kp.publicKey.toBase58(),
          balance: balance / LAMPORTS_PER_SOL,
          label: link.label,
          linkId: link.id
        });
      }
    } catch (e) {
      console.error(`[stealthScanner] Failed to check link ${link.id}:`, e);
    }
  }

  return results;
}

export async function sweepStealthFunds(
  connection: Connection, 
  stealthSecret: string, 
  ephemeralPubkey: string, 
  destination: string
) {
  const kp = recoverStealthKeypair(stealthSecret, ephemeralPubkey);
  const destPubkey = new PublicKey(destination);
  
  const tx = new Transaction();

  // 1. Sweep SPL Tokens
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(kp.publicKey, { programId: TOKEN_PROGRAM_ID });
  for (const ta of tokenAccounts.value) {
    const amount = ta.account.data.parsed.info.tokenAmount.amount;
    if (Number(amount) > 0) {
      const mint = new PublicKey(ta.account.data.parsed.info.mint);
      const decimals = ta.account.data.parsed.info.tokenAmount.decimals;
      
      const destAta = getAssociatedTokenAddressSync(mint, destPubkey);
      const destAtaInfo = await connection.getAccountInfo(destAta);
      if (!destAtaInfo) {
         tx.add(createAssociatedTokenAccountInstruction(kp.publicKey, destAta, destPubkey, mint));
      }
      tx.add(createTransferCheckedInstruction(
        ta.pubkey, mint, destAta, kp.publicKey, BigInt(amount), decimals
      ));
    }
  }

  // 2. Sweep Native SOL
  const balance = await connection.getBalance(kp.publicKey);
  const fee = 10000; // lamports for compute
  if (balance > fee) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: destPubkey,
        lamports: balance - fee,
      })
    );
  }

  if (tx.instructions.length === 0) throw new Error("No funds to sweep");

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx, [kp]);
  return signature;
}
