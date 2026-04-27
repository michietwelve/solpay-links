/**
 * lib/api.ts
 * Typed fetch client for the SolPay Links Express API.
 * All dashboard components import from here — never raw fetch.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// The hosted payment page lives on the Next.js dashboard, not the Express API.
// In production these may be on separate domains.
const DASHBOARD_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_DASHBOARD_URL ?? BASE);

export type SupportedToken = "SOL" | "USDC" | "USDT";
export type LinkStatus = "active" | "completed" | "expired" | "cancelled";

export interface PaymentLink {
  id: string;
  recipientWallet: string;
  amountLamports: string | null;   // serialised bigint from JSON
  token: SupportedToken;
  label: string;
  description: string;
  memo: string | null;
  expiresAt: string | null;
  maxPayments: number | null;
  paymentCount: number;
  redirectUrl: string | null;
  status: LinkStatus;
  createdAt: string;
  merchantId: string;
}

export interface CreateLinkPayload {
  recipientWallet: string;
  amount?: number;
  token: SupportedToken;
  label: string;
  description: string;
  memo?: string;
  expiresInMinutes?: number;
  maxPayments?: number;
  redirectUrl?: string;
  merchantId: string;
}

export interface CreateLinkResponse {
  link: PaymentLink;
  urls: {
    blinkUrl: string;
    actionUrl: string;
    payPageUrl: string;
  };
  meta: {
    isOpenAmount: boolean;
    token: SupportedToken;
    expiresAt: string | null;
  };
}

export interface PaymentRecord {
  id: string;
  linkId: string;
  payerWallet: string;
  amountLamports: string;
  token: SupportedToken;
  signature: string | null;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
  confirmedAt: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Link API ─────────────────────────────────────────────────────────────────

export const linksApi = {
  list: (merchantId?: string): Promise<PaymentLink[]> =>
    apiFetch(`/api/links${merchantId ? `?merchantId=${merchantId}` : ""}`),

  get: (id: string): Promise<PaymentLink> =>
    apiFetch(`/api/links/${id}`),

  create: (payload: CreateLinkPayload): Promise<CreateLinkResponse> =>
    apiFetch("/api/links", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  payments: (id: string): Promise<{ link: PaymentLink; payments: PaymentRecord[] }> =>
    apiFetch(`/api/links/${id}/payments`),
};

// ─── Analytics helpers (client-side, derived from link list) ─────────────────

export interface DashboardStats {
  totalVolume: number;
  totalPayments: number;
  activeLinks: number;
  platformFees: number;
}

export function computeStats(links: PaymentLink[]): DashboardStats {
  const FEE_BPS = 50;

  let totalVolumeLamports = 0;
  let totalPayments = 0;
  let activeLinks = 0;

  for (const l of links) {
    if (l.status === "active") activeLinks++;
    totalPayments += l.paymentCount;

    if (l.amountLamports !== null) {
      const perPayment = Number(l.amountLamports);
      const decimals = l.token === "SOL" ? 9 : 6;
      const usdPerUnit = l.token === "SOL" ? 140 : 1; // rough price oracle
      totalVolumeLamports +=
        (perPayment / 10 ** decimals) * l.paymentCount * usdPerUnit;
    }
  }

  return {
    totalVolume: totalVolumeLamports,
    totalPayments,
    activeLinks,
    platformFees: (totalVolumeLamports * FEE_BPS) / 10_000,
  };
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function getShareUrls(linkId: string) {
  const apiBase = BASE;
  return {
    blink: `https://dial.to/?action=solana-action:${encodeURIComponent(`${apiBase}/actions/${linkId}`)}`,
    action: `solana-action:${apiBase}/actions/${linkId}`,
    payPage: `${DASHBOARD_BASE}/pay/${linkId}`,
  };
}

export function formatAmount(
  lamports: string | null,
  token: SupportedToken
): string {
  if (lamports === null) return "Open";
  const decimals = token === "SOL" ? 9 : 6;
  const n = Number(lamports) / 10 ** decimals;
  return token === "SOL"
    ? `${n.toFixed(4)} SOL`
    : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${token}`;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
