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
const ComponentAny = MoonPayBuyWidget as any;

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
  const { ready, authenticated, login, logout, user, createWallet } = usePrivy();
  const { wallets } = useWallets();

  // Local state
  const [link,       setLink]       = useState<LinkData | null>(null);
  const [stage,      setStage]      = useState<Stage>("loading");
  const [amount,     setAmount]     = useState("");
  const [txSig,      setTxSig]      = useState<string | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

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
      })
      .catch(() => {
        setErrMsg("Could not load payment link. Please try again.");
        setStage("error");
      });
  }, [linkId]);

  // ── Step 2: Decide auth vs form once Privy is ready ──────────────────────────

  useEffect(() => {
    if (!link || !link.active) return;
    if (!ready) return;

    if (authenticated && user) {
      // Check ALL linked wallets - any type, any chain
      const anyWallet = wallets[0];
      const linkedWallet = user.linkedAccounts.find(
        (acc: any) => acc.type === 'wallet' && acc.address
      );

      // Pick whichever address we can find
      const addr = (anyWallet?.address) ?? ((linkedWallet as any)?.address ?? null);

      if (addr) {
        setWalletAddr(addr);
        setStage("form");
        return;
      }

      // No wallet at all — try to create one
      if (!isInitializing) {
        setIsInitializing(true);
        console.log("No wallet found — auto-creating Solana wallet...");
        (createWallet as any)({ chainType: 'solana' })
          .then(() => {
            console.log("Wallet created — reloading in 3s to pick up new state.");
            setTimeout(() => window.location.reload(), 3000);
          })
          .catch((err: any) => {
            console.error("createWallet error:", err);
            // Wallet may already exist — reload and hope Privy syncs it
            setTimeout(() => window.location.reload(), 3000);
          });

        setStage("auth");
        const timer = setTimeout(() => setShowRetry(true), 6000);
        return () => clearTimeout(timer);
      } else {
        setStage("auth");
      }
    } else {
      setStage("auth");
    }
  }, [ready, authenticated, user, wallets, link, isInitializing, createWallet]);

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
      const txBytes = Buffer.from(txBase64, "base64");
      const tx      = Transaction.from(txBytes);

      const activeWallet = wallets.find(w => w.address === walletAddr);
      if (!activeWallet) throw new Error("Wallet not found. Please reconnect.");

      const signedTx = await (activeWallet as any).signTransaction(tx);
      const connection = new Connection(RPC, "confirmed");
      const sig = await connection.sendRawTransaction(
        signedTx.serialize({ requireAllSignatures: true, verifySignatures: false })
      );

      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
      setStage("success");

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

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
        {children}
      </div>
    </div>
  );

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

  if (stage === "error") {
    return (
      <Card>
        <div className="px-8 py-16 text-center">
          <p className="text-sm text-red-600">{errMsg ?? "Something went wrong."}</p>
          <button onClick={() => window.location.reload()} className="mt-4 text-xs underline">Try Again</button>
        </div>
      </Card>
    );
  }

  if (stage === "success" && link) {
    return (
      <Card>
        <div className="px-8 py-14 text-center space-y-4">
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
        </div>
      </Card>
    );
  }

  if (stage === "auth" && link) {
    return (
      <Card>
        <div className="px-8 py-10 text-center space-y-6">
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

          <div className="space-y-3">
            {authenticated ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
                <p className="text-sm text-zinc-500 font-medium">Preparing your secure checkout...</p>
                {showRetry && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <button 
                      onClick={() => window.location.reload()}
                      className="text-xs text-purple-600 font-bold hover:underline"
                    >
                      Still stuck? Click to refresh
                    </button>
                    <button 
                      onClick={() => logout()}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600 underline"
                    >
                      Sign out and try again
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-zinc-500">Sign in to pay — no wallet required.</p>
                <button onClick={login} className="w-full py-3 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 shadow-lg shadow-zinc-200">
                  Continue with email or wallet
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if ((stage === "form" || stage === "moonpay" || stage === "sending") && link) {
    const moonpayCurrency = MOONPAY_CURRENCY[link.token] ?? "sol";
    const isSending = stage === "sending";

    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-3">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-5 border-b border-zinc-100">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-base font-semibold">{link.label}</h1>
                  <p className="text-xs text-zinc-400 mt-0.5">{link.description}</p>
                </div>
                <span className="shrink-0 text-xs font-medium bg-zinc-100 text-zinc-700 px-2.5 py-1 rounded-full ml-3">
                  {link.token}
                </span>
              </div>
            </div>

            <div className="px-6 py-5">
              {link.isOpenAmount ? (
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500 font-medium">Amount ({link.token})</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`0.00 ${link.token}`}
                    disabled={isSending}
                    className="w-full text-2xl font-semibold tracking-tight border-0 border-b-2 border-zinc-200 focus:border-zinc-900 outline-none py-1 bg-transparent transition-colors"
                  />
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{link.amountHuman}</span>
                  <span className="text-base text-zinc-500 font-medium">{link.token}</span>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                </div>
                <span className="text-xs font-mono text-zinc-400">
                  Paying from {walletAddr?.slice(0, 6)}…{walletAddr?.slice(-6)}
                </span>
              </div>

              {errMsg && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-red-700">{errMsg}</p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 space-y-3">
              <button
                onClick={handlePay}
                disabled={isSending || (link.isOpenAmount && !amount)}
                className="w-full py-3 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {isSending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</> : `Pay ${link.isOpenAmount && amount ? `${amount} ${link.token}` : (link.amountHuman ?? "") + " " + link.token}`}
              </button>

              <button
                onClick={() => setStage("moonpay")}
                disabled={isSending}
                className="w-full py-3 bg-white text-zinc-700 text-sm font-medium rounded-xl border border-zinc-200 hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#7B3FE4"/><path d="M22 10c-3.31 0-6 2.69-6 6 0 1.1.3 2.12.82 3H10v3h14v-3h-2.82A5.98 5.98 0 0022 16c0-1.1-.3-2.12-.82-3H22v-3z" fill="white"/></svg>
                Buy crypto &amp; pay with card
              </button>
            </div>
          </div>

          {stage === "moonpay" && (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden p-1">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                <p className="text-sm font-medium">Buy crypto with card</p>
                <button onClick={() => setStage("form")} className="text-zinc-400 hover:text-zinc-700 text-xl">×</button>
              </div>
              <ComponentAny
                apiKey={MOONPAY_API_KEY}
                currencyCode={moonpayCurrency}
                walletAddress={walletAddr ?? undefined}
                baseCurrencyCode="usd"
                visible
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
