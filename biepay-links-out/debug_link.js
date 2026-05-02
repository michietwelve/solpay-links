const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  const linkId = '7E1tKTtT7W';
  const link = await prisma.paymentLink.findUnique({ where: { id: linkId } });
  console.log('DB Record:', JSON.stringify(link, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  
  if (link) {
    const expiresAt = link.expiresAt ? new Date(link.expiresAt) : null;
    const now = new Date();
    console.log('Now:', now.toISOString());
    console.log('ExpiresAt:', expiresAt ? expiresAt.toISOString() : 'null');
    console.log('Now > ExpiresAt:', expiresAt ? now > expiresAt : 'N/A');
  }
}

debug().catch(console.error).finally(() => prisma.$disconnect());
