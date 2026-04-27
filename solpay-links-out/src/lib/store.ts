import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import {
  PaymentLink,
  PaymentRecord,
  CreateLinkInput,
  TOKEN_DECIMALS,
  SupportedToken,
} from "../types";

// ─── Simple JSON File Store ──────────────────────────────────────────────────
// Persistent storage that works without native dependencies (SQLite/Postgres).
// Perfect for hackathons and local development.

const DATA_FILE = path.resolve(process.cwd(), "solpay-data.json");

interface StoreData {
  links: Record<string, any>;
  payments: Record<string, any>;
}

function loadData(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[store] failed to load data file, starting fresh:", err);
  }
  return { links: {}, payments: {} };
}

function saveData(data: StoreData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[store] failed to save data file:", err);
  }
}

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

export function createLink(input: CreateLinkInput): PaymentLink {
  const data = loadData();
  const id = nanoid(10);
  const decimals = TOKEN_DECIMALS[input.token as SupportedToken];

  const amountLamports =
    input.amount !== undefined
      ? BigInt(Math.round(input.amount * 10 ** decimals))
      : null;

  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : null;

  const link: any = {
    id,
    recipientWallet: input.recipientWallet,
    amountLamports: amountLamports?.toString() ?? null,
    token: input.token as SupportedToken,
    label: input.label,
    description: input.description,
    memo: input.memo ?? null,
    expiresAt: expiresAt?.toISOString() ?? null,
    maxPayments: input.maxPayments ?? null,
    paymentCount: 0,
    redirectUrl: input.redirectUrl ?? null,
    status: "active",
    createdAt: new Date().toISOString(),
    merchantId: input.merchantId,
  };

  data.links[id] = link;
  saveData(data);

  return mapLink(link);
}

export function getLinkById(id: string): PaymentLink | undefined {
  const data = loadData();
  const link = data.links[id];
  return link ? mapLink(link) : undefined;
}

export function getAllLinks(merchantId?: string): PaymentLink[] {
  const data = loadData();
  let links = Object.values(data.links);
  
  if (merchantId) {
    links = links.filter((l: any) => l.merchantId === merchantId);
  }

  return links
    .map(mapLink)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function incrementPaymentCount(id: string): void {
  const data = loadData();
  const link = data.links[id];
  if (link) {
    link.paymentCount += 1;
    if (link.maxPayments !== null && link.paymentCount >= link.maxPayments) {
      link.status = "completed";
    }
    data.links[id] = link;
    saveData(data);
  }
}

export function getLinkStatus(link: PaymentLink): {
  active: boolean;
  reason?: string;
} {
  if (link.status === "cancelled") return { active: false, reason: "This payment link has been cancelled." };
  if (link.status === "completed") return { active: false, reason: "This payment link has reached its payment limit." };
  if (link.expiresAt && new Date() > link.expiresAt) {
    return { active: false, reason: "This payment link has expired." };
  }
  return { active: true };
}

// ─── Payment records ──────────────────────────────────────────────────────────

export function createPaymentRecord(
  linkId: string,
  payerWallet: string,
  amountLamports: bigint,
  token: SupportedToken
): PaymentRecord {
  const data = loadData();
  const id = nanoid(12);

  const record: any = {
    id,
    linkId,
    payerWallet,
    amountLamports: amountLamports.toString(),
    token,
    signature: null,
    status: "pending",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
  };

  data.payments[id] = record;
  saveData(data);

  return mapPayment(record);
}

export function confirmPayment(recordId: string, signature: string): void {
  const data = loadData();
  const record = data.payments[recordId];
  if (record) {
    record.signature = signature;
    record.status = "confirmed";
    record.confirmedAt = new Date().toISOString();
    data.payments[recordId] = record;
    saveData(data);
    
    incrementPaymentCount(record.linkId);
  }
}

export function getPaymentsForLink(linkId: string): PaymentRecord[] {
  const data = loadData();
  return Object.values(data.payments)
    .filter((p: any) => p.linkId === linkId)
    .map(mapPayment)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
