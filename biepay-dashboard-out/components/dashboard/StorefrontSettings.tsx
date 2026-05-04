import { useState, useRef } from "react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For a real production app, we'd upload to S3/Cloudinary here.
    // For this demo, we use a FileReader to show the image instantly.
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 block">Brand Identity</label>
          
          <div className="flex items-center gap-6 mb-6 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 bg-white rounded-2xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-900 transition-all overflow-hidden shrink-0 group relative"
            >
              {logoUrl ? (
                <>
                  <img src={logoUrl} alt="Logo Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <svg className="w-6 h-6 text-zinc-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[9px] text-zinc-400 font-bold mt-1 uppercase">Upload</span>
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleFileUpload} 
              />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-zinc-900">Business Logo</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">Upload a high-resolution PNG or SVG. This will appear on all your checkout links.</p>
            </div>
          </div>

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
              <span className="text-xs text-zinc-500 font-medium ml-1">Accent Color</span>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  className="w-14 h-14 rounded-2xl border-none p-1 bg-zinc-50 cursor-pointer shadow-sm"
                />
                <input
                  value={accentColor}
                  onChange={e => setAccentColor(e.target.value)}
                  placeholder="#c5a36e"
                  className="flex-1 p-4 bg-zinc-50 border-none rounded-2xl text-sm font-mono uppercase focus:ring-2 focus:ring-zinc-900"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-zinc-100" />

        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 block">Developer Hooks</label>
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
      </div>

      <div className="pt-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-zinc-200"
        >
          {isSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {isSaving ? "Synchronizing Storefront..." : "Save Storefront Changes"}
        </button>
      </div>
    </div>
  );
}
