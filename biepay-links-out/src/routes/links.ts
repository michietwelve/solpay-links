import { Router, Request, Response } from "express";
import {
  createLink,
  getLinkById,
  getAllLinks,
  getPaymentsForLink,
  getEffectiveStatus,
  deleteLink,
} from "../lib/store";
import { CreateLinkSchema } from "../types";
import { actionError } from "../middleware/actions";

const router = Router();
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

// ─── POST /api/links  ─────────────────────────────────────────────────────
// Create a new payment link. Returns the link object + ready-to-share URLs.

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    actionError(res, 400, parsed.error.errors.map((e) => e.message).join("; "));
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

// ─── GET /api/links  ─────────────────────────────────────────────────────
// Simple list (no pagination yet — add cursor-based pagination for prod)

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const merchantIdParam = req.query.merchantId as string | undefined;
  
  let links: any[] = [];
  if (merchantIdParam) {
    const ids = merchantIdParam.split(",");
    links = await prisma.paymentLink.findMany({
      where: {
        OR: [
          { merchantId: { in: ids } },
          { recipientWallet: { in: ids } }
        ]
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    links = await prisma.paymentLink.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  res.json(
    links.map((l: any) => ({
      ...l,
      status: getEffectiveStatus(l as any),
      amountLamports: l.amountLamports?.toString() ?? null,
    }))
  );
});

// ─── DELETE /api/links/:id  ───────────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const link = await getLinkById(req.params.id as string);
  if (!link) {
    actionError(res, 404, "Link not found.");
    return;
  }
  await deleteLink(req.params.id as string);
  res.status(204).end();
});

export default router;
