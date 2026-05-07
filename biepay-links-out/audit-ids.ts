
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const links = await prisma.paymentLink.findMany({
    select: { merchantId: true, recipientWallet: true }
  });
  const merchantIds = new Set(links.map(l => l.merchantId));
  const recipients = new Set(links.map(l => l.recipientWallet));
  console.log("All Merchant IDs in DB:", Array.from(merchantIds));
  console.log("All Recipients in DB:", Array.from(recipients));
}

main().catch(console.error).finally(() => prisma.$disconnect());
