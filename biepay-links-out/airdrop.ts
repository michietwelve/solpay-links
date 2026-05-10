import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const pubkey = new PublicKey("6v6pCPNoxxdHccRYdQXRzgymnKCnfEjPmmgarqeSF7sn");
  
  console.log(`Requesting airdrop for ${pubkey.toBase58()}...`);
  try {
    const sig = await connection.requestAirdrop(pubkey, 0.5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdrop successful!");
  } catch (e) {
    console.error("Airdrop failed:", e);
  }
}

main();
