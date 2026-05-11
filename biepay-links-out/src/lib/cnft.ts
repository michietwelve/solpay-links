import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { 
  mplBubblegum, 
  mintV1,
  createTree,
} from "@metaplex-foundation/mpl-bubblegum";
import { 
  keypairIdentity, 
  publicKey,
  generateSigner,
  percentAmount,
} from "@metaplex-foundation/umi";
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";

const RPC = process.env.RPC_ENDPOINT || "https://api.devnet.solana.com";
// The backend's own public URL — used to generate per-payment metadata URLs
const API_BASE = process.env.API_BASE_URL ?? "https://biepay-links-production.up.railway.app";

// ─── Dynamic metadata endpoint ────────────────────────────────────────────────
// Instead of uploading to Arweave for every payment (slow + expensive), we serve
// per-payment metadata from our own API at /api/receipts/:paymentId/metadata.json
// This is fully compliant with the cNFT metadata standard.

function buildMetadataUri(paymentId: string): string {
  return `${API_BASE}/api/receipts/${paymentId}/metadata.json`;
}

// ─── Mint loyalty receipt cNFT ────────────────────────────────────────────────

export async function mintLoyaltyReceipt(
  receiver: string,
  merchantName: string,
  linkLabel: string,
  paymentId?: string
) {
  const secret = process.env.FEE_PAYER_SECRET;
  const merkleTreeStr = process.env.PLATFORM_MERKLE_TREE;
  
  if (!secret || !merkleTreeStr) {
    console.warn("[cNFT] Skipping mint: FEE_PAYER_SECRET or PLATFORM_MERKLE_TREE missing");
    return;
  }

  const umi = createUmi(RPC).use(mplBubblegum()).use(mplTokenMetadata());
  const kp = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
  umi.use(keypairIdentity(kp));

  try {
    // Use a per-payment metadata URI so every receipt NFT has unique content
    const metadataUri = paymentId
      ? buildMetadataUri(paymentId)
      : `${API_BASE}/api/receipts/generic/metadata.json`;

    const metadata = {
      name: `BiePay Receipt: ${merchantName.slice(0, 24)}`,
      symbol: "BIE",
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      creators: [{ address: kp.publicKey, verified: true, share: 100 }],
    };

    console.log(`[cNFT] Minting receipt to ${receiver} for payment ${paymentId ?? "unknown"}...`);
    
    const result = await mintV1(umi, {
      leafOwner: publicKey(receiver),
      merkleTree: publicKey(merkleTreeStr),
      collection: process.env.PLATFORM_COLLECTION_MINT ? publicKey(process.env.PLATFORM_COLLECTION_MINT) : null,
      metadata: {
        ...metadata,
        collection: process.env.PLATFORM_COLLECTION_MINT ? { key: publicKey(process.env.PLATFORM_COLLECTION_MINT), verified: false } : null,
      },
    }).sendAndConfirm(umi);

    console.log(`[cNFT] Minted! Sig: ${bs58.encode(result.signature)}`);
    return result;
  } catch (err) {
    console.error("[cNFT] Minting failed:", err);
  }
}

// ─── Platform tree initialization ────────────────────────────────────────────

export async function initializePlatformTree(): Promise<{tree: string, collection: string} | undefined> {
  const secret = process.env.FEE_PAYER_SECRET;
  if (!secret) return;

  const umi = createUmi(RPC).use(mplBubblegum()).use(mplTokenMetadata());
  const kp = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
  umi.use(keypairIdentity(kp));

  const collectionMint = generateSigner(umi);
  console.log(`[cNFT] Creating Collection: ${collectionMint.publicKey}...`);
  await createNft(umi, {
    mint: collectionMint,
    name: "BiePay Loyalty Receipts",
    symbol: "BIE",
    uri: `${API_BASE}/api/receipts/collection/metadata.json`,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
  }).sendAndConfirm(umi);

  const merkleTree = generateSigner(umi);
  console.log(`[cNFT] Creating Merkle Tree: ${merkleTree.publicKey}...`);

  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
  });
  
  await builder.sendAndConfirm(umi);
  console.log(`[cNFT] Tree Initialized! Add this to your .env:`);
  console.log(`PLATFORM_MERKLE_TREE=${merkleTree.publicKey}`);
  console.log(`PLATFORM_COLLECTION_MINT=${collectionMint.publicKey}`);
  return { tree: merkleTree.publicKey.toString(), collection: collectionMint.publicKey.toString() };
}
