// Anchor migration — runs once on first deploy
// anchor migrate

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);
  console.log("✅ SolPay Links deployed to:", provider.connection.rpcEndpoint);
  console.log("   Wallet:", provider.wallet.publicKey.toBase58());
};
