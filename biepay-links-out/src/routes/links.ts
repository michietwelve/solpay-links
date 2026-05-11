import { Router, Request, Response } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  createLink,
  getLinkById,
  getAllLinks,
  getPaymentsForLink,
  getEffectiveStatus,
  deleteLink,
  confirmPayment,
} from "../lib/store";
import { CreateLinkSchema } from "../types";
import { actionError } from "../middleware/actions";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../lib/db";
import { buildEscrowSettlementTransaction, serialiseTransaction } from "../lib/transaction";

const router = Router();
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

const TOKEN_MINTS: Record<string, string> = {
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "EJwZwpRvqiS86SAt9ikRWB9S5bwGrnF399qcSip8T6Y3",
};

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
};

// ─── POST /api/links  ─────────────────────────────────────────────────────
// Create a new payment link. Returns the link object + ready-to-share URLs.

router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const parsed = CreateLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    actionError(res, 400, parsed.error.errors.map((e) => e.message).join("; "));
    return;
  }

  // Enforce that the user owns the merchantId or recipientWallet they are creating a link for
  if (!req.user?.allowedIds.includes(parsed.data.merchantId) && 
      !req.user?.allowedIds.includes(parsed.data.recipientWallet)) {
    actionError(res, 403, "You are not authorized to create a link for this wallet or merchant ID.");
    return;
  }

  const link = await createLink(parsed.data);

  // Blink URL — what you share on X/Telegram/WhatsApp
  const blinkUrl = `https://dial.to/?action=solana-action:${encodeURIComponent(
    `${API_BASE}/actions/${link.id}`
  )}`;

  // Direct action URL — for wallet-native contexts
  const actionUrl = `solana-action:${API_BASE}/actions/${link.id}`;

  // Hosted payment page URL — for non-crypto users (via Privy / MoonPay)
  const payPageUrl = `${API_BASE}/pay/${link.id}`;

  res.status(201).json({
    link: {
      ...link,
      amountLamports: link.amountLamports?.toString() ?? null,
    },
    urls: { blinkUrl, actionUrl, payPageUrl },
    meta: {
      isOpenAmount: link.amountLamports === null,
      token: link.token,
      expiresAt: link.expiresAt,
    },
  });
});

// ─── GET /api/links/all/payments  ──────────────────────────────────────────
// Global transaction history for a merchant
router.get("/debug/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user,
    env: {
      hasPrivyId: !!process.env.PRIVY_APP_ID,
      hasPrivySecret: !!process.env.PRIVY_APP_SECRET
    }
  });
});

// ─── GET /api/links/all/payments  ──────────────────────────────────────────
// Global transaction history for a merchant
router.get("/all/payments", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const allowedIds = req.user?.allowedIds || [];
  
  if (allowedIds.length === 0) {
    res.json([]);
    return;
  }
  res.setHeader("X-Debug-IDs", allowedIds.length);

  // 1. Find all links belonging to this merchant
  const links = await prisma.paymentLink.findMany({
    where: {
      OR: [
        { merchantId: { in: allowedIds } },
        { recipientWallet: { in: allowedIds } }
      ]
    },
    select: { id: true, label: true }
  });

  const linkIds = links.map(l => l.id);
  if (linkIds.length === 0) {
    res.json([]);
    return;
  }

  // 2. Find all payments for these links
  const payments = await prisma.paymentRecord.findMany({
    where: { 
      linkId: { in: linkIds }
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Enrich with link labels
  const labelMap = Object.fromEntries(links.map(l => [l.id, l.label]));

  res.json(
    payments.map((p) => ({
      ...p,
      amountLamports: p.amountLamports.toString(),
      linkLabel: labelMap[p.linkId] || "Unknown Link"
    }))
  );
});

// ─── POST /api/links/all/sync  ────────────────────────────────────────────
// Triggers an on-chain scan for any missed transactions across all merchant wallets.
router.post("/all/sync", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const allowedIds = req.user?.allowedIds || [];
  if (allowedIds.length === 0) {
    res.json({ success: true, count: 0 });
    return;
  }

  const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
  const { confirmPayment } = require("../lib/store");
  const { deliverWebhook } = require("../lib/listener");
  const { getMerchantProfile } = require("../lib/merchant");
  
  let reconciledCount = 0;

  try {
    // For each wallet, scan recent transactions
    for (const address of allowedIds) {
      if (!address.startsWith("did:privy")) { // Skip Privy IDs, only scan wallets
        try {
          const pubkey = new PublicKey(address);
          const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 10 });
          
          for (const sigInfo of signatures) {
            if (sigInfo.err) continue;
            
            // Check if we already have this signature confirmed
            const existing = await prisma.paymentRecord.findFirst({
              where: { signature: sigInfo.signature, status: "confirmed" }
            });
            if (existing) continue;

            // If not found, fetch the transaction logs to see if it's a BiePay tx
            const tx = await connection.getTransaction(sigInfo.signature, { 
              maxSupportedTransactionVersion: 0, 
              commitment: "confirmed" 
            });
            const logs = tx?.meta?.logMessages || [];
            
            const match = logs.join(" ").match(/BiePay:([A-Za-z0-9_-]{12})/);
            if (match) {
              const recordId = match[1];
              const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
              
              if (record && record.status === "pending") {
                await confirmPayment(recordId, sigInfo.signature);
                reconciledCount++;
                
                // Fire webhook
                try {
                  const link = await prisma.paymentLink.findUnique({ where: { id: record.linkId } });
                  if (link) {
                    const merchant = await getMerchantProfile(link.merchantId);
                    const webhookUrl = merchant.webhookUrl || process.env.WEBHOOK_URL;
                    if (webhookUrl) {
                      await deliverWebhook(webhookUrl, {
                        event: "payment.confirmed",
                        signature: sigInfo.signature,
                        linkId: link.id,
                        payer: record.payerWallet,
                        amount: record.amountLamports,
                        token: record.token,
                        timestamp: new Date().toISOString(),
                      }, merchant.webhookSecret);
                    }
                  }
                } catch (we) { console.error("Sync webhook error:", we); }
              }
            }
          }
        } catch (walletErr) {
          console.warn(`[sync] Failed to scan wallet ${address}:`, walletErr);
        }
      }
    }

    res.json({ success: true, count: reconciledCount });
  } catch (err) {
    console.error("[sync] Global sync failed:", err);
    res.status(500).json({ message: "Sync failed" });
  }
});

// ─── GET /api/links/:id  ──────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const link = await getLinkById(req.params.id as string);
  if (!link) {
    actionError(res, 404, "Link not found.");
    return;
  }
  res.json({
    ...link,
    status: getEffectiveStatus(link),
    amountLamports: link.amountLamports?.toString() ?? null,
  });
});

// ─── GET /api/links/:id/payments  ────────────────────────────────────────

router.get("/:id/payments", async (req: Request, res: Response): Promise<void> => {
  const link = await getLinkById(req.params.id as string);
  if (!link) {
    actionError(res, 404, "Link not found.");
    return;
  }
  const payments = await getPaymentsForLink(req.params.id as string);
  res.json({
    link: {
      ...link,
      status: getEffectiveStatus(link),
      amountLamports: link.amountLamports?.toString() ?? null,
    },
    payments: payments.map((p) => ({
      ...p,
      amountLamports: p.amountLamports.toString(),
    })),
  });
});

// ─── GET /api/payments/:id  ───────────────────────────────────────────────
// Fetch a single payment record for the receipt page
router.get("/payments/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const payment = await prisma.paymentRecord.findUnique({
      where: { id: id as string },
      include: { link: { select: { label: true, digitalAssetUrl: true, id: true } } }
    }) as any;

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const TOKEN_DECIMALS_LOCAL: Record<string, number> = { SOL: 9, USDC: 6, USDT: 6, BONK: 5, WIF: 6 };
    const decimals = TOKEN_DECIMALS_LOCAL[payment.token] || 9;
    const amountHuman = (BigInt(payment.amountLamports) / BigInt(10 ** decimals)).toString();

    res.json({
      payment: {
        ...payment,
        amountHuman,
      },
      link: payment.link
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payment record" });
  }
});

// ─── GET /api/links  ─────────────────────────────────────────────────────
// Authenticated list fetching. Only returns links belonging to the user's linked wallets.

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const allowedIds = req.user?.allowedIds || [];
  
  if (allowedIds.length === 0) {
    res.json([]);
    return;
  }

  // Use the hardened library function instead of raw prisma call
  const links = await getAllLinks(allowedIds);

  res.json(links);
});

// ─── DELETE /api/links/:id  ───────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const link = await getLinkById(req.params.id as string);
  if (!link) {
    actionError(res, 404, "Link not found.");
    return;
  }

  // Enforce ownership
  if (!req.user?.allowedIds.includes(link.merchantId) && 
      !req.user?.allowedIds.includes(link.recipientWallet)) {
    actionError(res, 403, "You are not authorized to delete this link.");
    return;
  }

  await deleteLink(req.params.id as string);
  res.status(204).end();
});

// PATCH /api/links/:id
import { z } from "zod";

const VALID_STATUSES = ["active", "cancelled", "archived"] as const;

const PatchLinkSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  redirectUrl: z.string().url().nullish(),
  digitalAssetUrl: z.string().url().nullish(),
  status: z.enum(VALID_STATUSES).optional(),
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const link = await getLinkById(id as string);
  
  if (!link) {
    res.status(404).json({ message: "Link not found" });
    return;
  }

  // Auth check
  if (link.merchantId !== req.user?.id && 
      !req.user?.allowedIds.includes(link.merchantId) &&
      !req.user?.allowedIds.includes(link.recipientWallet)) {
    res.status(403).json({ message: "Not authorized to update this link" });
    return;
  }

  // Validate input
  const parsed = PatchLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors.map(e => e.message).join("; ") });
    return;
  }

  const data = parsed.data;

  // Safeguard: Do not allow re-activating a completed link
  if (link.status === "completed" && data.status === "active") {
    res.status(400).json({ message: "Cannot reactivate a completed link." });
    return;
  }

  const updated = await prisma.paymentLink.update({
    where: { id: id as string },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.redirectUrl !== undefined && { redirectUrl: data.redirectUrl }),
      ...(data.digitalAssetUrl !== undefined && { digitalAssetUrl: data.digitalAssetUrl }),
      ...(data.status !== undefined && { status: data.status }),
    }
  });

  res.json(updated);
});

// POST /api/links/:id/reconcile
// Manually verify a signature on-chain if the listener missed it
router.post("/:id/reconcile", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { signature } = req.body;

  if (!signature) {
    res.status(400).json({ message: "Signature required" });
    return;
  }

  try {
    const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
    const status = await connection.getSignatureStatus(signature);
    
    if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
      // Check if this signature contains our BiePay memo
      const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      const logs = tx?.meta?.logMessages || [];
      const isBiePay = logs.some((l: string) => l.includes("BiePay:"));

      if (isBiePay) {
        // Extract recordId from the logs
        let recordId = null;
        for (const log of logs) {
          const match = log.match(/BiePay:([A-Za-z0-9_-]+)/);
          if (match) { recordId = match[1]; break; }
        }

        if (recordId) {
          const { confirmPayment, getLinkById } = require("../lib/store");
          const { getMerchantProfile } = require("../lib/merchant");
          const { deliverWebhook } = require("../lib/listener");
          
          await confirmPayment(recordId, signature);
          
          // Fire webhook
          try {
            const link = await getLinkById(id);
            if (link) {
              const merchant = await getMerchantProfile(link.merchantId);
              const webhookUrl = merchant.webhookUrl || process.env.WEBHOOK_URL;
              if (webhookUrl) {
                // We need to fetch the record to get amount/token
                const { prisma } = require("../lib/db");
                const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
                if (record) {
                  await deliverWebhook(webhookUrl, {
                    event: "payment.confirmed",
                    signature,
                    linkId: id,
                    payer: record.payerWallet,
                    amount: record.amountLamports,
                    token: record.token,
                    timestamp: new Date().toISOString(),
                  }, merchant.webhookSecret);
                }
              }
            }
          } catch (webhookErr) {
            console.error("Reconcile webhook error:", webhookErr);
          }

          res.json({ status: "confirmed", message: "Transaction verified on-chain and recorded." });
        } else {
          res.status(400).json({ message: "BiePay memo found, but no Record ID." });
        }
      } else {
        res.status(400).json({ message: "Not a valid BiePay transaction." });
      }
    } else {
      res.status(400).json({ message: `Transaction status: ${status.value?.confirmationStatus || "not found"}` });
    }
  } catch (err) {
    res.status(500).json({ message: "Failed to verify on-chain" });
  }
});


// POST /api/links/:linkId/fulfillment/access
router.post("/:linkId/fulfillment/access", async (req: Request, res: Response) => {
  const { linkId } = req.params;
  try {
    // We could create a specific "AuditLog" table for this, 
    // but for now we'll just log it to the console or a simple counter if we had one.
    // In a full implementation, we'd add an `AssetAccess` table.
    console.log(`[fulfillment] Asset access for link ${linkId} at ${new Date().toISOString()}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to log fulfillment access" });
  }
});

// POST /api/links/:id/payments/:paymentId/refund-tx
router.post("/:id/payments/:paymentId/refund-tx", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id: linkId, paymentId } = req.params;
  
  try {
    const link = await prisma.paymentLink.findUnique({ where: { id: linkId as string } });
    const payment = await prisma.paymentRecord.findUnique({ where: { id: paymentId as string } });

    if (!link || !payment) {
      res.status(404).json({ message: "Link or payment not found" });
      return;
    }

    // Auth check: Only the merchant (recipientWallet owner) can refund
    if (!req.user?.allowedIds.includes(link.recipientWallet)) {
      res.status(403).json({ message: "Not authorized to issue refunds for this link." });
      return;
    }

    if (payment.status !== "confirmed") {
      res.status(400).json({ message: "Only confirmed payments can be refunded." });
      return;
    }

    // Construct the reversal transaction
    const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
    const { Transaction, SystemProgram, PublicKey } = require("@solana/web3.js");
    const { getAssociatedTokenAddressSync, createTransferCheckedInstruction } = require("@solana/spl-token");

    const tx = new Transaction();
    const merchantPubkey = new PublicKey(link.recipientWallet);
    const customerPubkey = new PublicKey(payment.payerWallet);
    const amount = BigInt(payment.amountLamports);

    if (payment.token === "SOL") {
      tx.add(SystemProgram.transfer({
        fromPubkey: merchantPubkey,
        toPubkey: customerPubkey,
        lamports: amount,
      }));
    } else {
      const mint = new PublicKey(TOKEN_MINTS[payment.token]);
      const sourceAta = getAssociatedTokenAddressSync(mint, merchantPubkey);
      const destAta = getAssociatedTokenAddressSync(mint, customerPubkey);
      
      tx.add(createTransferCheckedInstruction(
        sourceAta,
        mint,
        destAta,
        merchantPubkey,
        amount,
        TOKEN_DECIMALS[payment.token]
      ));
    }

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = merchantPubkey;

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    res.json({ 
      transaction: serialized.toString("base64"),
      message: `Refund of ${payment.amountLamports} ${payment.token} to ${payment.payerWallet.slice(0,4)}...`
    });

  } catch (err) {
    console.error("[refund] Error:", err);
    res.status(500).json({ message: "Failed to construct refund transaction." });
  }
});

// POST /api/links/:id/payments/:paymentId/refund-confirm
router.post("/:id/payments/:paymentId/refund-confirm", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id: linkId, paymentId } = req.params;
  const { signature } = req.body;

  if (!signature) return res.status(400).json({ message: "Signature required" });

  try {
    const payment = await prisma.paymentRecord.update({
      where: { id: paymentId as string },
      data: { status: "refunded" }
    });
    res.json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ message: "Failed to update payment status" });
  }
});

// ─── ESCROW SETTLEMENT ────────────────────────────────────────────────────

// GET /api/links/escrow/active
router.get("/escrow/active", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const allowedIds = req.user?.allowedIds || [];
  try {
    const escrows = await prisma.paymentRecord.findMany({
      where: {
        escrowStatus: "locked",
        link: {
          merchantId: { in: allowedIds }
        }
      },
      include: { link: { select: { label: true, recipientWallet: true } } },
      orderBy: { createdAt: "desc" }
    });
    res.json(escrows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch active escrows" });
  }
});

// POST /api/links/escrow/release
router.post("/escrow/release", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { recordId } = req.body;
  if (!recordId) return res.status(400).json({ message: "Record ID required" });

  try {
    const record = await prisma.paymentRecord.findUnique({
      where: { id: recordId as string },
      include: { link: true }
    });

    if (!record || record.escrowStatus !== "locked") {
      return res.status(404).json({ message: "Locked escrow record not found" });
    }

    // Auth check: only the merchant can release to themselves
    if (!record.link.merchantId || !req.user?.allowedIds.includes(record.link.merchantId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
    const tx = await buildEscrowSettlementTransaction(
      connection,
      req.user.allowedIds[0], // Payer for the settlement TX fees
      record.link.recipientWallet,
      record.token,
      BigInt(record.amountLamports),
      "release"
    );

    // Note: Since the Escrow wallet is server-side, the server already partially signed it.
    // The merchant (front-end) will sign the fee payment.
    
    // In a real production app, we would broadcast it ourselves if we pay the fees.
    // For now, we return it to the dashboard to sign and send.
    
    res.json({ transaction: serialiseTransaction(tx) });

    // We optimisticly mark it as released for the hackathon demo, 
    // but in production we'd wait for the signature on-chain.
    await prisma.paymentRecord.update({
      where: { id: recordId as string },
      data: { escrowStatus: "released" }
    });

  } catch (err) {
    console.error("[escrow] Release failed:", err);
    res.status(500).json({ message: "Release failed" });
  }
});

// POST /api/links/escrow/refund
router.post("/escrow/refund", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { recordId } = req.body;
  if (!recordId) return res.status(400).json({ message: "Record ID required" });

  try {
    const record = await prisma.paymentRecord.findUnique({
      where: { id: recordId as string },
      include: { link: true }
    });

    if (!record || record.escrowStatus !== "locked") {
      return res.status(404).json({ message: "Locked escrow record not found" });
    }

    // Auth check
    if (!record.link.merchantId || !req.user?.allowedIds.includes(record.link.merchantId)) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const connection = new Connection(process.env.RPC_ENDPOINT || "https://api.devnet.solana.com", "confirmed");
    const tx = await buildEscrowSettlementTransaction(
      connection,
      req.user.allowedIds[0],
      record.payerWallet,
      record.token,
      BigInt(record.amountLamports),
      "refund"
    );

    res.json({ transaction: serialiseTransaction(tx) });

    await prisma.paymentRecord.update({
      where: { id: recordId as string },
      data: { escrowStatus: "refunded" }
    });

  } catch (err) {
    res.status(500).json({ message: "Refund failed" });
  }
});

export default router;
