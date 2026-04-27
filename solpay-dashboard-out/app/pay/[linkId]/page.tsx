"use client";

/**
 * /pay/[linkId]  —  Hosted Payment Page
 *
 * Flow:
 *  1. Load link metadata from GET /pay/:linkId on the Express API.
 *  2. If the user has no wallet, prompt them to log in with Privy
 *     (email / social / external wallet). Privy auto-creates an embedded
 *     Solana wallet for users who don't already have one.
 *  3. Once authenticated, show the payment form:
 *       a. Primary path  — send the on-chain transaction via the Actions API
 *          (/actions/:linkId/pay) using their Privy embedded wallet or the
 *          Phantom adapter they connected.
 *       b. Fallback path — "Buy crypto & pay" opens MoonPay in a modal so
 *          the user can fund their wallet with a credit card, then retries.
 *  4. On success, redirect to link.redirectUrl (if set) or show a receipt.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Connection,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { MoonPayBuyWidget } from "@moonpay/moonpay-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkData {
  id: string;
  label: string;
  description: string;
  recipientWallet: string;
  token: "SOL" | "USDC" | "USDT";
  amountHuman: string | null;
  isOpenAmount: boolean;
  memo: string | null;
  redirectUrl: string | null;
  expiresAt: string | null;
  paymentCount: number;
  maxPayments: number | null;
  status: string;
  active: boolean;
  inactiveReason: string | null;
}

type Stage =
  | "loading"          // fetching link data
  | "inactive"         // link expired / cancelled / completed
  | "auth"             // needs Privy login
  | "form"             // ready to pay
  | "moonpay"          // MoonPay ramp open
  | "sending"          // waiting for tx confirmation
  | "success"          // payment confirmed
  | "error";           // unrecoverable error

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const RPC      = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY ?? "";

// Map our token codes to MoonPay currency codes
const MOONPAY_CURRENCY: Record<string, string> = {
  SOL:  "sol",
  USDC: "usdc_sol",   // Solana USDC on MoonPay
  USDT: "usdt_sol",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PayPage() {
  const params   = useParams<{ linkId: string }>();
  const router   = useRouter();
  const linkId   = params.linkId;

  // Privy
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  // Local state
  const [link,       setLink]       = useState<LinkData | null>(null);
  const [stage,      setStage]      = useState<Stage>("loading");
  const [amount,     setAmount]     = useState("");
  const [txSig,      setTxSig]      = useState<string | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);

  // ── Step 1: Fetch link metadata ─────────────────────────────────────────────

  useEffect(() => {
    if (!linkId) return;
    fetch(`${API_BASE}/pay/${linkId}`)
      .then(r => r.json())
      .then((data: LinkData) => {
        setLink(data);
        if (!data.active) {
          setStage("inactive");
          return;
        }
        // Privy readiness drives the next transition
      })
      .catch(() => {
        setErrMsg("Could not load payment link. Please try again.");
        setStage("error");
      });
  }, [linkId]);

  // ── Step 2: Decide auth vs form once Privy is ready ──────────────────────────

  useEffect(() => {
    if (!link || !link.active) return;
    if (!ready) return; // Privy not initialised yet

    if (authenticated) {
      // Find the best wallet: prefer embedded Solana wallet, else first available
      const embeddedSolana = wallets.find(
        w => (w as any).walletClientType === "privy" && (w as any).chainType === "solana"
      );
      const activeWallet = embeddedSolana ?? wallets[0];
      setWalletAddr(activeWallet?.address ?? null);
      setStage("form");
    } else {
      setStage("auth");
    }
  }, [ready, authenticated, wallets, link]);

  // ── Step 3: Send payment via Actions API ─────────────────────────────────────

  const handlePay = useCallback(async () => {
    if (!link || !walletAddr) return;

    const parsedAmount = link.isOpenAmount ? parseFloat(amount) : undefined;
    if (link.isOpenAmount && (!parsedAmount || parsedAmount <= 0)) {
      setErrMsg("Please enter a valid amount.");
      return;
    }

    setStage("sending");
    setErrMsg(null);

    try {
      // 1. Ask Actions API to build the transaction
      const payUrl = link.isOpenAmount
        ? `${API_BASE}/actions/${link.id}/pay?amount=${parsedAmount}`
        : `${API_BASE}/actions/${link.id}/pay`;

      const postRes = await fetch(payUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account: walletAddr, amount: parsedAmount }),
      });

      if (!postRes.ok) {
        const e = await postRes.json().catch(() => ({}));
        throw new Error(e.message ?? `Actions API error ${postRes.status}`);
      }

      const { transaction: txBase64 } = await postRes.json();

      // 2. Decode the base64 transaction
      const txBytes = Buffer.from(txBase64, "base64");
      const tx      = Transaction.from(txBytes);

      // 3. Sign via Privy embedded wallet
      const embeddedWallet = wallets.find(
        w => (w as any).walletClientType === "privy" && (w as any).chainType === "solana"
      );

      if (!embeddedWallet) {
        throw new Error("No Privy embedded wallet found. Please reconnect.");
      }

      // Privy's signTransaction returns the signed Transaction object
      const signedTx = await embeddedWallet.signTransaction(tx);

      // 4. Broadcast directly to the RPC
      const connection = new Connection(RPC, "confirmed");
      const sig = await connection.sendRawTransaction(
        signedTx.serialize({ requireAllSignatures: true, verifySignatures: false })
      );

      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
      setStage("success");

      // Redirect after 3 s if the merchant specified a URL
      if (link.redirectUrl) {
        setTimeout(() => router.push(link.redirectUrl!), 3000);
      }
    } catch (err) {
      console.error("[handlePay]", err);
      setErrMsg((err as Error).message ?? "Transaction failed. Please try again.");
      setStage("form");
    }
  }, [link, walletAddr, amount, wallets, router]);

  // ─────────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Shared card shell ───────────────────────────────────────────────────────
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
        {children}
      </div>
    </div>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (stage === "loading" || !ready) {
    return (
      <Card>
        <div className="px-8 py-16 text-center">
          <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-400">Loading payment link…</p>
        </div>
      </Card>
    );
  }

  // ── Inactive link ───────────────────────────────────────────────────────────
  if (stage === "inactive" && link) {
    return (
      <Card>
        <div className="px-8 py-16 text-center">
          <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-base font-medium mb-2">{link.label}</h1>
          <p className="text-sm text-zinc-500">{link.inactiveReason ?? "This payment link is no longer active."}</p>
        </div>
      </Card>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <Card>
        <div className="px-8 py-16 text-center">
          <p className="text-sm text-red-600">{errMsg ?? "Something went wrong."}</p>
        </div>
      </Card>
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (stage === "success" && link) {
    return (
      <Card>
        <div className="px-8 py-14 text-center space-y-4">
          {/* Animated check */}
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Payment sent!</h2>
          <p className="text-sm text-zinc-500">
            Your payment to <span className="font-medium text-zinc-800">{link.label}</span> has been confirmed on-chain.
          </p>
          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-mono text-zinc-400 hover:text-zinc-700 underline underline-offset-2 break-all"
            >
              {txSig.slice(0, 20)}…{txSig.slice(-8)}
            </a>
          )}
          {link.redirectUrl && (
            <p className="text-xs text-zinc-400">Redirecting you shortly…</p>
          )}
        </div>
      </Card>
    );
  }

  // ── Auth (not logged in) ─────────────────────────────────────────────────────
  if (stage === "auth" && link) {
    return (
      <Card>
        <div className="px-8 py-10 text-center space-y-6">
          {/* Header */}
          <div>
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 16 16">
                <path d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z" fill="none" stroke="white" strokeWidth="1.5"/>
                <circle cx="8" cy="8" r="2" fill="white"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold">{link.label}</h1>
            <p className="text-sm text-zinc-500 mt-1">{link.description}</p>
          </div>

          {/* Amount chip */}
          {!link.isOpenAmount && link.amountHuman && (
            <div className="inline-flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-full px-4 py-1.5">
              <span className="text-xl font-semibold tracking-tight">{link.amountHuman}</span>
              <span className="text-sm text-zinc-500 font-medium">{link.token}</span>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              Sign in to pay — no wallet required.
            </p>
            <button
              onClick={login}
              className="w-full py-3 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 transition-colors"
            >
              Continue with email or wallet
            </button>
            <p className="text-xs text-zinc-400">
              Powered by{" "}
              <a href="https://privy.io" target="_blank" rel="noreferrer" className="underline">Privy</a>
              {" "}· no seed phrase needed
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── Payment form ─────────────────────────────────────────────────────────────
  if ((stage === "form" || stage === "moonpay" || stage === "sending") && link) {
    const moonpayCurrency = MOONPAY_CURRENCY[link.token] ?? "sol";
    const isLoading = stage === "sending";

    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">

          {/* ── Main payment card ── */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">

            {/* Card header */}
            <div className="px-6 pt-6 pb-5 border-b border-zinc-100">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-base font-semibold">{link.label}</h1>
                  <p className="text-xs text-zinc-400 mt-0.5">{link.description}</p>
                </div>
                {/* Token badge */}
                <span className="shrink-0 text-xs font-medium bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full ml-3">
                  {link.token}
                </span>
              </div>
            </div>

            {/* Amount section */}
            <div className="px-6 py-5">
              {link.isOpenAmount ? (
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500 font-medium">
                    Amount ({link.token})
                  </label>
                  <input
                    type="number"
                    min="0.000001"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`0.00 ${link.token}`}
                    disabled={isLoading}
                    className="w-full text-2xl font-semibold tracking-tight border-0 border-b-2 border-zinc-200 focus:border-zinc-900 outline-none py-1 bg-transparent transition-colors placeholder:text-zinc-300"
                  />
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{link.amountHuman}</span>
                  <span className="text-base text-zinc-500 font-medium">{link.token}</span>
                </div>
              )}

              {/* Recipient */}
              <div className="mt-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-xs font-mono text-zinc-400">
                  {link.recipientWallet.slice(0, 6)}…{link.recipientWallet.slice(-6)}
                </span>
              </div>

              {/* Wallet in use */}
              {walletAddr && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  </div>
                  <span className="text-xs font-mono text-zinc-400">
                    Paying from {walletAddr.slice(0, 6)}…{walletAddr.slice(-6)}
                  </span>
                  <button
                    onClick={logout}
                    className="ml-auto text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Error banner */}
              {errMsg && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-red-700">{errMsg}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 space-y-3">
              {/* Primary CTA — pay on-chain */}
              <button
                onClick={handlePay}
                disabled={isLoading || (link.isOpenAmount && !amount)}
                className="w-full py-3 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    Pay {link.isOpenAmount && amount ? `${amount} ${link.token}` : (link.amountHuman ?? "") + " " + link.token}
                  </>
                )}
              </button>

              {/* Secondary CTA — MoonPay ramp */}
              <button
                onClick={() => setStage("moonpay")}
                disabled={isLoading}
                className="w-full py-3 bg-white text-zinc-700 text-sm font-medium rounded-xl border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {/* MoonPay logo mark */}
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#7B3FE4"/>
                  <path d="M22 10c-3.31 0-6 2.69-6 6 0 1.1.3 2.12.82 3H10v3h14v-3h-2.82A5.98 5.98 0 0022 16c0-1.1-.3-2.12-.82-3H22v-3z" fill="white"/>
                </svg>
                Buy crypto &amp; pay with card
              </button>
            </div>
          </div>

          {/* ── MoonPay widget (inline, below the card) ── */}
          {stage === "moonpay" && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <p className="text-sm font-medium">Buy {link.token} with card</p>
                <button
                  onClick={() => setStage("form")}
                  className="text-zinc-400 hover:text-zinc-700 text-xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-1">
                {/*
                  MoonPayBuyWidget opens the ramp inside an iframe.
                  We pre-fill:
                    - currencyCode  → the token the payer needs
                    - walletAddress → their Privy wallet, so funds land there directly
                  After the purchase, MoonPay calls onTransactionCompleted and the
                  user can click "Pay" above to send the on-chain transaction.
                */}
                <MoonPayBuyWidget
                  apiKey={MOONPAY_API_KEY}
                  currencyCode={moonpayCurrency}
                  walletAddress={walletAddr ?? undefined}
                  baseCurrencyCode="usd"
                  baseCurrencyAmount={
                    link.isOpenAmount
                      ? undefined
                      : link.amountHuman ?? undefined
                  }
                  onTransactionCompleted={() => {
                    // Ramp complete — collapse the widget and let user pay
                    setStage("form");
                    setErrMsg(null);
                  }}
                  visible
                />
              </div>
              <p className="text-xs text-zinc-400 text-center px-5 pb-4">
                After your purchase completes, click{" "}
                <span className="font-medium text-zinc-700">Pay</span> above to
                send the on-chain transaction.
              </p>
            </div>
          )}

          {/* Footer attribution */}
          <p className="text-center text-xs text-zinc-400">
            Secured by{" "}
            <a href="https://privy.io" target="_blank" rel="noreferrer" className="underline">Privy</a>
            {" "}·{" "}
            <a href="https://moonpay.com" target="_blank" rel="noreferrer" className="underline">MoonPay</a>
            {" "}·{" "}
            <a href="https://solana.com" target="_blank" rel="noreferrer" className="underline">Solana</a>
          </p>
        </div>
      </div>
    );
  }

  return null;
}
