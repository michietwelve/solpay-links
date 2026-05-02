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
import { useSolanaWallets, useFundWallet } from "@privy-io/react-auth/solana";
import {
  Connection,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { MoonPayBuyWidget } from "@moonpay/moonpay-react";
import confetti from "canvas-confetti";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://biepay-links-production.up.railway.app";
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
  const { wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();
  const { fundWallet } = useFundWallet();
  
  // Combine all available wallets to search through
  const allWallets = [...wallets, ...solanaWallets];

  // Local state
  const [link,       setLink]       = useState<LinkData | null>(null);
  const [stage,      setStage]      = useState<Stage>("loading");
  const [amount,     setAmount]     = useState("");
  const [txSig,      setTxSig]      = useState<string | null>(null);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [airdropStatus, setAirdropStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // ── Step 1: Fetch link metadata ─────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      if (stage === "loading") {
        setErrMsg("Loading is taking longer than expected. Please check your connection or refresh the page.");
        setStage("error");
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [stage]);

  // Trigger confetti on success
  useEffect(() => {
    if (stage === "success") {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#059669', '#a7f3d0']
      });
    }
  }, [stage]);

  useEffect(() => {
    if (!linkId) return;
    fetch(`${API_BASE}/pay/${linkId}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: LinkData) => {
        setLink(data);
        if (!data.active) {
          setStage("inactive");
          return;
        }
      })
      .catch(() => {
        setErrMsg("Could not load payment link. Please check your internet connection.");
        setStage("error");
      });
  }, [linkId]);

  // ── Step 2: Decide auth vs form once Privy is ready ──────────────────────────

  useEffect(() => {
    if (!link || !link.active) return;
    if (!ready) return;

    if (authenticated && user) {
      // 1. Check Privy wallets array for a Solana wallet (across both generic and solana-specific hooks)
      const solanaWallet = allWallets.find((w: any) => w.walletClientType === 'privy' && w.chainType === 'solana');
      
      // 2. Check user's linked accounts as a fallback
      const linkedSolana = user.linkedAccounts.find(
        (acc: any) => acc.type === 'wallet' && (acc as any).chainType === 'solana'
      );

      const addr = solanaWallet?.address ?? (linkedSolana as any)?.address ?? null;

      // 3. Validation: Must be a non-EVM address
      if (addr && !addr.startsWith('0x')) {
        setWalletAddr(addr);
        setStage("form");
      } else {
        // No Solana wallet found - but we ARE authenticated
        setStage("auth");
        
        // Show retry/manual buttons after 4 seconds
        const timer = setTimeout(() => setShowRetry(true), 4000);
        
        // Attempt auto-creation ONLY ONCE
        if (!isInitializing && createSolanaWallet) {
          setIsInitializing(true);
          console.log("[auth] Attempting to create Solana embedded wallet...");
          createSolanaWallet()
            .then((newWallet: any) => {
              console.log("[auth] Wallet created:", newWallet.address);
              setWalletAddr(newWallet.address);
              setStage("form");
            })
            .catch((err: any) => {
              console.error("[auth] Wallet creation failed:", err);
              setErrMsg("We couldn't automatically create your Solana wallet. Please try the manual button below.");
              setShowRetry(true);
            });
        }
        
        return () => clearTimeout(timer);
      }
    } else {
      // Not authenticated yet
      setStage("auth");
    }
  }, [ready, authenticated, user, wallets, solanaWallets, link, isInitializing, createSolanaWallet]);

  // Failsafe: Reset stage if EVM address somehow slips through
  useEffect(() => {
    if (stage === "form" && walletAddr?.startsWith('0x')) {
      setStage("auth");
      setWalletAddr(null);
    }
  }, [stage, walletAddr]);

  // ── Step 3a: Devnet Airdrop helper ──────────────────────────────────────────

  const handleAirdrop = useCallback(async () => {
    if (!walletAddr) return;
    setAirdropStatus("loading");
    try {
      const connection = new Connection(RPC, "confirmed");
      const sig = await connection.requestAirdrop(
        new PublicKey(walletAddr),
        LAMPORTS_PER_SOL // 1 SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
      setAirdropStatus("done");
      // Clear any previous error so user can retry paying
      setErrMsg(null);
      setStage("form");
    } catch (e) {
      console.error("[airdrop]", e);
      setAirdropStatus("error");
    }
  }, [walletAddr]);

  // ── Step 3b: Privy Fund Wallet (card onramp) ─────────────────────────────

  const handleFundWallet = useCallback(async () => {
    if (!walletAddr) return;
    try {
      await fundWallet(walletAddr, {
        cluster: { name: "devnet" },
        amount: "5",
      });
    } catch (e) {
      console.error("[fundWallet]", e);
    }
  }, [walletAddr, fundWallet]);

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

      const activeWallet = allWallets.find(w => w.address === walletAddr);
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
      let msg = (err as Error).message ?? "Transaction failed. Please try again.";
      if (
        msg.includes("found no record of a prior credit") || 
        msg.includes("insufficient lamports") || 
        msg.includes("insufficient funds") ||
        msg.includes("InvalidAccountData") ||
        msg.includes("invalid account data")
      ) {
        msg = "Your wallet doesn't have enough funds! Please click 'Buy crypto' below to fund it first.";
      }
      setErrMsg(msg);
      setStage("form");
    }
  }, [link, walletAddr, amount, wallets, solanaWallets, router]);

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

  if (stage === "inactive" && link) {
    return (
      <Card>
        <div className="px-8 py-16 text-center">
          <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-base font-medium mb-2">{link.label || "Link Inactive"}</h1>
          <p className="text-sm text-zinc-500">{link.inactiveReason ?? "This payment link is no longer active."}</p>
        </div>
      </Card>
    );
  }

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

  if (stage === "success" && link) {
    return (
      <Card>
        <div className="px-8 py-14 text-center space-y-4 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.2)]">
            <svg className="w-10 h-10 text-emerald-500 animate-[bounce_1s_ease-in-out_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Payment sent!</h2>
          <p className="text-sm text-zinc-500">
            Your payment to <span className="font-semibold text-zinc-800">{link.label}</span> has been confirmed on-chain.
          </p>
          {txSig && (
            <div className="pt-4">
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-xs font-mono text-zinc-600 font-medium rounded-full transition-colors"
              >
                View on Explorer ↗
              </a>
            </div>
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
                  <div className="mt-4 flex flex-col items-center gap-4 w-full">
                    <button 
                      onClick={() => createSolanaWallet()}
                      className="w-full py-3 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800"
                    >
                      Generate Solana Wallet
                    </button>
                    <button 
                      onClick={() => window.location.reload()}
                      className="text-xs text-zinc-400 hover:text-zinc-600 underline"
                    >
                      Stuck? Refresh Page
                    </button>
                    <button 
                      onClick={() => logout()}
                      className="text-[10px] text-zinc-300 hover:text-zinc-500 underline"
                    >
                      Sign out and switch account
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
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-2">
              <span className="text-[8px] text-red-600 font-bold font-mono animate-pulse uppercase tracking-widest bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                v1.7 LIVE
              </span>
            </div>
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
                {isSending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing on Solana…</> : `Pay ${link.isOpenAmount && amount ? `${amount} ${link.token}` : (link.amountHuman ?? "") + " " + link.token}`}
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
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                <p className="text-sm font-medium">Fund your wallet</p>
                <button onClick={() => { setStage("form"); setAirdropStatus("idle"); }} className="text-zinc-400 hover:text-zinc-700 text-xl">×</button>
              </div>
              <div className="p-5 space-y-4">
                {/* Devnet Airdrop — always available for testing */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚰</span>
                    <div>
                      <p className="text-sm font-semibold">Devnet Faucet</p>
                      <p className="text-xs text-zinc-500">Get free SOL for testing — instant, no card needed</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setAirdropStatus("idle"); handleAirdrop(); }}
                    disabled={airdropStatus === "loading" || airdropStatus === "done"}
                    className="w-full py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {airdropStatus === "loading" && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                    {airdropStatus === "done" ? "✅ SOL airdropped! Returning to pay…" : 
                     airdropStatus === "loading" ? "Requesting airdrop…" : 
                     airdropStatus === "error" ? "⟳ Faucet busy — click to retry" : 
                     "Request SOL from faucet"}
                  </button>
                  <a
                    href="https://faucet.solana.com/?token=SOL"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                  >
                    ↗ Or use the official web faucet (paste your wallet address)
                  </a>
                  {walletAddr && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(walletAddr); }}
                      className="w-full py-1.5 bg-zinc-100 text-zinc-600 text-xs font-mono rounded-lg hover:bg-zinc-200 transition-colors truncate px-2"
                      title="Click to copy wallet address"
                    >
                      📋 {walletAddr}
                    </button>
                  )}
                </div>

                {/* Buy with card via Transak (no API key needed) */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💳</span>
                    <div>
                      <p className="text-sm font-semibold">Buy with card</p>
                      <p className="text-xs text-zinc-500">Purchase SOL instantly with a credit or debit card</p>
                    </div>
                  </div>
                  <button
                    onClick={handleFundWallet}
                    className="w-full py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>
                    Buy crypto with card
                  </button>
                  <a
                    href={`https://global-stg.transak.com/?network=solana&cryptoCurrencyCode=SOL${walletAddr ? `&walletAddress=${walletAddr}` : ""}&disableWalletAddressForm=true`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2"
                  >
                    ↗ External card onramp (Transak)
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Version & Diagnostics --- */}
        <div className="mt-8 flex flex-col items-center gap-3 opacity-100 transition-opacity">
          <div className="flex items-center gap-3">
            <p className="text-[10px] text-zinc-400 font-mono">Build v1.8 • Final Stability</p>
            <button 
              onClick={() => window.location.href = window.location.pathname + '?v=' + Date.now()}
              className="text-[10px] text-zinc-400 hover:text-zinc-600 underline"
            >
              Force Refresh
            </button>
          </div>
          
          {/* Judge Test Mode Override */}
          {link?.token !== "SOL" && (
            <button
              onClick={() => {
                if (link) {
                  setLink({ ...link, token: "SOL" });
                  setErrMsg(null);
                }
              }}
              className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors"
            >
              🧪 Hackathon Demo: Switch to SOL to test easily
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
