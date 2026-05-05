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
  onExport: () => void;
}

export default function StorefrontSettings({ profile, onSave, onExport }: StorefrontSettingsProps) {
  const [activeTab, setActiveTab] = useState<"brand" | "security">("brand");
  const [businessName, setBusinessName] = useState(profile.businessName ?? "");
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(profile.accentColor ?? "#c5a36e");
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      await onSave({
        businessName: businessName || null,
        logoUrl: logoUrl || null,
        accentColor: accentColor || "#c5a36e",
        webhookUrl: webhookUrl || null,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl">
        <button
          onClick={() => setActiveTab("brand")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === "brand" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Storefront
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === "security" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Advanced & Security
        </button>
      </div>

      <div className="min-h-[350px]">
        {activeTab === "brand" ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Live Blink Preview */}
            <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block text-center">Live Blink Preview</label>
              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-zinc-100 rounded-lg overflow-hidden shrink-0 border border-zinc-100">
                    {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-300 font-bold">B</div>}
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 w-32 bg-zinc-900 rounded" style={{ backgroundColor: accentColor || '#18181b' }}></div>
                    <div className="h-2 w-24 bg-zinc-200 rounded"></div>
                  </div>
                </div>
                <div className="h-8 w-full rounded-lg flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider" style={{ backgroundColor: accentColor || '#18181b' }}>
                  Pay with Solana
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 block">Visual Identity</label>
              <div className="flex items-center gap-6 mb-6 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 bg-white rounded-2xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center cursor-pointer hover:border-zinc-900 transition-all overflow-hidden shrink-0 group relative"
                >
                  {logoUrl ? (
                    <>
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <svg className="w-6 h-6 text-zinc-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-zinc-900">Brand Logo</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">Shown on all payment links and checkout pages.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-xs text-zinc-500 font-medium ml-1">Business Name</span>
                  <input
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g. BiePay Luxury"
                    className="w-full p-4 bg-zinc-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900"
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
                      className="flex-1 p-4 bg-zinc-50 border-none rounded-2xl text-sm font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 block">Developer Hooks</label>
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-500 font-medium ml-1">Webhook URL</span>
                <input
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="https://api.yoursite.com/webhooks"
                  className="w-full p-4 bg-zinc-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900"
                />
                <p className="text-[10px] text-zinc-400 ml-1">We'll notify this URL on every transaction.</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 block">Self-Custody</label>
              <button
                onClick={onExport}
                className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-zinc-50 hover:border-zinc-300 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center group-hover:bg-white">
                    <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <span>Export Private Keys</span>
                </div>
                <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <p className="text-[10px] text-zinc-400 mt-3 ml-1">Take full control of your merchant wallet funds.</p>
            </div>
          </div>
        )}
      </div>

      <div className="pt-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full py-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-3 shadow-2xl shadow-zinc-200 ${
            saveStatus === "success" ? "bg-emerald-500 text-white" : 
            saveStatus === "error" ? "bg-red-500 text-white" : 
            "bg-zinc-900 text-white hover:bg-zinc-800"
          }`}
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saveStatus === "success" ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : saveStatus === "error" ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : null}
          {isSaving ? "Saving..." : saveStatus === "success" ? "Changes Saved" : saveStatus === "error" ? "Save Failed" : "Confirm Settings"}
        </button>
      </div>
    </div>
  );
}
