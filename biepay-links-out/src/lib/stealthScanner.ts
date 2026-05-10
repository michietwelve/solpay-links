import { Connection, PublicKey, Transaction, SystemProgram, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
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
      
      if (balance > 0) {
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
  
  const balance = await connection.getBalance(kp.publicKey);
  if (balance === 0) throw new Error("No funds to sweep");

  // Transfer all minus small fee
  const fee = 5000; // lamports
  const amount = balance - fee;
  
  if (amount <= 0) throw new Error("Balance too low to cover fees");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: destPubkey,
      lamports: amount,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [kp]);
  return signature;
}
