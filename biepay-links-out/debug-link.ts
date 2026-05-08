
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const link = await prisma.paymentLink.findUnique({
    where: { id: 'z2zKmbmVEB' },
    include: { payments: true }
  });
  console.log("Link z2zKmbmVEB:", JSON.stringify(link, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
