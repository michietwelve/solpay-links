import "dotenv/config";
import { initializePlatformTree } from "./src/lib/cnft";

async function main() {
  const result = await initializePlatformTree();
  if (result) {
    console.log(`\n\nSUCCESS! Add this to your .env:\nPLATFORM_MERKLE_TREE=${result.tree}\nPLATFORM_COLLECTION_MINT=${result.collection}\n\n`);
  }
}

main().catch(console.error);
