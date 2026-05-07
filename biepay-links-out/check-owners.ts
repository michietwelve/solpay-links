
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const links = await prisma.paymentLink.findMany({
    where: { label: { in: ["TEST 2", "test"] } }
  });
  console.log("Link owners:", links.map(l => ({ label: l.label, merchantId: l.merchantId, recipient: l.recipientWallet })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
