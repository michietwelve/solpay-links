import { Router, Request, Response } from "express";
import { getLinkById, getLinkStatus, getEffectiveStatus, incrementViewCount } from "../lib/store";
import { getMerchantProfile } from "../lib/merchant";
import { actionError } from "../middleware/actions";
import { detectLocalCurrency, getFiatEquivalent } from "../lib/fx";

// ... (rest of imports)

const router = Router();

router.get("/:linkId", async (req: Request, res: Response): Promise<void> => {
  const linkId = req.params.linkId as string;
  const link = await getLinkById(linkId);

  if (!link) {
    actionError(res, 404, "Payment link not found.");
    return;
  }

  // Fire and forget view tracking
  incrementViewCount(linkId);

  const merchant = await getMerchantProfile(link.merchantId);
  const { active, reason } = getLinkStatus(link);

  const decimals = link.token === "SOL" ? 9 : 6;
  const amountNum =
    link.amountLamports !== null
      ? Number(link.amountLamports) / 10 ** decimals
      : null;
  
  const amountHuman = amountNum !== null
      ? amountNum.toFixed(link.token === "SOL" ? 4 : 2)
      : null;

  // PPP Localization logic
  let localFiat = null;
  if (amountNum !== null) {
    // Extract country code from Cloudflare/Railway proxy header
    const countryCode = (req.headers["cf-ipcountry"] as string)
      ?? (req.headers["x-vercel-ip-country"] as string)
      ?? undefined;
    const currency = detectLocalCurrency(countryCode);
    const fiatValue = getFiatEquivalent(amountNum, currency);
    localFiat = {
      currency,
      value: fiatValue,
      label: `~${fiatValue} ${currency}`
    };
  }

  res.json({
    id: link.id,
    label: link.label,
    description: link.description,
    recipientWallet: link.recipientWallet,
    token: link.token,
    amountHuman,
    localFiat, // New field for PPP
    isOpenAmount: link.amountLamports === null,
    memo: link.memo,
    redirectUrl: link.redirectUrl,
    digitalAssetUrl: link.digitalAssetUrl,
    expiresAt: link.expiresAt,
    paymentCount: link.paymentCount,
    maxPayments: link.maxPayments,
    status: getEffectiveStatus(link),
    active,
    inactiveReason: reason ?? null,
    merchant: {
      businessName: merchant.businessName,
      logoUrl: merchant.logoUrl,
      accentColor: merchant.accentColor,
      snsDomain: merchant.snsDomain,
    },
    // Crowdfund / Split Goal Data
    isSplitPayment: link.isSplitPayment,
    targetAmountLamports: link.targetAmountLamports,
    currentAmountLamports: (link.payments || [])
      .filter((p: any) => p.status === "confirmed")
      .reduce((sum: bigint, p: any) => sum + BigInt(p.amountLamports), 0n)
      .toString(),
  });
});

export default router;
