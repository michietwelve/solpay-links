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
  percentAmount 
} from "@metaplex-foundation/umi";
import bs58 from "bs58";

const RPC = process.env.RPC_ENDPOINT || "https://api.devnet.solana.com";

export async function mintLoyaltyReceipt(
  receiver: string,
  merchantName: string,
  linkLabel: string
) {
  const secret = process.env.FEE_PAYER_SECRET;
  const merkleTreeStr = process.env.PLATFORM_MERKLE_TREE;
  
  if (!secret || !merkleTreeStr) {
    console.warn("[cNFT] Skipping mint: FEE_PAYER_SECRET or PLATFORM_MERKLE_TREE missing");
    return;
  }

  const umi = createUmi(RPC).use(mplBubblegum());
  const kp = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
  umi.use(keypairIdentity(kp));

  try {
    const metadata = {
      name: `BiePay: ${merchantName}`,
      symbol: "BIE",
      uri: "https://arweave.net/placeholder-receipt-metadata", // In prod, upload real JSON
      sellerFeeBasisPoints: 0,
      creators: [{ address: kp.publicKey, verified: true, share: 100 }],
    };

    console.log(`[cNFT] Minting receipt to ${receiver} for ${linkLabel}...`);
    
    const result = await mintV1(umi, {
      leafOwner: publicKey(receiver),
      merkleTree: publicKey(merkleTreeStr),
      metadata: {
        ...metadata,
        collection: null,
      },
    }).sendAndConfirm(umi);

    console.log(`[cNFT] Minted! Sig: ${bs58.encode(result.signature)}`);
    return result;
  } catch (err) {
    console.error("[cNFT] Minting failed:", err);
  }
}

/**
 * Helper to initialize a new tree for the platform if needed
 */
export async function initializePlatformTree() {
  const secret = process.env.FEE_PAYER_SECRET;
  if (!secret) return;

  const umi = createUmi(RPC).use(mplBubblegum());
  const kp = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret));
  umi.use(keypairIdentity(kp));

  const merkleTree = generateSigner(umi);
  console.log(`[cNFT] Creating Merkle Tree: ${merkleTree.publicKey}...`);

  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
  });
  
  await builder.sendAndConfirm(umi);
  console.log(`[cNFT] Tree Initialized! Add this to your .env: PLATFORM_MERKLE_TREE=${merkleTree.publicKey}`);
  return merkleTree.publicKey;
}
