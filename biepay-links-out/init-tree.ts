import "dotenv/config";
import { initializePlatformTree } from "./src/lib/cnft";

async function main() {
  const tree = await initializePlatformTree();
  console.log(`\n\nSUCCESS! Add this to your .env:\nPLATFORM_MERKLE_TREE=${tree}\n\n`);
}

main().catch(console.error);
