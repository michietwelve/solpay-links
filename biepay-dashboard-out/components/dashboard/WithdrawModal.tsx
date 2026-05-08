"use client";

import { useState, useEffect } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { resolve } from "@bonfida/spl-name-service";

interface WithdrawModalProps {
  sourceAddress: string;
  suggestedDest?: string | null;
  balance?: number | null;
  onConfirm: (dest: string) => Promise<void>;
  onClose: () => void;
}

export default function WithdrawModal({ 
  sourceAddress, 
  suggestedDest, 
  balance,
  onConfirm, 
  onClose 
}: WithdrawModalProps) {
  const [dest, setDest] = useState(suggestedDest ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (suggestedDest) setDest(suggestedDest);
  }, [suggestedDest]);

  // SNS Resolution Effect
  useEffect(() => {
    let active = true;
    setResolvedAddress(null);
    
    if (dest.trim().toLowerCase().endsWith(".sol")) {
      const resolveName = async () => {
        setIsResolving(true);
        setError(null);
        try {
          const rpc = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com";
          const connection = new Connection(rpc);
          const pubkey = await resolve(connection, dest.trim().toLowerCase());
          if (active) {
            setResolvedAddress(pubkey.toBase58());
          }
        } catch (e) {
          if (active) {
            setError("Could not resolve .sol domain");
          }
        } finally {
          if (active) setIsResolving(false);
        }
      };
      
      const timeout = setTimeout(resolveName, 500);
      return () => {
        active = false;
        clearTimeout(timeout);
      };
    } else {
      setIsResolving(false);
    }
  }, [dest]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalDest = resolvedAddress ?? dest.trim();

    try {
      new PublicKey(finalDest);
    } catch {
      setError("Please enter a valid Solana address or .sol domain");
      return;
    }

    if (finalDest === sourceAddress) {
      setError("Source and destination addresses cannot be the same");
      return;
    }

    setLoading(true);
    try {
      await onConfirm(finalDest);
    } catch (err: any) {
      setError(err.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-zinc-950 border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] w-full max-w-md overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Withdraw Funds</h2>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Move assets to custody</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-500 hover:text-white text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest pl-1">Source Settlement Wallet</label>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-400">{sourceAddress.slice(0, 12)}...{sourceAddress.slice(-12)}</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2.5 py-1 rounded-full font-black uppercase tracking-tighter">Embedded</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest pl-1">Destination Address</label>
            <div className="relative">
              <input
                autoFocus
                value={dest}
                onChange={(e) => {
                  setDest(e.target.value);
                  setError(null);
                }}
                placeholder="Paste Solana address or .sol domain"
                className={`w-full bg-white/5 border ${error ? "border-red-500/50 ring-1 ring-red-500/20" : "border-white/10 focus:border-white/30 focus:bg-white/[0.07]"} rounded-2xl px-4 py-4 text-sm outline-none transition-all placeholder:text-zinc-600 font-mono text-white`}
                disabled={loading || isResolving}
              />
              {isResolving && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-white/10 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {suggestedDest && dest !== suggestedDest && !isResolving && !resolvedAddress && (
                <button
                  type="button"
                  onClick={() => setDest(suggestedDest)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl transition-all active:scale-95"
                >
                  Use Connected
                </button>
              )}
            </div>
            {error && <p className="text-[11px] text-red-500 font-bold pl-1 animate-in fade-in slide-in-from-left-1">{error}</p>}
            {resolvedAddress && !error && (
              <p className="text-[11px] text-emerald-500 font-bold pl-1 flex items-center gap-2 animate-in fade-in slide-in-from-left-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Resolved: <span className="font-mono opacity-60">{resolvedAddress.slice(0,8)}...{resolvedAddress.slice(-8)}</span>
              </p>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
              <span className="text-zinc-500">Transfer amount</span>
              <span className="text-white font-mono">{balance !== null && balance !== undefined ? `${balance.toFixed(4)} SOL` : "Calculating..."}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
              <span className="text-zinc-500">Network fee</span>
              <span className="text-zinc-400 font-mono">~0.000005 SOL</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !dest}
              className="w-full py-4 bg-[#c5a36e] text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-[#d4b98c] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-[#c5a36e]/10 flex items-center justify-center gap-3 active:scale-95"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <span>Confirm Withdrawal</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                setTimeout(() => window.Jupiter.resume(), 100);
              }}
              className="w-full py-4 bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 active:scale-95 group"
            >
              <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L13 16M17 20L21 16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Swap via Jupiter
            </button>
          </div>
        </form>

        <div className="px-8 py-5 bg-black/40 border-t border-white/5">
          <p className="text-[9px] text-zinc-600 text-center font-bold uppercase tracking-[0.05em] leading-relaxed">
            Funds will be transferred from your self-custodial embedded wallet. 
            Final transaction is irreversible on the Solana network.
          </p>
        </div>
      </div>
    </div>
  );
}
