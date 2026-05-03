"use client";

import { useState } from "react";

interface MerchantProfile {
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  webhookUrl: string | null;
}

interface StorefrontSettingsProps {
  profile: MerchantProfile;
  onSave: (data: Partial<MerchantProfile>) => Promise<void>;
}

export default function StorefrontSettings({ profile, onSave }: StorefrontSettingsProps) {
  const [businessName, setBusinessName] = useState(profile.businessName ?? "");
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(profile.accentColor ?? "#c5a36e");
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        businessName: businessName || null,
        logoUrl: logoUrl || null,
        accentColor: accentColor || "#c5a36e",
        webhookUrl: webhookUrl || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 block">Brand Identity</label>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs text-zinc-500 font-medium ml-1">Business Name</span>
            <input
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. BiePay Luxury"
              className="w-full p-4 bg-zinc-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-zinc-500 font-medium ml-1">Logo URL</span>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://yourbrand.com/logo.png"
              className="w-full p-4 bg-zinc-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-zinc-500 font-medium ml-1">Accent Color</span>
            <div className="flex gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={e => setAccentColor(e.target.value)}
                className="w-12 h-12 rounded-xl border-none p-1 bg-zinc-50 cursor-pointer"
              />
              <input
                value={accentColor}
                onChange={e => setAccentColor(e.target.value)}
                placeholder="#c5a36e"
                className="flex-1 p-4 bg-zinc-50 border-none rounded-2xl text-sm font-mono uppercase"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 block">Developer Hooks</label>
        <div className="space-y-1.5">
          <span className="text-xs text-zinc-500 font-medium ml-1">Webhook URL</span>
          <input
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            placeholder="https://api.yoursite.com/webhooks/biepay"
            className="w-full p-4 bg-zinc-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all"
          />
          <p className="text-[10px] text-zinc-400 ml-1">We'll POST to this URL on every confirmed payment.</p>
        </div>
      </div>

      <div className="pt-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-zinc-900 text-white font-semibold rounded-2xl hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-200"
        >
          {isSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {isSaving ? "Saving Settings..." : "Save Storefront Changes"}
        </button>
      </div>
    </div>
  );
}
