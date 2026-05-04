"use client";

import { useState } from "react";

interface SweepModalProps {
  address: string;
  destination: string;
  isSweeping: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function SweepModal({ address, destination, isSweeping, onConfirm, onClose }: SweepModalProps) {
  const [hasConfirmed, setHasConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div 
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 space-y-6">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <svg className="w-8 h-8 text-[#c5a36e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900">Sweep to Cold Storage</h2>
            <p className="text-zinc-500 text-sm">Consolidate all SOL, USDC, and USDT into your secure external wallet.</p>
          </div>

          <div className="bg-zinc-50 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 font-medium uppercase tracking-wider">Source Wallet</span>
              <span className="text-zinc-900 font-mono font-medium">{address.slice(0, 6)}...{address.slice(-6)}</span>
            </div>
            <div className="h-px bg-zinc-200 w-full" />
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-400 font-medium uppercase tracking-wider">Destination</span>
              <span className="text-emerald-600 font-mono font-medium">{destination.slice(0, 6)}...{destination.slice(-6)}</span>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              This action will move <span className="font-bold">all liquid assets</span>. We recommend leaving at least 0.002 SOL for future network rent if you plan to keep using this link.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isSweeping}
              className="flex-1 py-4 bg-zinc-100 text-zinc-600 font-bold rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isSweeping}
              className="flex-[2] py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 shadow-xl shadow-zinc-200 transition-all flex items-center justify-center gap-2"
            >
              {isSweeping && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isSweeping ? "Sweeping Assets..." : "Confirm Sweep"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
