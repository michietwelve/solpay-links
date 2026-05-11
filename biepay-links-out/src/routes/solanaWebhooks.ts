import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { confirmPayment } from "../lib/store";
import { deliverNotifications } from "../lib/notifications";

const router = Router();

/**
 * POST /api/webhooks/solana-tx
 * Endpoint for Helius/Shyft webhooks.
 * This is the gold standard for transaction detection.
 */
router.post("/solana-tx", async (req: Request, res: Response) => {
  // 1. Verify Authentication (e.g. Helius Auth Header)
  const authHeader = req.headers["authorization"];
  if (process.env.HELIUS_AUTH_TOKEN && authHeader !== process.env.HELIUS_AUTH_TOKEN) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const transactions = req.body;
  if (!Array.isArray(transactions)) return res.status(400).json({ message: "Invalid payload" });

  console.log(`[Webhook] Received ${transactions.length} transactions`);

  for (const tx of transactions) {
    const signature = tx.signature || tx.transaction?.signatures?.[0];
    if (!signature) continue;

    // 2. Check if this is a payment we care about
    // In a real app, Helius filters this for us.
    // Here we find the payment record by signature.
    const payment = await prisma.paymentRecord.findFirst({
      where: { signature: signature, status: "pending" },
      include: { link: true }
    });

    if (payment) {
      console.log(`[Webhook] Confirming payment ${payment.id} via Webhook`);
      
      // 3. Institutional Compliance Check (Simulated)
      // In production, we'd call TRM Labs or Chainalysis here.
      // We check Helius/Shyft risk indicators if present
      const riskScore = tx.events?.riskScore ?? tx.riskScore ?? 0;
      const isCompliant = riskScore < 50; 
      
      // 4. Confirm in DB with compliance metadata
      await prisma.paymentRecord.update({
        where: { id: payment.id },
        data: { 
          status: "confirmed", 
          confirmedAt: new Date(), 
          signature: signature,
          // Store compliance result in a metadata field
          metadata: JSON.stringify({ 
            compliance: isCompliant ? "compliant" : "flagged",
            riskScore: riskScore,
            provider: "BiePay Compliance Engine (v1.0)",
            indexedVia: tx.source || "Helius Webhook"
          })
        }
      });

      // 5. Trigger Notifications & Merchant Webhooks
      if (payment.link) {
        await deliverNotifications(payment.link, payment);
      }
    }
  }

  res.status(200).json({ success: true });
});

export default router;
