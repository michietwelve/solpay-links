
import { PrismaClient } from "@prisma/client";
import { createLink, createPaymentRecord, confirmPayment, getAllLinks } from "./src/lib/store";
import { Connection, Keypair } from "@solana/web3.js";
import { buildPaymentTransaction } from "./src/lib/transaction";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();
const connection = new Connection("https://api.devnet.solana.com");

const CONCURRENCY = 10;
const ITERATIONS = 100;

async function runLoadTest() {
  console.log(`🚀 STARTING CONCURRENT LOAD TEST (${CONCURRENCY} workers, ${ITERATIONS} iterations each)`);
  
  const merchantId = "LOAD_TEST_" + nanoid(5);
  const startTime = Date.now();

  const workers = Array(CONCURRENCY).fill(0).map(async (_, workerId) => {
    for (let i = 0; i < ITERATIONS; i++) {
      const label = `Load Test ${workerId}-${i}`;
      try {
        // 1. Create Link
        const link = await createLink({
          recipientWallet: Keypair.generate().publicKey.toBase58(),
          token: "USDC",
          label,
          description: "Concurrent load test",
          amount: 1,
          merchantId
        });

        // 2. Build Transaction (CPU intensive)
        const payer = Keypair.generate().publicKey.toBase58();
        await buildPaymentTransaction(
          connection,
          payer,
          link,
          BigInt(1 * 10**6),
          "ref_" + nanoid(5)
        );

        // 3. Simulate Concurrent Payments
        const record = await createPaymentRecord(link.id, payer, BigInt(1 * 10**6), "USDC");
        await confirmPayment(record.id, "sig_" + nanoid(10));

        if (i % 2 === 0) console.log(`   [Worker ${workerId}] Iteration ${i} complete`);
      } catch (err) {
        console.error(`   ❌ [Worker ${workerId}] Failed iteration ${i}:`, (err as Error).message);
      }
    }
  });

  await Promise.all(workers);
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  console.log("\n📊 LOAD TEST RESULTS:");
  console.log(`   - Total Requests: ${CONCURRENCY * ITERATIONS * 3} (Create + Build + Pay)`);
  console.log(`   - Total Time: ${duration.toFixed(2)}s`);
  console.log(`   - Throughput: ${((CONCURRENCY * ITERATIONS * 3) / duration).toFixed(2)} req/s`);

  // Verify Data Integrity
  const links = await getAllLinks(merchantId);
  console.log(`   - Links Created: ${links.length} / ${CONCURRENCY * ITERATIONS}`);
  
  const totalPayments = links.reduce((sum, l) => sum + l.paymentCount, 0);
  console.log(`   - Total Payments Recorded: ${totalPayments} / ${CONCURRENCY * ITERATIONS}`);

  if (links.length === CONCURRENCY * ITERATIONS && totalPayments === CONCURRENCY * ITERATIONS) {
    console.log("\n✅ DATA INTEGRITY VERIFIED. NO RACE CONDITIONS DETECTED.");
  } else {
    console.error("\n⚠️ DATA INCONSISTENCY DETECTED. CHECK FOR RACE CONDITIONS.");
  }
}

runLoadTest().catch(console.error).finally(() => prisma.$disconnect());
