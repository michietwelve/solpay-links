import { Router, Request, Response } from "express";
import { getMerchantProfile, updateMerchantProfile } from "../lib/merchant";
import { UpdateMerchantProfileSchema } from "../types";

const router = Router();

// GET /api/merchants/:merchantId
router.get("/:merchantId", async (req: Request, res: Response) => {
  const { merchantId } = req.params;
  const profile = await getMerchantProfile(merchantId as string);
  res.json(profile);
});

// PATCH /api/merchants/:merchantId
router.patch("/:merchantId", async (req: Request, res: Response) => {
  const { merchantId } = req.params;
  
  const parsed = UpdateMerchantProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid profile data" });
    return;
  }
  
  const profile = await updateMerchantProfile(merchantId as string, parsed.data);
  res.json(profile);
});

export default router;
