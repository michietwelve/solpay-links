"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface SuccessModalProps {
  title: string;
  message: string;
  txSig?: string;
  isError?: boolean;
  onClose: () => void;
}

export default function SuccessModal({ title, message, txSig, isError, onClose }: SuccessModalProps) {
  useEffect(() => {
    if (isError) return;
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-zinc-950 border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="p-8 flex flex-col items-center text-center">
          <div className={`w-20 h-20 ${isError ? "bg-red-500/10" : "bg-emerald-500/10"} rounded-[2rem] flex items-center justify-center mb-6 border ${isError ? "border-red-500/20" : "border-emerald-500/20"}`}>
            <div className={`w-12 h-12 ${isError ? "bg-red-500 shadow-red-900/50" : "bg-emerald-500 shadow-emerald-900/50"} rounded-2xl flex items-center justify-center shadow-2xl`}>
              {isError ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight mb-2">{title}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-8 px-4">
            {message}
          </p>

          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mb-3 py-3 px-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-colors"
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">Transaction Hash</span>
                <span className="text-xs font-mono text-amber-500/80">{txSig.slice(0, 8)}...{txSig.slice(-8)}</span>
              </div>
              <svg className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full py-4 bg-white text-zinc-950 font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-100 transition-all shadow-xl active:scale-95"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
