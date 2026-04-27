import { Router, Request, Response } from "express";
import { getLinkById, getLinkStatus } from "../lib/store";
import { actionError } from "../middleware/actions";

/**
 * GET /pay/:linkId
 *
 * Returns JSON that the hosted payment page (solpay-dashboard) consumes to
 * render a self-contained checkout experience using Privy (embedded wallet)
 * and MoonPay (fiat-to-crypto ramp) for users who don't have a Solana wallet.
 *
 * The dashboard's /pay/[linkId] Next.js page calls this endpoint on load.
 */

const router = Router();

router.get("/:linkId", (req: Request, res: Response): void => {
  const link = getLinkById(req.params.linkId as string);

  if (!link) {
    actionError(res, 404, "Payment link not found.");
    return;
  }

  const { active, reason } = getLinkStatus(link);

  const decimals = link.token === "SOL" ? 9 : 6;
  const amountHuman =
    link.amountLamports !== null
      ? (Number(link.amountLamports) / 10 ** decimals).toFixed(
          link.token === "SOL" ? 4 : 2
        )
      : null;

  res.json({
    id: link.id,
    label: link.label,
    description: link.description,
    recipientWallet: link.recipientWallet,
    token: link.token,
    amountHuman,                    // null = open amount
    isOpenAmount: link.amountLamports === null,
    memo: link.memo,
    redirectUrl: link.redirectUrl,
    expiresAt: link.expiresAt,
    paymentCount: link.paymentCount,
    maxPayments: link.maxPayments,
    status: link.status,
    active,
    inactiveReason: reason ?? null,
  });
});

export default router;
