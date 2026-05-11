import { z } from "zod";

// ─── Token config ───────────────────────────────────────────────────────────

export const SUPPORTED_TOKENS = ["SOL", "USDC", "USDT", "PUSD", "BONK", "WIF"] as const;
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

const IS_MAINNET = process.env.IS_MAINNET === "true";

export const TOKEN_MINT: Record<SupportedToken, string | null> = {
  SOL: null, // native
  USDC: IS_MAINNET ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" : "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: IS_MAINNET ? "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" : "EJwZwpRvqiS86SAt9ikRWB9S5bwGrnF399qcSip8T6Y3",
  PUSD: "A9m2Vduv3mS88E3YvTuxm9E9Lh77Fq7rD176X8X9K8K", // Palm USD (Placeholder/Devnet)
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF:  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
};

export const TOKEN_DECIMALS: Record<SupportedToken, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  PUSD: 6,
  BONK: 5,
  WIF: 6,
};

// ─── Payment link model ──────────────────────────────────────────────────────

export type LinkStatus = "active" | "completed" | "expired" | "cancelled" | "archived";

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
  digitalAssetUrl: string | null; // URL to the book, NFT content, etc.
  status: LinkStatus;
  createdAt: Date;
  merchantId: string;            // links a link to a merchant account

  // Hackathon Superpowers
  isSplitPayment: boolean;
  targetAmountLamports: bigint | null;
  isRoundupEnabled: boolean;
  roundupVaultAddress: string | null;
  isLootboxEnabled: boolean;
  cashbackBps: number | null;
  referralBps: number | null;
  discountBps: number | null;
  tippingPointCount: number | null;
  tippingPointAmountLamports: bigint | null;
  isEscrowEnabled: boolean | null;
  maxSlippageBps: number;
  viewCount: number;

  // Umbra Stealth Payments
  isStealthEnabled: boolean;
  stealthAddress: string | null;
  ephemeralPubkey: string | null;
}

export interface MerchantProfile {
  merchantId: string;            // privy user id or main wallet
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;    // hex code
  webhookUrl: string | null;
  webhookSecret: string | null;
  email: string | null;          // merchant notification email
  apiKey: string | null;         // institutional API key
  apiKeyLastUsed: Date | null;
  snsDomain: string | null;
  isPro: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Umbra Stealth Identity
  stealthViewPubkey: string | null;
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
  recipientWallet: z.string().min(32).max(44).refine(val => !val.startsWith('0x'), {
    message: "Recipient wallet must be a Solana address (not Ethereum/EVM)"
  }),
  amount: z.number().positive().optional(),           // undefined = open amount
  token: z.enum(SUPPORTED_TOKENS).default("USDC"),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  memo: z.string().max(32).optional(),
  expiresInMinutes: z.number().positive().max(525600).optional(),
  maxPayments: z.number().int().positive().optional(),
  redirectUrl: z.string().url().optional(),
  digitalAssetUrl: z.string().url().optional(),
  merchantId: z.string().min(1),
  
  // Hackathon Superpowers
  isSplitPayment: z.boolean().optional(),
  targetAmount: z.number().positive().optional(),
  isRoundupEnabled: z.boolean().optional(),
  roundupVaultAddress: z.string().optional(),
  isLootboxEnabled: z.boolean().optional(),
  cashbackBps: z.number().min(0).max(10000).optional(),
  referralBps: z.number().min(0).max(10000).optional(),
  discountBps: z.number().min(0).max(10000).optional(),
  tippingPointCount: z.number().int().min(0).optional(),
  tippingPointAmount: z.number().positive().optional(),
  isEscrowEnabled: z.boolean().optional(),
  maxSlippageBps: z.number().int().min(1).max(5000).default(50),
  isStealthEnabled: z.boolean().optional(),
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

export const PostPaymentSchema = z.object({
  account: z.string().min(32).max(44),   // payer's wallet public key
  amount: z.number().positive().optional(), // only for open-amount links
  inputToken: z.enum([...SUPPORTED_TOKENS, "WIF", "BONK"]).optional(), // The token chosen in the Blink dropdown
  referrerWallet: z.string().min(32).max(44).optional(), // For the Viral Discount Loop
});

export type PostPaymentInput = z.infer<typeof PostPaymentSchema>;

export const UpdateMerchantProfileSchema = z.object({
  businessName: z.string().max(50).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional().nullable(),
  webhookUrl: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable(),
  snsDomain: z.string().optional().nullable(),
  isPro: z.boolean().optional(),
  stealthViewPubkey: z.string().optional().nullable(),
});

export type UpdateMerchantProfileInput = z.infer<typeof UpdateMerchantProfileSchema>;

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
  type: "number" | "text" | "select";
  name: string;
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  patternDescription?: string;
  options?: Array<{
    label: string;
    value: string;
    selected?: boolean;
  }>;
}

export interface ActionPostResponse {
  type: "transaction";
  transaction: string; // base64-encoded serialized transaction
  message?: string;    // shown to user in wallet UI
}

export interface ActionError {
  message: string;
}
