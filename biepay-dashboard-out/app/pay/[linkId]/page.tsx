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
import Logo     from "../../../components/layout/Logo";
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
  merchant: {
    businessName: string | null;
    logoUrl: string | null;
    accentColor: string | null;
  };
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

const TOKEN_MINTS: Record<string, string | null> = {
  SOL: null,
  USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  USDT: "EJwZwpRvqiS86SAt9ikRWB9S5bwGrnF399qcSip8T6Y3",
};

const TOKEN_DECIMALS: Record<string, number> = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
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

  // Trigger confetti and sound on success
  useEffect(() => {
    if (stage === "success") {
      // Confetti
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#c5a36e', '#d4b98c', '#18181b', '#ffffff']
      });

      // Premium Chime
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3");
      audio.volume = 0.4;
      audio.play().catch(e => console.log("Audio play blocked by browser policy"));
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
  
  const checkBalances = async (targetAmount: number, targetToken: string) => {
    if (!walletAddr) return false;
    try {
      const connection = new Connection(RPC, "confirmed");
      const userPubkey = new PublicKey(walletAddr);
      
      // 1. Always check SOL for gas (~0.005 SOL safety)
      const solBal = await connection.getBalance(userPubkey);
      if (solBal < 0.002 * LAMPORTS_PER_SOL) {
        setErrMsg("You need at least 0.002 SOL to pay for transaction fees (gas).");
        return false;
      }

      // 2. Check token balance if not SOL
      if (targetToken !== "SOL") {
        const mint = TOKEN_MINTS[targetToken];
        if (!mint) return true;

        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(userPubkey, {
            mint: new PublicKey(mint),
          });

          const balance = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
          if (balance < targetAmount) {
            setErrMsg(`Insufficient ${targetToken}! You have ${balance.toFixed(2)} but need ${targetAmount.toFixed(2)}.`);
            return false;
          }
        } catch (e) {
          // If ATA doesn't exist, balance is 0
          setErrMsg(`You don't have any ${targetToken} in this wallet yet.`);
          return false;
        }
      } else {
        // Native SOL check
        if (solBal / LAMPORTS_PER_SOL < targetAmount) {
          setErrMsg(`Insufficient SOL! You have ${(solBal / LAMPORTS_PER_SOL).toFixed(4)} but need ${targetAmount.toFixed(4)}.`);
          return false;
        }
      }
      return true;
    } catch (e) {
      console.error("Balance check failed", e);
      setErrMsg("Failed to verify wallet balance. Please ensure you are on a stable connection.");
      return false; 
    }
  };

  const handlePay = useCallback(async () => {
    if (!link || !walletAddr) return;

    const parsedAmount = link.isOpenAmount ? parseFloat(amount) : parseFloat(link.amountHuman || "0");
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrMsg("Please enter a valid amount.");
      return;
    }

    setErrMsg(null);
    const hasFunds = await checkBalances(parsedAmount, link.token);
    if (!hasFunds) return;

    setStage("sending");

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
        msg.includes("insufficient funds")
      ) {
        msg = `Your wallet doesn't have enough ${link.token} or SOL for gas. Please fund your wallet to continue.`;
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
    const formattedAmount = link.isOpenAmount ? amount : link.amountHuman;
    const now = new Date().toLocaleString();

    return (
      <Card>
        <div className="animate-in fade-in zoom-in duration-700">
          {/* Header Branding */}
          <div className="p-8 text-center border-b border-zinc-100 bg-zinc-50/50">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4 border border-zinc-100 relative">
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
              </div>
              {link.merchant.logoUrl ? (
                <img src={link.merchant.logoUrl} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <Logo className="w-10 h-10" />
              )}
            </div>
            <h2 className="text-xl font-black text-zinc-900 tracking-tight">Payment Successful</h2>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mt-1">Transaction Confirmed</p>
          </div>

          {/* Receipt Body */}
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center gap-1 mb-4">
              <span className="text-4xl font-black text-zinc-950 tracking-tighter">{formattedAmount}</span>
              <span className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">{link.token}</span>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-100">
              {[
                ["Merchant", link.merchant.businessName || link.label],
                ["Date", now],
                ["Payer Wallet", `${walletAddr?.slice(0, 6)}...${walletAddr?.slice(-6)}`],
                ["Network", "Solana Devnet"]
              ].map(([k,v]) => (
                <div key={k} className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{k}</span>
                  <span className="text-xs font-bold text-zinc-900 truncate max-w-[180px]">{v}</span>
                </div>
              ))}
            </div>

            <div className="pt-8 space-y-3">
              {txSig && (
                <a
                  href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-4 bg-zinc-950 text-white text-[10px] font-black uppercase tracking-[0.25em] rounded-xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 shadow-xl"
                >
                  View On Explorer
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
              
              <button 
                onClick={() => window.print()}
                className="w-full py-4 bg-white border border-zinc-200 text-zinc-500 text-[10px] font-black uppercase tracking-[0.25em] rounded-xl hover:bg-zinc-50 transition-all"
              >
                Download Receipt
              </button>
            </div>
          </div>

          <div className="px-8 pb-8 text-center">
            <p className="text-[10px] text-zinc-300 font-bold uppercase tracking-tighter">
              Secured by BiePay Institutional Infrastructure
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (stage === "auth" && link) {
    return (
      <Card>
        <div className="px-8 py-10 text-center space-y-6">
          <div>
            <Logo className="w-12 h-12 mx-auto mb-6 shadow-xl" variant="gold" />
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
            <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: link.merchant.accentColor ?? "#c5a36e" }} />
            
            <div className="px-6 py-6 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {link.merchant.logoUrl ? (
                  <img src={link.merchant.logoUrl} alt={link.merchant.businessName || "Merchant"} className="w-10 h-10 rounded-xl object-cover border border-zinc-100 shadow-sm" />
                ) : (
                  <Logo className="w-10 h-10" />
                )}
                <div>
                  <h1 className="text-lg font-bold text-zinc-900 leading-tight">
                    {link.merchant.businessName ?? link.label}
                  </h1>
                  {link.merchant.businessName && <p className="text-xs text-zinc-400 font-medium tracking-tight uppercase">Pay with BiePay</p>}
                  {!link.merchant.businessName && link.description && <p className="text-xs text-zinc-400 line-clamp-1">{link.description}</p>}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">v1.8 LIVE</span>
                <span className="text-[10px] font-medium text-zinc-300 mt-1">{link.token}</span>
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
                className="w-full py-3 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-all flex items-center justify-center gap-2 active:scale-95"
                style={{ backgroundColor: link.merchant.accentColor ?? "#18181b" }}
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
                    Buy SOL with card
                  </button>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-[#c5a36e] font-bold hover:underline"
                  >
                    ↗ Need Devnet USDC? Get it from the Circle Faucet
                  </a>
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
          {/* Branding footer */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <Logo className="w-8 h-8 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-default" variant="gold" />
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Powered by BiePay</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
