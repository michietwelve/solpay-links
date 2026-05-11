import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { TOKEN_DECIMALS, SupportedToken } from "../types";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// GET /api/merchants/:merchantId/analytics
router.get("/:merchantId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { merchantId } = req.params;
  const ids = (merchantId as string).split(",");
  
  // Filter IDs to only include those the user is authorized for
  const allowedIds = req.user?.allowedIds || [];
  const authorizedIds = ids.filter(id => allowedIds.includes(id));
  
  if (authorizedIds.length === 0) {
    res.json([]);
    return;
  }
  
  // 1. Fetch real-time prices for USD conversion
  const tokenList = ["SOL", "USDC", "USDT", "BONK", "WIF"];
  let prices: Record<string, number> = { SOL: 140, USDC: 1, USDT: 1, BONK: 0.000025, WIF: 2.5 };
  
  try {
    const priceRes = await fetch(`https://price.jup.ag/v6/price?ids=${tokenList.join(",")}`);
    if (priceRes.ok) {
      const priceData = await priceRes.json() as any;
      tokenList.forEach(t => {
        if (priceData.data[t]) prices[t] = priceData.data[t].price;
      });
    }
  } catch (e) {
    console.warn("[analytics] Price fetch failed, using fallback prices.");
  }

  // 2. Fetch all confirmed payments
  const payments = await prisma.paymentRecord.findMany({
    where: {
      status: "confirmed",
      link: {
        OR: [
          { merchantId: { in: authorizedIds } },
          { recipientWallet: { in: authorizedIds } }
        ]
      }
    },
    include: {
      link: true
    },
    orderBy: { confirmedAt: "asc" }
  });

  // 3. Aggregate data
  const dailyVolume: Record<string, number> = {};
  const volumeByLink: Record<string, { label: string, volume: number, count: number }> = {};
  const volumeByToken: Record<string, number> = {};

  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    dailyVolume[d.toISOString().split("T")[0]] = 0;
  }

  payments.forEach(p => {
    if (!p.confirmedAt) return;
    
    const decimals = TOKEN_DECIMALS[p.token as SupportedToken] ?? 6;
    const rawAmount = Number(BigInt(p.amountLamports)) / 10 ** decimals;
    const usdValue = rawAmount * (prices[p.token] || 0);

    // Daily volume
    const dateStr = new Date(p.confirmedAt).toISOString().split("T")[0];
    if (dailyVolume[dateStr] !== undefined) {
      dailyVolume[dateStr] += usdValue;
    }

    // Volume by Link
    if (!volumeByLink[p.linkId]) {
      volumeByLink[p.linkId] = { label: p.link?.label || p.linkId, volume: 0, count: 0 };
    }
    volumeByLink[p.linkId].volume += usdValue;
    volumeByLink[p.linkId].count += 1;

    // Volume by Token
    volumeByToken[p.token] = (volumeByToken[p.token] || 0) + usdValue;
  });

  res.json({
    chart: Object.entries(dailyVolume).map(([date, volume]) => ({
      date,
      volume: Number(volume.toFixed(2))
    })),
    byLink: Object.values(volumeByLink).sort((a, b) => b.volume - a.volume),
    byToken: Object.entries(volumeByToken).map(([token, volume]) => ({
      token,
      volume: Number(volume.toFixed(2))
    })).sort((a, b) => b.volume - a.volume)
  });
});

export default router;
