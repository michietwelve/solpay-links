"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
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
};

export default function CreateLinkForm({ onSuccess, onCancel }: Props) {
  const { user } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { publicKey: solanaPublicKey } = useWallet();

  // Priority: Solana Wallet Adapter > Privy Solana wallet > never EVM
  const recipientAddress = (() => {
    if (solanaPublicKey) return solanaPublicKey.toBase58();
    const sol = privyWallets.find(w => (w as any).chainType === 'solana');
    if (sol) return sol.address;
    return null;
  })();

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!recipientAddress) {
      setApiError("Please connect your Solana wallet (Phantom/Backpack) first.");
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const result = await createLink({
        recipientWallet: recipientAddress,
        token: form.token,
        label: form.label.trim(),
        description: form.description.trim(),
        ...(form.amount ? { amount: parseFloat(form.amount) } : {}),
        ...(form.memo ? { memo: form.memo.trim() } : {}),
        ...(form.expiresIn !== "0" ? { expiresInMinutes: parseInt(form.expiresIn) } : {}),
        ...(form.maxPayments ? { maxPayments: parseInt(form.maxPayments) } : {}),
        ...(form.redirectUrl ? { redirectUrl: form.redirectUrl.trim() } : {}),
        merchantId: recipientAddress,
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

      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1.5">
          Redirect URL after payment
        </label>
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
