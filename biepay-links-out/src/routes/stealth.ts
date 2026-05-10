import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { scanForStealthBalances, sweepStealthFunds } from "../lib/stealthScanner";

const router = Router();
const rpcUrl = process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

// POST /api/stealth/scan
// Merchant provides their stealthSecret (temporary, not stored)
router.post("/scan", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { stealthSecret } = req.body;
  const merchantId = req.user?.id;

  if (!stealthSecret || !merchantId) {
    return res.status(400).json({ message: "stealthSecret required" });
  }

  try {
    const balances = await scanForStealthBalances(connection, merchantId, stealthSecret);
    res.json(balances);
  } catch (err) {
    console.error("[stealth] Scan failed:", err);
    res.status(500).json({ message: "Scan failed" });
  }
});

// POST /api/stealth/sweep
router.post("/sweep", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { stealthSecret, ephemeralPubkey, destination } = req.body;
  const merchantId = req.user?.id;

  if (!stealthSecret || !ephemeralPubkey || !destination) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const signature = await sweepStealthFunds(connection, stealthSecret, ephemeralPubkey, destination);
    res.json({ success: true, signature });
  } catch (err: any) {
    console.error("[stealth] Sweep failed:", err);
    res.status(400).json({ message: err.message || "Sweep failed" });
  }
});

export default router;
