"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { createLink } from "../../hooks/useLinks";
import type { CreateLinkResponse, SupportedToken } from "../../lib/api";

interface Props {
  onSuccess: (result: CreateLinkResponse) => void;
  onCancel: () => void;
}

interface FormState {
  label: string;
  description: string;
  token: SupportedToken;
  amount: string;
  memo: string;
  expiresIn: string;
  maxPayments: string;
  redirectUrl: string;
  digitalAssetUrl: string;
  recipientWallet: string;
}

const INITIAL: FormState = {
  label: "",
  description: "",
  token: "USDC",
  amount: "",
  memo: "",
  expiresIn: "0",
  maxPayments: "",
  redirectUrl: "",
  digitalAssetUrl: "",
  recipientWallet: "",
};

export default function CreateLinkForm({ onSuccess, onCancel }: Props) {
  const { user, getAccessToken } = usePrivy();
  const { publicKey: solanaPublicKey } = useWallet();
  const { wallets: privySolanaWallets } = useSolanaWallets();

  // Priority: Privy Embedded Solana wallet > Solana Wallet Adapter > Linked Solana wallets
  const recipientAddress = (() => {
    // 1. Prefer the Privy Embedded Wallet for the seamless "One-Click" merchant experience
    const embedded = privySolanaWallets.find(w => w.walletClientType === 'privy');
    if (embedded) return embedded.address;

    // 2. If no embedded, use an external wallet connected via Adapter
    if (solanaPublicKey) return solanaPublicKey.toBase58();
    
    // 3. Fallback to first linked Solana wallet
    if (privySolanaWallets.length > 0) return privySolanaWallets[0].address;

    // 4. Last ditch: check linked accounts directly
    const linked = user?.linkedAccounts.find(a => a.type === 'wallet' && (a as any).chainType === 'solana') as any;
    return linked?.address || null;
  })();

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [enableRedirect, setEnableRedirect] = useState(false);

  // Initialize recipientWallet from detected address
  useState(() => {
    if (recipientAddress) {
      setForm(prev => ({ ...prev, recipientWallet: recipientAddress }));
    }
  });

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.label.trim()) errs.label = "Label is required";
    if (!form.description.trim()) errs.description = "Description is required";
    if (form.amount && (isNaN(Number(form.amount)) || Number(form.amount) <= 0))
      errs.amount = "Must be a positive number";
    if (form.memo && form.memo.length > 32)
      errs.memo = "Max 32 characters";
    if (form.redirectUrl && !form.redirectUrl.startsWith("https://"))
      errs.redirectUrl = "Must be a valid https:// URL";
    if (form.digitalAssetUrl && !form.digitalAssetUrl.startsWith("https://"))
      errs.digitalAssetUrl = "Must be a valid https:// URL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!recipientAddress) {
      setApiError("Identity Error: We couldn't find a Solana wallet associated with your account. Please link a wallet or sign in again.");
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const token = await getAccessToken();
      const result = await createLink(token ?? "", {
        recipientWallet: form.recipientWallet.trim() || recipientAddress!,
        token: form.token,
        label: form.label.trim(),
        description: form.description.trim(),
        ...(form.amount ? { amount: parseFloat(form.amount) } : {}),
        ...(form.memo ? { memo: form.memo.trim() } : {}),
        ...(form.expiresIn !== "0" ? { expiresInMinutes: parseInt(form.expiresIn) } : {}),
        ...(form.maxPayments ? { maxPayments: parseInt(form.maxPayments) } : {}),
        ...(enableRedirect && form.redirectUrl ? { redirectUrl: form.redirectUrl.trim() } : {}),
        ...(form.digitalAssetUrl ? { digitalAssetUrl: form.digitalAssetUrl.trim() } : {}),
        merchantId: user?.id ?? recipientAddress,
      });
      onSuccess(result);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (k: keyof FormState) =>
    `w-full px-3 py-2 text-sm border rounded-lg bg-white outline-none transition-colors ${
      errors[k]
        ? "border-red-300 focus:border-red-500"
        : "border-zinc-200 focus:border-zinc-400"
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Recipient Wallet (Solana)</label>
          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded uppercase tracking-tighter">Settlement Address</span>
        </div>
        <input 
          placeholder="Paste your Solana wallet address (e.g. Phantom)"
          className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
          value={form.recipientWallet}
          onChange={set("recipientWallet")}
        />
        <p className="mt-2 px-1 text-[10px] text-zinc-400 font-medium">
          <strong>Tip:</strong> This is where your sales revenue will be sent. We recommend using your <strong>Privy Embedded Wallet</strong> (see dashboard top bar) for the smoothest experience.
        </p>
      </div>

      {apiError && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {apiError}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1.5">
          Label <span className="text-red-400">*</span>
        </label>
        <input
          className={inputCls("label")}
          value={form.label}
          onChange={set("label")}
          placeholder="e.g. Invoice #42, Monthly retainer…"
        />
        {errors.label && <p className="text-xs text-red-500 mt-1">{errors.label}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1.5">
          Description <span className="text-red-400">*</span>
        </label>
        <input
          className={inputCls("description")}
          value={form.description}
          onChange={set("description")}
          placeholder="Short description shown to payer in Phantom"
        />
        {errors.description && (
          <p className="text-xs text-red-500 mt-1">{errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Token</label>
          <select
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white outline-none focus:border-zinc-400"
            value={form.token}
            onChange={set("token")}
          >
            <option value="USDC">USDC</option>
            <option value="SOL">SOL</option>
            <option value="USDT">USDT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Amount</label>
          <input
            className={inputCls("amount")}
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={set("amount")}
            placeholder="Leave blank = open"
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Expires in</label>
          <select
            className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white outline-none focus:border-zinc-400"
            value={form.expiresIn}
            onChange={set("expiresIn")}
          >
            <option value="0">Never</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
            <option value="43200">30 days</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">
            Max payments
          </label>
          <input
            className={inputCls("maxPayments")}
            type="number"
            min="1"
            value={form.maxPayments}
            onChange={set("maxPayments")}
            placeholder="Unlimited"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1.5">
          On-chain memo
          <span className="text-zinc-400 font-normal ml-1">(max 32 chars)</span>
        </label>
        <input
          className={inputCls("memo")}
          value={form.memo}
          onChange={set("memo")}
          placeholder="INV-042"
          maxLength={32}
        />
        {errors.memo && <p className="text-xs text-red-500 mt-1">{errors.memo}</p>}
      </div>

      <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Custom Thank You URL</label>
            <p className="text-[10px] text-zinc-500 font-medium mt-0.5">Redirect customers to your site after payment</p>
          </div>
          <button 
            type="button"
            onClick={() => {
              setEnableRedirect(!enableRedirect);
              if (enableRedirect) set((k) => ({ ...k, redirectUrl: "" }) as any)({ target: { value: "" } } as any);
            }}
            className={`w-10 h-5 rounded-full transition-colors relative ${enableRedirect ? 'bg-emerald-500' : 'bg-zinc-200'}`}
          >
            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-transform ${enableRedirect ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        
        {enableRedirect && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <input
              className={inputCls("redirectUrl")}
              value={form.redirectUrl}
              onChange={set("redirectUrl")}
              placeholder="https://yoursite.com/thank-you"
            />
            {errors.redirectUrl && (
              <p className="text-xs text-red-500 mt-1">{errors.redirectUrl}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Digital Asset / Download URL</label>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-tighter">Automatic Delivery</span>
        </div>
        <input 
          placeholder="https://drive.google.com/s/your-file..."
          className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
          value={form.digitalAssetUrl}
          onChange={set("digitalAssetUrl")}
        />
        {errors.digitalAssetUrl && (
          <p className="text-xs text-red-500 mt-1">{errors.digitalAssetUrl}</p>
        )}
        <div className="mt-3 p-4 bg-zinc-950 rounded-2xl border border-white/5 space-y-2 shadow-2xl">
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
            <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            Merchant Guide: Where to get this?
          </p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Upload your file to <strong>Google Drive</strong>, <strong>Dropbox</strong>, or <strong>Pinata</strong>. 
            Ensure sharing is set to "Anyone with link", then paste that link here. 
            Customers will receive this link instantly upon payment confirmation.
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-4 py-2 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Creating…" : "Generate link"}
        </button>
      </div>
    </form>
  );
}
