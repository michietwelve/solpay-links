"use client";

import React, { useState } from "react";
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
  isStealthEnabled: boolean;
  isEscrowEnabled: boolean;
  isLootboxEnabled: boolean;
  tippingPointCount: string;
  tippingPointAmount: string;
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
  isStealthEnabled: false,
  isEscrowEnabled: false,
  isLootboxEnabled: false,
  tippingPointCount: "",
  tippingPointAmount: "",
};

export default function CreateLinkForm({ onSuccess, onCancel }: Props) {
  const { user, getAccessToken } = usePrivy();
  const { publicKey: solanaPublicKey } = useWallet();
  const { wallets: privySolanaWallets } = useSolanaWallets();

  const recipientAddress = (() => {
    const embedded = privySolanaWallets.find(w => w.walletClientType === 'privy');
    if (embedded) return embedded.address;
    if (solanaPublicKey) return solanaPublicKey.toBase58();
    if (privySolanaWallets.length > 0) return privySolanaWallets[0].address;
    const linked = user?.linkedAccounts.find(a => a.type === 'wallet' && (a as any).chainType === 'solana') as any;
    return linked?.address || null;
  })();

  const [formData, setFormData] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [enableRedirect, setEnableRedirect] = useState(false);

  // Initialize recipientWallet from detected address
  useState(() => {
    if (recipientAddress) {
      setFormData(prev => ({ ...prev, recipientWallet: recipientAddress }));
    }
  });

  const setField = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [k]: e.target.value }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const toggleField = (k: keyof FormState) => () => {
    setFormData((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!formData.label.trim()) errs.label = "Label is required";
    if (!formData.description.trim()) errs.description = "Description is required";
    if (formData.amount && (isNaN(Number(formData.amount)) || Number(formData.amount) <= 0))
      errs.amount = "Must be a positive number";
    if (formData.memo && formData.memo.length > 32)
      errs.memo = "Max 32 characters";
    if (formData.redirectUrl && !formData.redirectUrl.startsWith("https://"))
      errs.redirectUrl = "Must be a valid https:// URL";
    if (formData.digitalAssetUrl && !formData.digitalAssetUrl.startsWith("https://"))
      errs.digitalAssetUrl = "Must be a valid https:// URL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!recipientAddress) {
      setApiError("Identity Error: No Solana wallet found.");
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const token = await getAccessToken();
      const result = await createLink(token ?? "", {
        recipientWallet: formData.recipientWallet.trim() || recipientAddress!,
        token: formData.token,
        label: formData.label.trim(),
        description: formData.description.trim(),
        ...(formData.amount ? { amount: parseFloat(formData.amount) } : {}),
        ...(formData.memo ? { memo: formData.memo.trim() } : {}),
        ...(formData.expiresIn !== "0" ? { expiresInMinutes: parseInt(formData.expiresIn) } : {}),
        ...(formData.maxPayments ? { maxPayments: parseInt(formData.maxPayments) } : {}),
        ...(enableRedirect && formData.redirectUrl ? { redirectUrl: formData.redirectUrl.trim() } : {}),
        ...(formData.digitalAssetUrl ? { digitalAssetUrl: formData.digitalAssetUrl.trim() } : {}),
        merchantId: user?.id ?? recipientAddress,
        isSplitPayment: formData.isSplitPayment,
        targetAmount: formData.targetAmount ? parseFloat(formData.targetAmount) : undefined,
        isRoundupEnabled: formData.isRoundupEnabled,
        roundupVaultAddress: formData.roundupVaultAddress.trim() || undefined,
        isLootboxEnabled: formData.isLootboxEnabled,
        cashbackBps: formData.cashbackBps ? parseInt(formData.cashbackBps) : undefined,
        referralBps: formData.referralBps ? parseInt(formData.referralBps) : undefined,
        discountBps: formData.discountBps ? parseInt(formData.discountBps) : undefined,
        maxSlippageBps: formData.maxSlippageBps ? parseInt(formData.maxSlippageBps) : undefined,
        isStealthEnabled: formData.isStealthEnabled,
        isEscrowEnabled: formData.isEscrowEnabled,
        isLootboxEnabled: formData.isLootboxEnabled,
        tippingPointCount: formData.tippingPointCount ? parseInt(formData.tippingPointCount) : undefined,
        tippingPointAmount: formData.tippingPointAmount ? parseFloat(formData.tippingPointAmount) : undefined,
      });
      onSuccess(result);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

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
          value={formData.recipientWallet}
          onChange={setField("recipientWallet")}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Display Label</label>
          <input 
            placeholder="e.g. Coffee Subscription"
            className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
            value={formData.label}
            onChange={setField("label")}
          />
          {errors.label && <p className="text-[10px] text-red-500 font-bold uppercase ml-1">{errors.label}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Price / Goal</label>
          <div className="relative">
            <input 
              placeholder="0.00"
              className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-mono font-bold focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all pr-16"
              value={formData.amount}
              onChange={setField("amount")}
            />
            <select 
              className="absolute right-2 top-2 bottom-2 bg-zinc-100 border-none rounded-xl text-[10px] font-black px-3 focus:ring-0 outline-none cursor-pointer"
              value={formData.token}
              onChange={e => setField("token")(e as any)}
            >
              <option value="SOL">SOL</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
              <option value="PUSD">PUSD</option>
              <option value="BONK">BONK</option>
            </select>
          </div>
          {errors.amount && <p className="text-[10px] text-red-500 font-bold uppercase ml-1">{errors.amount}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Description</label>
        <textarea 
          placeholder="What are they paying for?"
          rows={3}
          className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm leading-relaxed focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all resize-none"
          value={formData.description}
          onChange={setField("description")}
        />
        {errors.description && <p className="text-[10px] text-red-500 font-bold uppercase ml-1">{errors.description}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] px-1">Digital Asset / Content URL (Optional)</label>
        <input 
          placeholder="https://content.yoursite.com/premium-book.pdf"
          className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all"
          value={formData.digitalAssetUrl}
          onChange={setField("digitalAssetUrl")}
        />
        <p className="text-[9px] text-zinc-400 font-medium px-1">After payment, customers will be redirected to this link to claim their content.</p>
      </div>

      <div className="pt-4 border-t border-zinc-100">
        <h4 className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-zinc-900 rounded-full" />
          Hackathon Superpowers
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div 
            onClick={toggleField("isStealthEnabled")}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isStealthEnabled ? 'border-purple-500 bg-purple-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Umbra Privacy</span>
              <div className={`w-2 h-2 rounded-full ${formData.isStealthEnabled ? 'bg-purple-500' : 'bg-zinc-300'}`} />
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight">Decouple your identity with stealth addresses.</p>
          </div>

          <div 
            onClick={toggleField("isSplitPayment")}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isSplitPayment ? 'border-emerald-500 bg-emerald-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Crowdfund Goal</span>
              <div className={`w-2 h-2 rounded-full ${formData.isSplitPayment ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight">Accept multiple contributions towards a target.</p>
          </div>

          <div 
            onClick={toggleField("isEscrowEnabled")}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isEscrowEnabled ? 'border-amber-500 bg-amber-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Escrow Security</span>
              <div className={`w-2 h-2 rounded-full ${formData.isEscrowEnabled ? 'bg-amber-500' : 'bg-zinc-300'}`} />
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight">Lock funds until product delivery is confirmed.</p>
          </div>

          <div 
            onClick={toggleField("isLootboxEnabled")}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isLootboxEnabled ? 'border-blue-500 bg-blue-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Lootbox Luck</span>
              <div className={`w-2 h-2 rounded-full ${formData.isLootboxEnabled ? 'bg-blue-500' : 'bg-zinc-300'}`} />
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight">1% chance for customers to get the item for free.</p>
          </div>

          <div 
            onClick={toggleField("isRoundupEnabled")}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.isRoundupEnabled ? 'border-rose-500 bg-rose-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Savings Round-Up</span>
              <div className={`w-2 h-2 rounded-full ${formData.isRoundupEnabled ? 'bg-rose-500' : 'bg-zinc-300'}`} />
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight">Automatically round up payments to your treasury.</p>
          </div>
        </div>

        {formData.isRoundupEnabled && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl space-y-2 animate-in slide-in-from-top-2">
            <label className="text-[9px] font-black text-rose-900 uppercase tracking-widest pl-1">Round-Up Vault Address</label>
            <input 
              placeholder="Vault wallet address"
              className="w-full p-3 bg-white border border-rose-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              value={formData.roundupVaultAddress}
              onChange={setField("roundupVaultAddress")}
            />
          </div>
        )}

        <div 
          onClick={() => setFormData(prev => ({ ...prev, tippingPointCount: prev.tippingPointCount ? "" : "10" }))}
          className={`mt-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${formData.tippingPointCount ? 'border-indigo-500 bg-indigo-50' : 'border-zinc-100 bg-zinc-50 hover:border-zinc-200'}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-tight text-zinc-900">Tipping Point (Group Buy)</span>
            <div className={`w-2 h-2 rounded-full ${formData.tippingPointCount ? 'bg-indigo-500' : 'bg-zinc-300'}`} />
          </div>
          <p className="text-[9px] text-zinc-500 font-medium leading-tight">Unlock a discount once enough people buy.</p>
          
          {formData.tippingPointCount && (
            <div className="mt-4 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-indigo-900 uppercase tracking-widest">Buyer Threshold</label>
                <input 
                  placeholder="e.g. 50"
                  className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-xs font-bold"
                  value={formData.tippingPointCount}
                  onChange={setField("tippingPointCount")}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-indigo-900 uppercase tracking-widest">Reduced Price</label>
                <input 
                  placeholder="e.g. 5.00"
                  className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-xs font-bold"
                  value={formData.tippingPointAmount}
                  onChange={setField("tippingPointAmount")}
                />
              </div>
            </div>
          )}
        </div>

        {formData.isSplitPayment && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-emerald-900 uppercase tracking-widest pl-1">Target Goal Amount ({formData.token})</label>
              <input 
                placeholder="e.g. 50"
                className="w-full p-3 bg-white border border-emerald-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={formData.targetAmount}
                onChange={setField("targetAmount")}
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">Cashback (BPS)</label>
            <input 
              placeholder="e.g. 100 (1%)"
              className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
              value={formData.cashbackBps}
              onChange={setField("cashbackBps")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">Referral (BPS)</label>
            <input 
              placeholder="e.g. 200 (2%)"
              className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
              value={formData.referralBps}
              onChange={setField("referralBps")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest pl-1">Discount (BPS)</label>
            <input 
              placeholder="e.g. 500 (5%)"
              className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
              value={formData.discountBps}
              onChange={setField("discountBps")}
            />
          </div>
        </div>
      </div>

      {apiError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl animate-shake">
          <p className="text-[10px] font-black text-red-600 uppercase tracking-tight">{apiError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-5 bg-zinc-950 text-white rounded-2xl text-xs font-black uppercase tracking-[0.25em] hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-3 active:scale-[0.98]"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        ) : (
          "Generate Payment Link"
        )}
      </button>

    </form>
  );
}
