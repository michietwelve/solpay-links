import { Router, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../lib/db";

const router = Router();

// GET /api/debug — Basic session info
router.get("/", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user,
    env: {
      PRIVY_APP_ID: process.env.PRIVY_APP_ID ? "set" : "missing",
      RPC_ENDPOINT: process.env.RPC_ENDPOINT ? "set" : "missing",
    }
  });
});

// GET /api/debug/deep — Full diagnostic: shows DB state vs. session state
router.get("/deep", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const allowedIds = req.user?.allowedIds || [];

  // 1. Find links matching allowedIds
  const matchedLinks = await prisma.paymentLink.findMany({
    where: {
      OR: [
        { merchantId: { in: allowedIds } },
        { recipientWallet: { in: allowedIds } }
      ]
    },
    take: 20
  });

  // 2. Find ALL recent payment records (last 20, regardless of ownership)
  const recentPayments = await prisma.paymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      linkId: true,
      payerWallet: true,
      amountLamports: true,
      token: true,
      status: true,
      signature: true,
      createdAt: true,
    }
  });

  // 3. Find links for those recent payments
  const recentLinkIds = [...new Set(recentPayments.map(p => p.linkId))];
  const recentLinks = await prisma.paymentLink.findMany({
    where: { id: { in: recentLinkIds } },
    select: { id: true, label: true, merchantId: true, recipientWallet: true }
  });

  // 4. Check if any of those link merchantIds/recipientWallets match allowedIds
  const enriched = recentPayments.map(p => {
    const link = recentLinks.find(l => l.id === p.linkId);
    const merchantIdMatch = link ? allowedIds.includes(link.merchantId || "") : false;
    const walletMatch = link ? allowedIds.includes(link.recipientWallet || "") : false;
    return {
      ...p,
      linkLabel: link?.label,
      linkMerchantId: link?.merchantId,
      linkRecipientWallet: link?.recipientWallet,
      merchantIdMatch,
      walletMatch,
      willShowInDashboard: merchantIdMatch || walletMatch
    };
  });

  res.json({
    sessionAllowedIds: allowedIds,
    matchedLinksCount: matchedLinks.length,
    matchedLinks: matchedLinks.map(l => ({
      id: l.id, label: l.label, merchantId: l.merchantId, recipientWallet: l.recipientWallet
    })),
    recentPaymentsAcrossAllMerchants: enriched,
    diagnosis: matchedLinks.length === 0 
      ? "PROBLEM: No links found for your session IDs. Your payment link's merchantId or recipientWallet is not in your allowedIds."
      : enriched.filter(p => !p.willShowInDashboard).length > 0
      ? "PROBLEM: Some payments exist but their links have a merchantId/recipientWallet mismatch."
      : "OK: Links found. Check payment statuses."
  });
});

export default router;
