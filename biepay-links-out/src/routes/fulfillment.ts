import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "../lib/db";

const router = Router();

/**
 * POST /api/fulfillment/claim
 * Verifies that a wallet owns a payment for a specific link.
 * Body: { 
 *   linkId: string, 
 *   publicKey: string, 
 *   signature: string, (base58 signature of the message "BiePay Fulfillment: [linkId]")
 * }
 */
router.post("/claim", async (req: Request, res: Response) => {
  const { linkId, publicKey, signature } = req.body;

  if (!linkId || !publicKey || !signature) {
    res.status(400).json({ message: "Missing required fields: linkId, publicKey, signature" });
    return;
  }

  try {
    const pubkey = new PublicKey(publicKey);
    
    // 1. Verify the signature
    const message = `BiePay Fulfillment: ${linkId}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = pubkey.toBytes();

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      res.status(401).json({ message: "Invalid signature. Ownership proof failed." });
      return;
    }

    // 2. Check if this wallet has a confirmed payment for this link
    const payment = await prisma.paymentRecord.findFirst({
      where: {
        linkId,
        payerWallet: publicKey,
        status: "confirmed"
      }
    });

    if (!payment) {
      // Check if the wallet is the RECIPIENT (merchant can always access their own link assets)
      const link = await prisma.paymentLink.findUnique({ where: { id: linkId } });
      if (link && link.recipientWallet === publicKey) {
        res.json({ 
          success: true, 
          assetUrl: link.digitalAssetUrl,
          isMerchant: true 
        });
        return;
      }

      res.status(403).json({ message: "No confirmed payment found for this wallet on this link." });
      return;
    }

    // 3. Return the asset URL
    const link = await prisma.paymentLink.findUnique({ where: { id: linkId } });
    if (!link) {
      res.status(444).json({ message: "Link data lost." });
      return;
    }

    res.json({ 
      success: true, 
      assetUrl: link.digitalAssetUrl,
      paymentId: payment.id 
    });

  } catch (err) {
    console.error("[fulfillment] Claim error:", err);
    res.status(500).json({ message: "Internal server error during verification." });
  }
});

export default router;
