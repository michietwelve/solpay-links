import { Router, Request, Response } from "express";
import { getMerchantProfile, updateMerchantProfile } from "../lib/merchant";
import { UpdateMerchantProfileSchema } from "../types";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../lib/db";
import { nanoid } from "nanoid";

const router = Router();

// GET /api/merchants/:merchantId
router.get("/:merchantId", async (req: Request, res: Response) => {
  const { merchantId } = req.params;
  const profile = await getMerchantProfile(merchantId as string);
  res.json(profile);
});

// GET /api/merchants/:merchantId/webhook-logs
router.get("/:merchantId/webhook-logs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { merchantId } = req.params;
  
  if (!req.user?.allowedIds.includes(merchantId as string)) {
    res.status(403).json({ message: "Not authorized to view these logs" });
    return;
  }

  const logs = await prisma.webhookLog.findMany({
    where: { merchantId: merchantId as string },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(logs);
});

// POST /api/merchants/:merchantId/webhook-logs/:logId/redeliver
router.post("/:merchantId/webhook-logs/:logId/redeliver", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { merchantId, logId } = req.params;
  
  if (!req.user?.allowedIds.includes(merchantId as string)) {
    res.status(403).json({ message: "Not authorized" });
    return;
  }

  try {
    const log = await prisma.webhookLog.findUnique({ where: { id: logId as string } });
    if (!log) return res.status(404).json({ message: "Log not found" });

    const merchant = await prisma.merchantProfile.findUnique({ where: { merchantId: log.merchantId } });
    if (!merchant || !merchant.webhookUrl) return res.status(400).json({ message: "Merchant has no webhook URL" });

    const { deliverWebhook } = require("../lib/listener");
    const result = await deliverWebhook(
      merchant.webhookUrl, 
      JSON.parse(log.payload), 
      merchant.webhookSecret
    );

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ message: "Redelivery failed" });
  }
});

// PATCH /api/merchants/:merchantId
router.patch("/:merchantId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { merchantId } = req.params;

  if (!req.user?.allowedIds.includes(merchantId as string)) {
    res.status(403).json({ message: "Not authorized to update this profile" });
    return;
  }
  
  const parsed = UpdateMerchantProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid profile data" });
    return;
  }
  
  const profile = await updateMerchantProfile(merchantId as string, parsed.data);
  res.json(profile);
});

import { createHmac } from "crypto";

// POST /api/merchants/test-webhook
router.post("/test-webhook", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: "URL required" });
  
  // Use the first allowed ID for the merchant profile secret
  const merchantId = req.user?.allowedIds[0];
  if (!merchantId) return res.status(403).json({ message: "No merchant ID found" });
  
  const merchant = await getMerchantProfile(merchantId);

  try {
    const payload = {
      event: "payment.confirmed",
      signature: "TEST_SIGNATURE_5e3250f",
      linkId: "test-link",
      payer: "PayerWallet11111111111111111111111111111",
      amount: "100000000",
      token: "SOL",
      timestamp: new Date().toISOString(),
      isTest: true
    };
    
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (merchant.webhookSecret) {
      headers["X-BiePay-Signature"] = createHmac("sha256", merchant.webhookSecret)
        .update(body)
        .digest("hex");
    }

    const webhookRes = await fetch(url, {
      method: "POST",
      headers,
      body
    });
    
    if (webhookRes.ok) res.json({ success: true, signed: !!merchant.webhookSecret });
    else res.status(400).json({ message: "Webhook returned error" });
  } catch (err) {
    res.status(500).json({ message: "Delivery failed" });
  }
});

// POST /api/merchants/api-key
router.post("/api-key", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.user?.id; // Primary Privy ID
  if (!merchantId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const newKey = `bp_${nanoid(32)}`;
    const updated = await prisma.merchantProfile.update({
      where: { merchantId },
      data: { apiKey: newKey }
    });
    res.json({ apiKey: updated.apiKey });
  } catch (err) {
    res.status(500).json({ message: "Failed to generate key" });
  }
});

// GET /api/merchants/me/settings
router.get("/me/settings", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.user?.id;
  if (!merchantId) return res.status(401).json({ message: "Unauthorized" });

  const profile = await prisma.merchantProfile.findUnique({ where: { merchantId } });
  res.json(profile);
});

// DELETE /api/merchants/:merchantId
router.delete("/:merchantId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { merchantId } = req.params;

  if (!req.user?.allowedIds.includes(merchantId as string)) {
    res.status(403).json({ message: "Not authorized to delete this profile" });
    return;
  }

  try {
    // Delete all associated payment links (which will cascade delete records)
    await prisma.paymentLink.deleteMany({
      where: { merchantId: merchantId as string }
    });

    // Delete the merchant profile
    await prisma.merchantProfile.delete({
      where: { merchantId: merchantId as string }
    });

    res.json({ success: true, message: "Merchant data purged successfully." });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ message: "Failed to purge merchant data." });
  }
});

// POST /api/merchants/verify-sns
router.post("/verify-sns", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { domain, wallet } = req.body;
  if (!domain || !wallet) return res.status(400).json({ message: "Domain and wallet required" });

  try {
    const { getDomainKeySync, NameRegistryState } = require("@bonfida/spl-name-service");
    const { Connection, PublicKey } = require("@solana/web3.js");

    // 1. Resolve the domain on-chain
    const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
    const { pubkey } = getDomainKeySync(domain);
    const { registry } = await NameRegistryState.retrieve(connection, pubkey);

    const owner = registry.owner.toBase58();

    // 2. Verify the owner matches the provided wallet
    if (owner !== wallet) {
      res.status(401).json({ 
        message: `Verification failed. This domain is owned by ${owner.slice(0,4)}..., not your connected wallet.`,
        actualOwner: owner
      });
      return;
    }

    // 3. Ensure the wallet is authorized for this merchant session
    const isAuthorized = req.user?.allowedIds.includes(wallet);
    if (!isAuthorized) {
      res.status(401).json({ message: "This wallet is not linked to your BiePay account." });
      return;
    }

    // Success response
    res.json({ 
      success: true, 
      verifiedAt: new Date().toISOString(),
      owner,
      domain
    });
  } catch (err) {
    console.error("[SNS] Verification failed:", err);
    res.status(500).json({ message: "SNS resolution failed. Make sure the domain is valid and registered." });
  }
});

export default router;
