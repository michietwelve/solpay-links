import { nanoid } from "nanoid";
import { prisma } from "./db";
import {
  PaymentLink,
  PaymentRecord,
  CreateLinkInput,
  TOKEN_DECIMALS,
  SupportedToken,
} from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapLink(data: any): PaymentLink {
  return {
    ...data,
    amountLamports: data.amountLamports ? BigInt(data.amountLamports) : null,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    createdAt: new Date(data.createdAt),
  };
}

function mapPayment(data: any): PaymentRecord {
  return {
    ...data,
    amountLamports: BigInt(data.amountLamports),
    createdAt: new Date(data.createdAt),
    confirmedAt: data.confirmedAt ? new Date(data.confirmedAt) : null,
  };
}

// ─── Link CRUD ────────────────────────────────────────────────────────────────

export async function createLink(input: CreateLinkInput): Promise<PaymentLink> {
  const id = nanoid(10);
  const decimals = TOKEN_DECIMALS[input.token as SupportedToken];

  const amountLamports =
    input.amount !== undefined
      ? BigInt(Math.round(input.amount * 10 ** decimals))
      : null;

  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : null;

  const link = await prisma.paymentLink.create({
    data: {
      id,
      recipientWallet: input.recipientWallet,
      amountLamports: amountLamports?.toString() ?? null,
      token: input.token as SupportedToken,
      label: input.label,
      description: input.description,
      memo: input.memo ?? null,
      expiresAt,
      maxPayments: input.maxPayments ?? null,
      paymentCount: 0,
      redirectUrl: input.redirectUrl ?? null,
      status: "active",
      merchantId: input.merchantId,
    },
  });

  return mapLink(link);
}

export async function getLinkById(id: string): Promise<PaymentLink | undefined> {
  const link = await prisma.paymentLink.findUnique({
    where: { id },
  });
  return link ? mapLink(link) : undefined;
}

export async function getAllLinks(merchantId?: string): Promise<PaymentLink[]> {
  const links = await prisma.paymentLink.findMany({
    where: merchantId ? { merchantId } : {},
    orderBy: { createdAt: "desc" },
  });

  return links.map(mapLink);
}

export async function incrementPaymentCount(id: string): Promise<void> {
  const link = await prisma.paymentLink.findUnique({ where: { id } });
  if (link) {
    const newCount = link.paymentCount + 1;
    let newStatus = link.status;
    
    if (link.maxPayments !== null && newCount >= link.maxPayments) {
      newStatus = "completed";
    }

    await prisma.paymentLink.update({
      where: { id },
      data: {
        paymentCount: newCount,
        status: newStatus,
      },
    });
  }
}

export async function deleteLink(id: string): Promise<void> {
  await prisma.paymentLink.delete({ where: { id } });
}

export function getEffectiveStatus(link: PaymentLink): LinkStatus {
  if (link.status === "cancelled") return "cancelled";
  if (link.status === "completed") return "completed";
  if (link.expiresAt && new Date() > link.expiresAt) return "expired";
  return "active";
}

export function getLinkStatus(link: PaymentLink): {
  active: boolean;
  reason?: string;
} {
  const status = getEffectiveStatus(link);

  switch (status) {
    case "cancelled":
      return { active: false, reason: "This payment link has been cancelled." };
    case "completed":
      return { active: false, reason: "This payment link has reached its payment limit." };
    case "expired":
      return { active: false, reason: "This payment link has expired." };
    case "active":
    default:
      return { active: true };
  }
}

// ─── Payment records ──────────────────────────────────────────────────────────

export async function createPaymentRecord(
  linkId: string,
  payerWallet: string,
  amountLamports: bigint,
  token: SupportedToken
): Promise<PaymentRecord> {
  const id = nanoid(12);

  const record = await prisma.paymentRecord.create({
    data: {
      id,
      linkId,
      payerWallet,
      amountLamports: amountLamports.toString(),
      token,
      status: "pending",
    },
  });

  return mapPayment(record);
}

export async function confirmPayment(recordId: string, signature: string): Promise<void> {
  const record = await prisma.paymentRecord.findUnique({ where: { id: recordId } });
  if (record) {
    await prisma.paymentRecord.update({
      where: { id: recordId },
      data: {
        signature,
        status: "confirmed",
        confirmedAt: new Date(),
      },
    });
    
    await incrementPaymentCount(record.linkId);
  }
}

export async function getPaymentsForLink(linkId: string): Promise<PaymentRecord[]> {
  const payments = await prisma.paymentRecord.findMany({
    where: { linkId },
    orderBy: { createdAt: "desc" },
  });
  return payments.map(mapPayment);
}
