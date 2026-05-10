import { Router, Request, Response } from "express";
import { getLinkById, getLinkStatus, getEffectiveStatus } from "../lib/store";
import { getMerchantProfile } from "../lib/merchant";
import { actionError } from "../middleware/actions";
import { detectLocalCurrency, getFiatEquivalent } from "../lib/fx";

// ... (rest of imports)

const router = Router();

router.get("/:linkId", async (req: Request, res: Response): Promise<void> => {
  const link = await getLinkById(req.params.linkId as string);

  if (!link) {
    actionError(res, 404, "Payment link not found.");
    return;
  }

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
    const currency = detectLocalCurrency(req);
    const fiatValue = getFiatEquivalent(amountNum, link.token, currency);
    localFiat = {
      currency,
      value: fiatValue,
      label: `~${fiatValue.toLocaleString()} ${currency}`
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
    },
  });
});

export default router;
