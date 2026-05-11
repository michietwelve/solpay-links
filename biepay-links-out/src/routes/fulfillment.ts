import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// POST /api/fulfillment/claim
router.post("/claim", async (req: Request, res: Response) => {
  const { linkId, publicKey, signature } = req.body;

  if (!linkId || !publicKey || !signature) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // 1. Verify Signature
    const message = `BiePay Fulfillment: ${linkId}`;
    const verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      bs58.decode(signature),
      bs58.decode(publicKey)
    );

    if (!verified) {
      return res.status(401).json({ message: "Invalid signature proof" });
    }

    // 2. Check if payment exists for this user and link
    // Note: In a production environment, we would look up the actual transaction signature associated with this wallet.
    // For the hackathon, we verify if there's a successful transaction recorded for this link.
    const payment = await prisma.transaction.findFirst({
      where: {
        linkId,
        sender: publicKey,
        status: "success"
      }
    });

    if (!payment) {
      return res.status(403).json({ message: "No successful payment found for this wallet." });
    }

    // 3. Get the link data for fulfillment
    const link = await prisma.paymentLink.findUnique({
      where: { id: linkId }
    });

    if (!link || !link.fulfillmentUrl) {
      return res.status(404).json({ message: "No digital asset associated with this link." });
    }

    res.json({ assetUrl: link.fulfillmentUrl });
  } catch (err) {
    console.error("[fulfillment] Claim failed:", err);
    res.status(500).json({ message: "Verification failed." });
  }
});

export default router;
