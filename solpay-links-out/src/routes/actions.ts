import { Router, Request, Response } from "express";
import { Connection } from "@solana/web3.js";
import { getLinkById, getLinkStatus, createPaymentRecord } from "../lib/store";
import {
  buildPaymentTransaction,
  serialiseTransaction,
  resolveAmount,
} from "../lib/transaction";
import { PostPaymentSchema } from "../types";
import { actionError, optionsPreflight } from "../middleware/actions";
import type {
  ActionGetResponse,
  ActionPostResponse,
  ActionParameter,
} from "../types";

const router = Router();

const RPC = process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const API_BASE = process.env.API_BASE_URL ?? "https://solpay-links-production.up.railway.app";
const ICON_URL =
  process.env.ICON_URL ??
  "https://solpay.link/icon.png";

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

  const { active, reason } = getLinkStatus(link);

  // ── Build the response ──────────────────────────────────────────────────

  const isOpenAmount = link.amountLamports === null;

  // Determine the label for fixed-amount links
  const decimals = link.token === "SOL" ? 4 : 2;
  const amountLabel = isOpenAmount
    ? `Pay in ${link.token}`
    : `Pay ${(Number(link.amountLamports) / 10 ** (link.token === "SOL" ? 9 : 6)).toFixed(decimals)} ${link.token}`;

  const payHref = isOpenAmount
    ? `${API_BASE}/actions/${linkId}/pay?amount={amount}`
    : `${API_BASE}/actions/${linkId}/pay`;

  const parameters: ActionParameter[] | undefined = isOpenAmount
    ? [
        {
          type: "number",
          name: "amount",
          label: `Amount in ${link.token}`,
          required: true,
          min: 0.000001,
        },
      ]
    : undefined;

  const body: ActionGetResponse = {
    type: "action",
    icon: ICON_URL,
    title: link.label,
    description: link.description,
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
          ...(parameters ? { parameters } : {}),
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

  // 4. Record this pending payment attempt FIRST so we have a reference ID
  const record = await createPaymentRecord(linkId, account, amountBaseUnits, link.token);

  // 5. Build the transaction using the record.id as the reference
  let serialisedTx: string;
  let amountHuman: string;

  try {
    const connection = new Connection(RPC, "confirmed");
    const { transaction, amountHuman: human } = await buildPaymentTransaction(
      connection,
      account,
      link,
      amountBaseUnits,
      record.id
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
          title: "Payment sent!",
          icon: ICON_URL,
          label: "Done",
          description: `Your payment of ${amountHuman} ${link.token} has been submitted.`,
        },
      },
    };
  }

  res.status(200).json(body);
});

export default router;
