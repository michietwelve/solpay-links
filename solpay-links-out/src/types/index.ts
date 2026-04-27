import { z } from "zod";

// ─── Token config ───────────────────────────────────────────────────────────

export const SUPPORTED_TOKENS = ["SOL", "USDC", "USDT"] as const;
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

export const TOKEN_MINT: Record<SupportedToken, string | null> = {
  SOL: null, // native
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // mainnet
};

export const TOKEN_DECIMALS: Record<SupportedToken, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
};

// ─── Payment link model ──────────────────────────────────────────────────────

export type LinkStatus = "active" | "completed" | "expired" | "cancelled";

export interface PaymentLink {
  id: string;                    // nanoid — used in the URL
  recipientWallet: string;       // base58 public key
  amountLamports: bigint | null; // null = open amount (user inputs)
  token: SupportedToken;
  label: string;                 // merchant-facing title shown in Blink UI
  description: string;
  memo: string | null;           // on-chain memo instruction text
  expiresAt: Date | null;
  maxPayments: number | null;    // null = unlimited
  paymentCount: number;
  redirectUrl: string | null;    // where to send payer after success
  status: LinkStatus;
  createdAt: Date;
  merchantId: string;            // links a link to a merchant account
}

// ─── In-memory store (swap for Postgres/Redis in prod) ──────────────────────

export interface PaymentRecord {
  id: string;
  linkId: string;
  payerWallet: string;
  amountLamports: bigint;
  token: SupportedToken;
  signature: string | null;      // filled when confirmed
  status: "pending" | "confirmed" | "failed";
  createdAt: Date;
  confirmedAt: Date | null;
}

// ─── Request / response Zod schemas ─────────────────────────────────────────

export const CreateLinkSchema = z.object({
  recipientWallet: z.string().min(32).max(44),
  amount: z.number().positive().optional(),           // undefined = open amount
  token: z.enum(SUPPORTED_TOKENS).default("USDC"),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  memo: z.string().max(32).optional(),
  expiresInMinutes: z.number().positive().max(525600).optional(),
  maxPayments: z.number().int().positive().optional(),
  redirectUrl: z.string().url().optional(),
  merchantId: z.string().min(1),
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

export const PostPaymentSchema = z.object({
  account: z.string().min(32).max(44),   // payer's wallet public key
  amount: z.number().positive().optional(), // only for open-amount links
});

export type PostPaymentInput = z.infer<typeof PostPaymentSchema>;

// ─── Actions spec types (subset we use) ─────────────────────────────────────

export interface ActionGetResponse {
  type: "action";
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  error?: { message: string };
  links?: {
    actions: LinkedAction[];
  };
}

export interface LinkedAction {
  type: "transaction";
  href: string;
  label: string;
  parameters?: ActionParameter[];
}

export interface ActionParameter {
  type: "number" | "text";
  name: string;
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  patternDescription?: string;
}

export interface ActionPostResponse {
  type: "transaction";
  transaction: string; // base64-encoded serialized transaction
  message?: string;    // shown to user in wallet UI
}

export interface ActionError {
  message: string;
}
