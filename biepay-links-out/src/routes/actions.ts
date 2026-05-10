import { Router, Request, Response } from "express";
import { Connection } from "@solana/web3.js";
import { getLinkById, getLinkStatus, createPaymentRecord, getPaymentsForLink } from "../lib/store";
import { getMerchantProfile } from "../lib/merchant";
import {
  buildPaymentTransaction,
  serialiseTransaction,
  resolveAmount,
} from "../lib/transaction";
import { PostPaymentSchema } from "../types";
import { prisma } from "../lib/db";
import { actionError, optionsPreflight } from "../middleware/actions";
import type {
  ActionGetResponse,
  ActionPostResponse,
  ActionParameter,
} from "../types";
import { detectLocalCurrency, getFiatEquivalent } from "../lib/fx";

const router = Router();

const RPC = process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const API_BASE = process.env.API_BASE_URL ?? "https://biepay-links-production.up.railway.app";
const ICON_URL =
  process.env.ICON_URL ??
  "https://biepay.link/icon.png";

// ─── OPTIONS preflight ────────────────────────────────────────────────────

router.options("/:linkId", optionsPreflight);
router.options("/:linkId/pay", optionsPreflight);

// ─── GET /actions/:linkId  ————————————————————————————————————————────────
// Returns Blink metadata: icon, title, description, and action buttons.
// Phantom / Backpack renders this before the user signs anything.

router.get("/:linkId", async (req: Request, res: Response): Promise<void> => {
  const linkId = req.params.linkId as string;

  const link = await getLinkById(linkId);
  if (!link) {
    actionError(res, 404, "Payment link not found.");
    return;
  }

  const merchant = await getMerchantProfile(link.merchantId);
  if (!merchant) {
    actionError(res, 404, "Merchant profile not found.");
    return;
  }

  const { active, reason } = getLinkStatus(link);

  // ── Build the response ──────────────────────────────────────────────────

  const isOpenAmount = link.amountLamports === null;
  const decimals = link.token === "SOL" ? 4 : 2;
  
  // 1. Localized PPP Pricing
  const userRegion = (req.headers["x-vercel-ip-country"] as string) || "NG";
  const localCurrency = detectLocalCurrency(userRegion);
  
  let amountLabel = "";
  if (isOpenAmount) {
    amountLabel = `Pay in ${link.token}`;
  } else {
    const rawAmount = Number(link.amountLamports) / 10 ** (link.token === "SOL" ? 9 : 6);
    const localAmountString = getFiatEquivalent(rawAmount, localCurrency);
    amountLabel = `Pay ${rawAmount.toFixed(decimals)} ${link.token} (~${localAmountString} ${localCurrency})`;
  }

  // 2. Jupiter Any-to-Any Swap (Token Selection)
  const referrer = (req.query.ref as string) || "";
  const payHref = isOpenAmount
    ? `${API_BASE}/actions/${linkId}/pay?amount={amount}&inputToken={inputToken}${referrer ? `&referrerWallet=${referrer}` : ""}`
    : `${API_BASE}/actions/${linkId}/pay?inputToken={inputToken}${referrer ? `&referrerWallet=${referrer}` : ""}`;

  const parameters: ActionParameter[] = [];
  
  if (isOpenAmount) {
    parameters.push({
      type: "number",
      name: "amount",
      label: `Amount in ${link.token}`,
      required: true,
      min: 0.000001,
    });
  }

  // Add the Any-to-Any Token Selection parameter
  parameters.push({
    type: "select",
    name: "inputToken",
    label: "Pay with (Any Token)",
    required: true,
    options: [
      { label: `Pay exactly in ${link.token}`, value: link.token },
      { label: "Pay with SOL", value: "SOL" },
      { label: "Pay with USDC", value: "USDC" },
      { label: "Pay with BONK", value: "BONK" },
      { label: "Pay with WIF", value: "WIF" },
    ]
  });

  // 3. Social Split Payment Progress
  let finalDescription = link.description;
  if (link.isSplitPayment && link.targetAmountLamports) {
    const payments = await getPaymentsForLink(linkId);
    const confirmedTotal = payments
      .filter(p => p.status === "confirmed")
      .reduce((sum, p) => sum + p.amountLamports, 0n);
    
    const target = BigInt(link.targetAmountLamports);
    const progress = (Number(confirmedTotal) / Number(target)) * 100;
    const decimals = link.token === "SOL" ? 9 : 6;
    const humanTotal = (Number(confirmedTotal) / 10**decimals).toFixed(2);
    const humanTarget = (Number(target) / 10**decimals).toFixed(2);
    
    finalDescription = `🔥 Social Split: ${humanTotal} / ${humanTarget} ${link.token} raised (${progress.toFixed(1)}%)\n\n${link.description}`;
  }

  const body: ActionGetResponse = {
    type: "action",
    icon: merchant.logoUrl ?? ICON_URL,
    title: merchant.businessName ?? link.label,
    description: finalDescription,
    label: active ? amountLabel : "Unavailable",
    disabled: !active,
    ...(active
      ? {}
      : { error: { message: reason ?? "This link is no longer active." } }),
    links: {
      actions: [
        {
          type: "transaction",
          href: payHref,
          label: active ? amountLabel : "Unavailable",
          parameters,
        },
      ],
    },
  };

  res.status(200).json(body);
});

// ─── POST /actions/:linkId/pay  ───────────────────────────────────────────
// Builds and returns a serialized, unsigned transaction for the payer's
// wallet to sign. The wallet sends it to the network itself.

router.post("/:linkId/pay", async (req: Request, res: Response): Promise<void> => {
  const linkId = req.params.linkId as string;

  // 1. Validate the link exists and is still active
  const link = await getLinkById(linkId);
  if (!link) {
    actionError(res, 404, "Payment link not found.");
    return;
  }

  const { active, reason } = getLinkStatus(link);
  if (!active) {
    actionError(res, 403, reason ?? "This link is no longer active.");
    return;
  }

  // 2. Validate the POST body
  const parsed = PostPaymentSchema.safeParse({
    account: req.body.account,
    inputToken: req.body.inputToken,
    referrerWallet: req.body.referrerWallet ?? req.query.referrerWallet,
    // amount may come from body (fixed) or query param (open amount link)
    amount: req.body.amount ?? (req.query.amount ? Number(req.query.amount) : undefined),
  });

  if (!parsed.success) {
    actionError(res, 400, parsed.error.errors[0]?.message ?? "Invalid request body.");
    return;
  }

  const { account, amount } = parsed.data;

  // 3. Resolve amount (fixed from link, or provided by user)
  let amountBaseUnits: bigint;
  try {
    amountBaseUnits = resolveAmount(link, amount);
  } catch (err) {
    actionError(res, 400, (err as Error).message);
    return;
  }

  // 3.5. BiePay Allowance Check: Daily Spending Caps
  // If the link has a maxDailySpend (simulated via metadata or global for now)
  // For the hackathon, we'll enforce a strict 1000 USDC default cap for non-pro users
  // or use the merchant's custom limit if we had one.
  const ONE_DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todaysPayments = await prisma.paymentRecord.findMany({
    where: {
      payerWallet: account,
      status: "confirmed",
      createdAt: { gte: ONE_DAY_AGO }
    }
  });

  const totalToday = todaysPayments.reduce((sum, p) => sum + BigInt(p.amountLamports), 0n);
  const limit = BigInt(1000 * 10**6); // Default 1000 USDC cap for demo
  
  if (totalToday + amountBaseUnits > limit) {
    actionError(res, 400, `BiePay Allowance Exceeded: Your daily spending limit is 1000 USDC. You have spent ${Number(totalToday)/10**6} USDC today.`);
    return;
  }

  // 4. Social Split Validation: Ensure we don't over-fund
  if (link.isSplitPayment && link.targetAmountLamports) {
    const payments = await getPaymentsForLink(linkId);
    const confirmedTotal = payments
      .filter(p => p.status === "confirmed")
      .reduce((sum, p) => sum + p.amountLamports, 0n);
    
    const target = BigInt(link.targetAmountLamports);
    if (confirmedTotal >= target) {
      actionError(res, 400, "This Social Split has already reached its goal!");
      return;
    }

    if (confirmedTotal + amountBaseUnits > target) {
      const remaining = target - confirmedTotal;
      const decimals = link.token === "SOL" ? 9 : 6;
      const humanRemaining = (Number(remaining) / 10**decimals).toFixed(decimals === 9 ? 4 : 2);
      actionError(res, 400, `This exceeds the remaining goal. Please pay ${humanRemaining} ${link.token} or less.`);
      return;
    }
  }

  // 5. Record this pending payment attempt FIRST so we have a reference ID
  const record = await createPaymentRecord(linkId, account, amountBaseUnits, link.token);

  // 6. Build the transaction using the record.id as the reference
  let serialisedTx: string;
  let amountHuman: string;

  try {
    const connection = new Connection(RPC, "confirmed");
    const { transaction, amountHuman: human } = await buildPaymentTransaction(
      connection,
      account,
      link,
      amountBaseUnits,
      record.id,
      parsed.data.inputToken,
      parsed.data.referrerWallet
    );

    serialisedTx = serialiseTransaction(transaction);
    amountHuman = human;
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[POST /actions/:linkId/pay] build tx error:", msg);
    actionError(res, 500, `Failed to build transaction: ${msg}`);
    return;
  }

  // 6. Return the signed-ready transaction to the wallet
  const body: ActionPostResponse = {
    type: "transaction",
    transaction: serialisedTx,
    message: `Paying ${amountHuman} ${link.token} to ${link.label}. ${
      link.memo ? `Memo: ${link.memo}` : ""
    }`.trim(),
  };

  // If the merchant specified a redirect, include it as a next action hint
  // using the Action chaining spec (next.type = "post")
  if (link.redirectUrl) {
    (body as unknown as Record<string, unknown>).links = {
      next: {
        type: "inline",
        action: {
          type: "completed",
          title: link.isEscrowEnabled ? "Funds Locked in Escrow" : "Payment sent!",
          icon: ICON_URL,
          label: link.isEscrowEnabled ? "Confirm Receipt" : "Done",
          description: link.isEscrowEnabled 
            ? `Your payment of ${amountHuman} ${link.token} is held in BiePay Escrow. Click 'Confirm Receipt' once you receive your items to release funds to the merchant.`
            : `Your payment of ${amountHuman} ${link.token} has been submitted.`,
          ...(link.isEscrowEnabled ? {
            links: {
              actions: [
                {
                  type: "post",
                  href: `${API_BASE}/actions/${linkId}/release/${record.id}`,
                  label: "Confirm Receipt ✅",
                }
              ]
            }
          } : {})
        },
      },
    };
  }

  res.status(200).json(body);
});

export default router;
