"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface SuccessModalProps {
  title: string;
  message: string;
  txSig?: string;
  onClose: () => void;
}

export default function SuccessModal({ title, message, txSig, onClose }: SuccessModalProps) {
  useEffect(() => {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-zinc-900 mb-2">{title}</h2>
          <p className="text-zinc-500 text-sm leading-relaxed mb-8">
            {message}
          </p>

          {txSig && (
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mb-3 py-3 px-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between group hover:bg-zinc-100 transition-colors"
            >
              <div className="flex flex-col items-start">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Transaction Signature</span>
                <span className="text-xs font-mono text-zinc-600">{txSig.slice(0, 8)}...{txSig.slice(-8)}</span>
              </div>
              <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full py-4 bg-zinc-900 text-white font-semibold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200"
          >
            Great, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
