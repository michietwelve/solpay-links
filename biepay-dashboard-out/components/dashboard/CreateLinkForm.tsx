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
  // Hackathon Superpowers
  isSplitPayment: boolean;
  targetAmount: string;
  isRoundupEnabled: boolean;
  roundupVaultAddress: string;
  isLootboxEnabled: boolean;
  cashbackBps: string;
  referralBps: string;
  discountBps: string;
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
  // Hackathon Superpowers
  isSplitPayment: false,
  targetAmount: "",
  isRoundupEnabled: false,
  roundupVaultAddress: "",
  isLootboxEnabled: false,
  cashbackBps: "",
  referralBps: "",
  discountBps: "",
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

  const toggle = (k: keyof FormState) => () => {
    setForm((prev) => ({ ...prev, [k]: !prev[k] }));
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
        
        // Hackathon Superpowers
        isSplitPayment: form.isSplitPayment,
        targetAmount: form.targetAmount ? parseFloat(form.targetAmount) : undefined,
        isRoundupEnabled: form.isRoundupEnabled,
        roundupVaultAddress: form.roundupVaultAddress.trim() || undefined,
        isLootboxEnabled: form.isLootboxEnabled,
        cashbackBps: form.cashbackBps ? parseInt(form.cashbackBps) : undefined,
        referralBps: form.referralBps ? parseInt(form.referralBps) : undefined,
        discountBps: form.discountBps ? parseInt(form.discountBps) : undefined,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Settlement Destination</label>
          <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-tighter">Verified Solana</span>
        </div>
        <input 
          placeholder="Paste Solana address (e.g. Phantom)"
          className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-mono focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all shadow-sm"
          value={form.recipientWallet}
          onChange={set("recipientWallet")}
        />
        <p className="px-1 text-[9px] text-zinc-400 font-bold uppercase tracking-tight">
          Revenue is settled instantly to this address.
        </p>
      </div>

      {apiError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[11px] text-red-600 font-bold leading-tight">{apiError}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Product Identity</label>
            <input
              className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-black tracking-tight focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              value={form.label}
              onChange={set("label")}
              placeholder="e.g. Luxury Timepiece #42"
            />
            {errors.label && <p className="text-[10px] text-red-500 font-black uppercase tracking-widest pl-1">{errors.label}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Customer Description</label>
            <textarea
              className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all min-h-[100px] resize-none"
              value={form.description}
              onChange={set("description")}
              placeholder="Brief description shown to the payer during checkout..."
            />
            {errors.description && <p className="text-[10px] text-red-500 font-black uppercase tracking-widest pl-1">{errors.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Currency</label>
            <div className="relative">
              <select
                className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-black appearance-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all cursor-pointer"
                value={form.token}
                onChange={set("token")}
              >
                <option value="USDC">USDC (Stable)</option>
                <option value="SOL">SOL (Native)</option>
                <option value="USDT">USDT (Stable)</option>
                <option value="PUSD">PUSD (Palm USD)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Fixed Price</label>
            <div className="relative">
              <input
                className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-black focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
                type="number"
                min="0"
                step="any"
                value={form.amount}
                onChange={set("amount")}
                placeholder="Leave blank for open"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-300 uppercase tracking-widest">
                {form.token}
              </div>
            </div>
            {errors.amount && <p className="text-[10px] text-red-500 font-black uppercase tracking-widest pl-1">{errors.amount}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Expiration</label>
            <div className="relative">
              <select
                className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold appearance-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all cursor-pointer"
                value={form.expiresIn}
                onChange={set("expiresIn")}
              >
                <option value="0">Never Expires</option>
                <option value="1">1 Minute (Test)</option>
                <option value="5">5 Minutes (Test)</option>
                <option value="1440">24 Hours</option>
                <option value="10080">7 Days</option>
                <option value="43200">30 Days</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] pl-1">Inventory Limit</label>
            <input
              className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
              type="number"
              min="1"
              value={form.maxPayments}
              onChange={set("maxPayments")}
              placeholder="Unlimited"
            />
          </div>
        </div>
      </div>

      <div className="p-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl space-y-6 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
          <svg className="w-32 h-32 text-white fill-current" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.45l7.39 12.55H4.61L12 5.45zM11 11v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
        </div>
        
        <div className="space-y-1 relative">
          <h4 className="text-[12px] font-black text-white uppercase tracking-[0.2em]">Hackathon Superpowers</h4>
          <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-tight opacity-80">Viral Loops, DeFi Round-Ups & Gamification</p>
        </div>

        {/* Viral Loop Section */}
        <div className="space-y-4 p-4 bg-white/10 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-white uppercase tracking-wider">Viral Growth Loop</p>
              <p className="text-[9px] text-white/60 font-bold">Incentivize customers to share</p>
            </div>
            <div className="flex gap-2">
              <input 
                type="number" 
                placeholder="Ref %" 
                className="w-16 p-2 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white outline-none"
                value={form.referralBps}
                onChange={set("referralBps")}
              />
              <input 
                type="number" 
                placeholder="Disc %" 
                className="w-16 p-2 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white outline-none"
                value={form.discountBps}
                onChange={set("discountBps")}
              />
            </div>
          </div>
        </div>

        {/* Savings & Lootbox Section */}
        <div className="grid grid-cols-2 gap-4">
          <div 
            onClick={toggle("isRoundupEnabled")}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${form.isRoundupEnabled ? 'bg-white/20 border-white/40 shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
          >
            <p className="text-[10px] font-black text-white uppercase mb-1">Savings Round-Up</p>
            <p className="text-[9px] text-white/50 font-medium leading-tight">Donate spare change to your vault</p>
          </div>
          <div 
            onClick={toggle("isLootboxEnabled")}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${form.isLootboxEnabled ? 'bg-white/20 border-white/40 shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
          >
            <p className="text-[10px] font-black text-white uppercase mb-1">Checkout Lootbox</p>
            <p className="text-[9px] text-white/50 font-medium leading-tight">1% chance for free order</p>
          </div>
        </div>

        {/* Social Split Section */}
        <div className="space-y-4 p-4 bg-white/10 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-white uppercase tracking-wider">Social Split Payment</p>
              <p className="text-[9px] text-white/60 font-bold">Crowdfund this goal together</p>
            </div>
            <button 
              type="button"
              onClick={toggle("isSplitPayment")}
              className={`w-10 h-5 rounded-full transition-all relative p-1 ${form.isSplitPayment ? 'bg-emerald-400' : 'bg-white/10'}`}
            >
              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${form.isSplitPayment ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {form.isSplitPayment && (
            <div className="animate-in fade-in zoom-in-95 duration-300 pt-2">
              <input 
                type="number" 
                placeholder="Target Amount (e.g. 100)" 
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white outline-none placeholder:text-white/20"
                value={form.targetAmount}
                onChange={set("targetAmount")}
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-zinc-950 rounded-3xl border border-white/10 space-y-5 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <svg className="w-24 h-24 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Fulfillment & Post-Pay</h4>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">Automation after successful payment</p>
          </div>
          <button 
            type="button"
            onClick={() => setEnableRedirect(!enableRedirect)}
            className={`w-12 h-6 rounded-full transition-all duration-500 relative p-1 ${enableRedirect ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-zinc-800'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full transition-transform duration-500 ${enableRedirect ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
        
        {enableRedirect && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">Redirect URL (Success)</label>
              <input
                className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-mono text-white focus:border-white/30 outline-none transition-all"
                value={form.redirectUrl}
                onChange={set("redirectUrl")}
                placeholder="https://yoursite.com/thank-you"
              />
              {errors.redirectUrl && <p className="text-[10px] text-red-400 font-black uppercase tracking-widest pl-1">{errors.redirectUrl}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Digital Content Access</label>
                <span className="text-[8px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded uppercase tracking-tighter border border-emerald-400/20">Auto-Delivery</span>
              </div>
              <input 
                placeholder="Direct Download or Access Link"
                className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-mono text-white focus:border-white/30 outline-none transition-all"
                value={form.digitalAssetUrl}
                onChange={set("digitalAssetUrl")}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-900 transition-all active:scale-95"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-[2] py-4 bg-zinc-950 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-800 transition-all shadow-2xl shadow-zinc-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Deploy Link</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
