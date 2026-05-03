import { Router, Request, Response } from "express";
import { prisma } from "../lib/db";
import { TOKEN_DECIMALS, SupportedToken } from "../types";

const router = Router();

// GET /api/merchants/:merchantId/analytics
router.get("/:merchantId", async (req: Request, res: Response) => {
  const { merchantId } = req.params;
  
  // Fetch all confirmed payments for links belonging to this merchant
  const payments = await prisma.paymentRecord.findMany({
    where: {
      status: "confirmed",
      link: {
        merchantId: merchantId as string
      }
    },
    include: {
      link: true
    },
    orderBy: { confirmedAt: "asc" }
  });

  // Group by day (last 7 days)
  const days: Record<string, number> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    days[d.toISOString().split("T")[0]] = 0;
  }

  payments.forEach(p => {
    if (!p.confirmedAt) return;
    const dateStr = new Date(p.confirmedAt).toISOString().split("T")[0];
    if (days[dateStr] !== undefined) {
      const decimals = TOKEN_DECIMALS[p.token as SupportedToken] ?? 6;
      const amount = Number(BigInt(p.amountLamports)) / 10 ** decimals;
      // For simplicity, we aggregate all tokens as a raw "unit" sum in the chart
      // In a real app, you'd convert to USD using a price feed
      days[dateStr] += amount;
    }
  });

  const chartData = Object.entries(days).map(([date, volume]) => ({
    date,
    volume: Number(volume.toFixed(2))
  }));

  res.json(chartData);
});

export default router;
