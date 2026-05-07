import { Router, Request, Response } from "express";
import { getMerchantProfile, updateMerchantProfile } from "../lib/merchant";
import { UpdateMerchantProfileSchema } from "../types";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// GET /api/merchants/:merchantId
router.get("/:merchantId", async (req: Request, res: Response) => {
  const { merchantId } = req.params;
  const profile = await getMerchantProfile(merchantId as string);
  res.json(profile);
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

// POST /api/merchants/test-webhook
router.post("/test-webhook", async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ message: "URL required" });
  
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
    
    const webhookRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (webhookRes.ok) res.json({ success: true });
    else res.status(400).json({ message: "Webhook returned error" });
  } catch (err) {
    res.status(500).json({ message: "Delivery failed" });
  }
});

export default router;
