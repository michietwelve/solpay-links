"use client";

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";

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

  useEffect(() => {
    if (suggestedDest) setDest(suggestedDest);
  }, [suggestedDest]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      new PublicKey(dest);
    } catch {
      setError("Please enter a valid Solana address");
      return;
    }

    if (dest === sourceAddress) {
      setError("Source and destination addresses cannot be the same");
      return;
    }

    setLoading(true);
    try {
      await onConfirm(dest);
    } catch (err: any) {
      setError(err.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-zinc-900">Withdraw Funds</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Source Wallet</label>
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-mono text-zinc-600">{sourceAddress.slice(0, 12)}...{sourceAddress.slice(-12)}</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Embedded</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Destination Address</label>
            <div className="relative">
              <input
                autoFocus
                value={dest}
                onChange={(e) => {
                  setDest(e.target.value);
                  setError(null);
                }}
                placeholder="Paste Solana address (Phantom / Solflare)"
                className={`w-full bg-white border ${error ? "border-red-200 ring-1 ring-red-100" : "border-zinc-200 focus:border-zinc-900"} rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-zinc-400 font-mono`}
                disabled={loading}
              />
              {suggestedDest && dest !== suggestedDest && (
                <button
                  type="button"
                  onClick={() => setDest(suggestedDest)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-2 py-1 rounded-md transition-colors"
                >
                  Use Connected
                </button>
              )}
            </div>
            {error && <p className="text-[11px] text-red-500 font-medium pl-1">{error}</p>}
          </div>

          <div className="bg-zinc-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Transfer amount</span>
              <span className="text-zinc-900 font-medium font-mono">{balance !== null && balance !== undefined ? `${balance.toFixed(4)} SOL` : "Calculating..."}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Network fee</span>
              <span className="text-zinc-900 font-medium font-mono">~0.000005 SOL</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !dest}
              className="flex-2 px-8 py-3 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-zinc-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Confirm Withdrawal"
              )}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100">
          <p className="text-[10px] text-zinc-400 text-center leading-relaxed">
            Funds will be transferred from your Privy embedded wallet to the address specified. 
            This action is final and cannot be reversed on the Solana blockchain.
          </p>
        </div>
      </div>
    </div>
  );
}
