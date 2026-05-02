"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { getShareUrls } from "../../lib/api";

interface Props {
  linkId: string;
  label: string;
  onClose: () => void;
}

type Tab = "blink" | "action" | "pay";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "blink", label: "Blink URL", hint: "Share on X, Telegram, WhatsApp — renders as a payment card in Phantom" },
  { key: "action", label: "Action URL", hint: "For wallet-native integrations — opens directly in Phantom" },
  { key: "pay",   label: "Payment page", hint: "Hosted checkout page with Privy (email login) + MoonPay (buy with card) — perfect for non-crypto users" },
];

export default function ShareModal({ linkId, label, onClose }: Props) {
  const [tab, setTab]         = useState<Tab>("blink");
  const [copied, setCopied]   = useState(false);
  const urls = getShareUrls(linkId);

  const currentUrl =
    tab === "blink" ? urls.blink :
    tab === "action" ? urls.action :
    urls.payPage;

  async function copy() {
    await navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-[480px] max-w-[90vw]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{linkId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Tab switcher */}
          <div className="flex gap-1.5 bg-zinc-100 rounded-lg p-1 mb-5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 text-xs py-1.5 rounded-md transition-all ${
                  tab === t.key
                    ? "bg-white text-zinc-900 font-medium shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Hint text */}
          <p className="text-xs text-zinc-500 mb-3">
            {TABS.find(t => t.key === tab)!.hint}
          </p>

          {/* URL row */}
          <div className="flex gap-2 mb-6">
            <input
              readOnly
              value={currentUrl}
              className="flex-1 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-600 outline-none"
            />
            <button
              onClick={copy}
              className={`px-4 py-2 text-sm rounded-lg border transition-all ${
                copied
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* QR code placeholder */}
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white border border-zinc-200 rounded-xl shadow-sm">
              <QRCode
                value={currentUrl}
                size={140}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
              />
            </div>
            <p className="text-xs text-zinc-400 text-center">
              Scan with any Solana wallet
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
