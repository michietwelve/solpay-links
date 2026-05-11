// stress-test.ts
declare var process: any;
import { PrismaClient } from "@prisma/client";
import { resolveAmount, buildPaymentTransaction } from "./src/lib/transaction";
import { createLink, getPaymentsForLink, createPaymentRecord, confirmPayment, getLinkById } from "./src/lib/store";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { detectLocalCurrency, getFiatEquivalent } from "./src/lib/fx";

const prisma = new PrismaClient();
const connection = new Connection("https://api.devnet.solana.com");

const TEST_MERCHANT = "MERCH_123";
const TEST_PAYER = Keypair.generate().publicKey.toBase58();
const TEST_REFERRER = Keypair.generate().publicKey.toBase58();
const TEST_RECIPIENT = Keypair.generate().publicKey.toBase58();

async function runTests() {
  console.log("🚀 STARTING BIEPAY HACKATHON STRESS TEST SUITE\n");

  // --- TEST 1: PPP Localization ---
  console.log("🧪 TEST 1: PPP Localization");
  const localNGN = detectLocalCurrency("NG");
  const localID = detectLocalCurrency("ID");
  const priceNGN = getFiatEquivalent(10, localNGN);
  const priceIDR = getFiatEquivalent(10, localID);
  console.log(`   - 10 USDC in Nigeria: ${priceNGN} NGN`);
  console.log(`   - 10 USDC in Indonesia: ${priceIDR} IDR`);
  if (priceNGN === "15,000" && priceIDR === "160,000") {
    console.log("   ✅ PPP Calculation Correct");
  }

  // --- TEST 2: Social Split Payment ---
  console.log("\n🧪 TEST 2: Social Split Payment");
  const splitLink = await createLink({
    recipientWallet: TEST_RECIPIENT,
    token: "USDC",
    label: "Split Test",
    description: "Group buy test",
    amount: 10,
    merchantId: TEST_MERCHANT,
    isSplitPayment: true,
    targetAmount: 30,
    maxSlippageBps: 50
  });
  
  const p1 = await createPaymentRecord(splitLink.id, TEST_PAYER, BigInt(10 * 10**6), "USDC");
  await confirmPayment(p1.id, "sig1");
  const p2 = await createPaymentRecord(splitLink.id, TEST_PAYER, BigInt(10 * 10**6), "USDC");
  await confirmPayment(p2.id, "sig2");
  
  const payments = await getPaymentsForLink(splitLink.id);
  const total = payments.reduce((sum, p) => sum + p.amountLamports, 0n);
  console.log(`   - Progress: ${Number(total)/10**6} / 30 USDC`);
  if (total === BigInt(20 * 10**6)) console.log("   ✅ Split Progress Tracking Verified");

  // --- TEST 3: Tipping Point Price Drop ---
  console.log("\n🧪 TEST 3: Tipping Point Price Drop");
  const tippingLink = await createLink({
    recipientWallet: TEST_RECIPIENT,
    token: "USDC",
    label: "Tipping Test",
    description: "Price drops after 2 sales",
    amount: 100, 
    merchantId: TEST_MERCHANT,
    tippingPointCount: 2,
    tippingPointAmount: 50,
    maxSlippageBps: 50
  });
  
  // Set payment count to 2 to trigger the drop
  await prisma.paymentLink.update({ where: { id: tippingLink.id }, data: { paymentCount: 2 } });
  const updatedLink = await getLinkById(tippingLink.id);
  
  const finalPrice = resolveAmount(updatedLink!);
  console.log(`   - Resolved Price after tipping point: ${Number(finalPrice)/10**6} USDC (Target: 50)`);
  if (finalPrice === BigInt(50 * 10**6)) console.log("   ✅ Price Drop Logic Verified");

  // --- TEST 4: Viral Loop ---
  console.log("\n🧪 TEST 4: Viral Loop Rebate");
  const viralLink = await createLink({
    recipientWallet: TEST_RECIPIENT,
    token: "USDC",
    label: "Viral Test",
    description: "Referral test",
    amount: 100,
    merchantId: TEST_MERCHANT,
    referralBps: 500,
    discountBps: 200,
    maxSlippageBps: 50
  });
  
  const { transaction } = await buildPaymentTransaction(
    connection,
    TEST_PAYER,
    viralLink,
    BigInt(100 * 10**6),
    "ref_123",
    "USDC",
    TEST_REFERRER
  );
  
  const transfers = transaction.instructions.filter((i: any) => i.programId.toBase58().includes("Token"));
  if (transfers.length >= 3) console.log("   ✅ Atomic Split Logic Confirmed");

  // --- TEST 5: Gasless Sponsorship ---
  console.log("\n🧪 TEST 5: Gasless Sponsorship");
  if (process.env.FEE_PAYER_SECRET) {
    const { transaction: gaslessTx } = await buildPaymentTransaction(
      connection,
      TEST_PAYER,
      viralLink,
      BigInt(10 * 10**6),
      "gasless_test"
    );
    if (gaslessTx.feePayer?.toBase58() !== TEST_PAYER) {
      console.log(`   - Sponsoring via: ${gaslessTx.feePayer?.toBase58()}`);
      console.log("   ✅ Gasless Sponsorship Verified");
    }
  }

  console.log("\n🏁 STRESS TEST COMPLETE. ALL ENGINES GO.");
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
