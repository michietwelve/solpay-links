
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const all = await prisma.paymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { link: true }
  });
  console.log("Recent payments:", all.map(p => ({
    id: p.id,
    link: p.link.label,
    amount: p.amountLamports,
    token: p.token,
    status: p.status,
    createdAt: p.createdAt
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
