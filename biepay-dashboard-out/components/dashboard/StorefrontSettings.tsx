"use client";

import { useState, useRef } from "react";
import nacl from "tweetnacl";
import bs58 from "bs58";

interface MerchantProfile {
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  snsDomain?: string | null;
  isPro?: boolean;
  stealthViewPubkey?: string | null;
}

interface StorefrontSettingsProps {
  profile: MerchantProfile;
  onSave: (data: Partial<MerchantProfile>) => Promise<void>;
  onExport: () => void;
  onNotify?: (msg: string, type?: "success" | "info" | "error") => void;
  onDelete?: () => void;
}

export default function StorefrontSettings({ profile, onSave, onExport, onNotify, onDelete }: StorefrontSettingsProps) {
  const [activeTab, setActiveTab] = useState<"brand" | "security" | "privacy">("brand");
  const [businessName, setBusinessName] = useState(profile.businessName ?? "");
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(profile.accentColor ?? "#c5a36e");
  const [webhookUrl, setWebhookUrl] = useState(profile.webhookUrl ?? "");
  const [snsDomain, setSnsDomain] = useState(profile.snsDomain ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stealthViewPubkey, setStealthViewPubkey] = useState(profile.stealthViewPubkey ?? "");
  const [stealthSecret, setStealthSecret] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      setErrorMessage(null);
      // Sanitize accent color
      let sanitizedColor = accentColor.trim();
      if (sanitizedColor && !sanitizedColor.startsWith("#")) {
        sanitizedColor = `#${sanitizedColor}`;
      }
      
      // Basic URL validation for webhook
      let sanitizedWebhook = webhookUrl.trim();
      if (sanitizedWebhook && !sanitizedWebhook.startsWith("http")) {
        throw new Error("Webhook URL must start with http:// or https://");
      }

      await onSave({
        businessName: businessName || null,
        logoUrl: logoUrl || null,
        accentColor: sanitizedColor || "#c5a36e",
        webhookUrl: sanitizedWebhook || null,
        snsDomain: snsDomain || null,
        stealthViewPubkey: stealthViewPubkey || null,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e: any) {
      console.error("Save failed:", e);
      setErrorMessage(e.message || "Failed to synchronize changes. Please verify your connection.");
      setSaveStatus("error");
      setTimeout(() => {
        setSaveStatus("idle");
        setErrorMessage(null);
      }, 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const generateStealthKeys = () => {
    try {
      const kp = nacl.box.keyPair();
      const pub = bs58.encode(Buffer.from(kp.publicKey));
      const sec = bs58.encode(Buffer.from(kp.secretKey));
      setStealthViewPubkey(pub);
      setStealthSecret(sec);
      onNotify?.("Generated new stealth keypair. Save your secret key!", "success");
    } catch (e) {
      onNotify?.("Failed to generate keys.", "error");
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
    <div className="space-y-8">
      {/* Premium Tab Navigation */}
      <div className="flex p-1.5 bg-zinc-100 rounded-2xl shadow-inner">
        <button
          onClick={() => setActiveTab("brand")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 ${activeTab === "brand" ? "bg-white shadow-xl text-zinc-900 scale-[1.02]" : "text-zinc-400 hover:text-zinc-600"}`}
        >
          Storefront
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 ${activeTab === "security" ? "bg-white shadow-xl text-zinc-900 scale-[1.02]" : "text-zinc-400 hover:text-zinc-600"}`}
        >
          Advanced
        </button>
        <button
          onClick={() => setActiveTab("privacy")}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-[0.15em] rounded-xl transition-all duration-300 ${activeTab === "privacy" ? "bg-white shadow-xl text-zinc-900 scale-[1.02]" : "text-zinc-400 hover:text-zinc-600"}`}
        >
          Privacy
        </button>
      </div>

      <div className="min-h-[400px]">
        {activeTab === "brand" ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Live Blink Preview - The "WOW" Piece */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-zinc-200 to-zinc-400 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative p-6 bg-zinc-950 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                <div className="absolute top-3 right-3 flex gap-1">
                  <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse"></div>
                  <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse delay-75"></div>
                  <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse delay-150"></div>
                </div>
                <div className="bg-white rounded-xl p-5 space-y-4 shadow-2xl border border-white/10">
                  <div className="flex gap-4">
                    <div className="w-14 h-14 bg-zinc-100 rounded-2xl overflow-hidden shrink-0 border border-zinc-100 shadow-sm flex items-center justify-center">
                      {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <div className="text-zinc-300 font-black text-xl uppercase">{businessName?.[0] || "B"}</div>}
                    </div>
                    <div className="space-y-2 flex-1 pt-1">
                      <div className="h-4 w-2/3 rounded-lg" style={{ backgroundColor: accentColor || '#18181b' }}></div>
                      <div className="h-3 w-1/2 bg-zinc-100 rounded-lg"></div>
                    </div>
                  </div>
                  <div className="h-11 w-full rounded-xl flex items-center justify-center text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-lg transform active:scale-95 transition-all cursor-default" style={{ backgroundColor: accentColor || '#18181b' }}>
                    Pay with Solana
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Live Blink Preview</span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Identity Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-2">
                  <div className="h-px flex-1 bg-zinc-100"></div>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Visual Identity</span>
                  <div className="h-px flex-1 bg-zinc-100"></div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-zinc-300 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Brand Logo</label>
                      <button onClick={() => fileInputRef.current?.click()} className="text-[9px] font-bold text-zinc-400 hover:text-zinc-900 underline uppercase">Upload</button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-16 h-16 bg-white rounded-2xl border-2 border-dashed border-zinc-200 flex items-center justify-center overflow-hidden hover:border-zinc-400 transition-all cursor-pointer shadow-sm"
                      >
                        {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
                      </div>
                      <input 
                        placeholder="Or paste Logo URL..."
                        value={logoUrl}
                        onChange={e => setLogoUrl(e.target.value)}
                        className="flex-1 p-3 bg-white border border-zinc-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
                      />
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-zinc-300 transition-colors">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-3 block">Business Name</label>
                    <input 
                      placeholder="e.g. BiePay Luxury"
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                      className="w-full p-4 bg-white border border-zinc-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all shadow-sm"
                    />
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-zinc-300 transition-colors relative overflow-hidden">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-3 block">Link .sol Domain</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input 
                          placeholder="e.g. merchant.sol"
                          value={snsDomain}
                          onChange={(e) => setSnsDomain(e.target.value)}
                          className="w-full p-4 bg-white border border-zinc-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-zinc-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Accent Color</label>
                      <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold">{accentColor || "#18181B"}</span>
                    </div>
                    <div className="flex gap-4">
                      <input 
                        type="color" 
                        value={accentColor || "#18181b"}
                        onChange={e => setAccentColor(e.target.value)}
                        className="w-14 h-14 rounded-2xl border-none p-1 bg-white shadow-sm cursor-pointer"
                      />
                      <input 
                        value={accentColor}
                        onChange={e => setAccentColor(e.target.value)}
                        className="flex-1 p-3 bg-white border border-zinc-200 rounded-xl text-sm font-mono uppercase font-bold focus:ring-2 focus:ring-zinc-900/5 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 bg-zinc-950 rounded-[2.5rem] border border-white/5 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-zinc-800 to-transparent"></div>
              
              <div className="space-y-2">
                <h3 className="text-white text-lg font-black tracking-tight">Enterprise Infrastructure</h3>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-sm">
                  Configure high-throughput webhooks and export your private keys for full self-custody.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Webhook API Endpoint</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          if (!webhookUrl) return onNotify?.("Enter a URL first.", "error");
                          try {
                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/merchants/test-webhook`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ url: webhookUrl })
                            });
                            if (res.ok) onNotify?.("Test webhook sent successfully!", "success");
                            else onNotify?.("Webhook endpoint returned an error.", "error");
                          } catch (e) {
                            onNotify?.("Failed to reach webhook endpoint.", "error");
                          }
                        }}
                        className="px-2 py-0.5 bg-zinc-800 text-zinc-400 hover:text-white text-[8px] font-black uppercase rounded transition-colors"
                      >
                        Test
                      </button>
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-500 text-[8px] font-black uppercase rounded">Optional</span>
                    </div>
                  </div>
                  <input 
                    placeholder="https://api.yourstore.com/webhooks/biepay"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    className="w-full p-5 bg-zinc-900/50 border border-zinc-800 text-white rounded-2xl text-sm font-mono focus:ring-2 focus:ring-white/10 outline-none transition-all"
                  />
                  
                  {profile?.webhookSecret && (
                    <div className="p-4 bg-zinc-950 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Webhook Signing Secret</span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(profile.webhookSecret!);
                            onNotify?.("Secret copied! Use this to verify X-BiePay-Signature on your server.", "success");
                          }}
                          className="text-[10px] font-black text-zinc-400 hover:text-white uppercase underline"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block text-xs font-mono text-zinc-400 truncate bg-black/50 p-3 rounded-xl border border-white/5">
                        {profile.webhookSecret}
                      </code>
                      <p className="text-[9px] text-zinc-600 font-medium leading-relaxed">
                        Every webhook payload includes an <strong>X-BiePay-Signature</strong> header. Use this secret to calculate the HMAC-SHA256 hash of the request body and verify it matches the header.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-zinc-800/50">
                  <button 
                    onClick={onExport}
                    className="w-full p-5 bg-zinc-800/50 hover:bg-white hover:text-black text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 group border border-white/5 shadow-xl"
                  >
                    <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Export Security Keys
                  </button>
                </div>
              </div>
            </div>

            {/* Pro Upgrade Section */}
            <div className="relative group p-8 rounded-[2.5rem] bg-gradient-to-br from-zinc-900 via-[#1a1a1a] to-black border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-24 h-24 text-[#c5a36e]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              
              <div className="relative space-y-6">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-[#c5a36e]/10 text-[#c5a36e] text-[10px] font-black uppercase tracking-widest rounded-full border border-[#c5a36e]/20">
                    BiePay Pro
                  </span>
                  <div className="h-px flex-1 bg-white/5"></div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-white text-xl font-black tracking-tight">Scale Your Commerce</h3>
                  <p className="text-zinc-400 text-xs leading-relaxed max-w-sm">
                    Unlock enterprise-grade features designed for high-volume merchants and global brands.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { label: "Custom Domains" },
                    { label: "Zero Fees" },
                    { label: "Predictive Analytics" },
                    { label: "Priority API" }
                  ].map((feature, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c5a36e]/40" />
                      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tight">{feature.label}</span>
                    </div>
                  ))}
                </div>

                {profile.isPro ? (
                  <div className="w-full py-4 bg-zinc-800 text-zinc-400 font-black text-xs uppercase tracking-[0.2em] rounded-xl text-center border border-zinc-700">
                    Pro Unlocked
                  </div>
                ) : (
                  <button 
                    className="w-full py-4 bg-[#c5a36e] text-black font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:bg-[#d4b98c] transition-all shadow-[0_10px_30px_rgba(197,163,110,0.25)] hover:shadow-[0_15px_40px_rgba(197,163,110,0.35)] hover:-translate-y-0.5 active:translate-y-0"
                    onClick={async () => {
                      onNotify?.("Unlocking BiePay Pro...", "info");
                      await onSave({ isPro: true });
                      onNotify?.("BiePay Pro unlocked successfully!", "success");
                    }}
                  >
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </div>

            <div className="p-8 bg-red-50/50 rounded-[2.5rem] border border-red-100 shadow-sm group hover:bg-red-50 transition-colors">
              <h4 className="text-red-900 text-sm font-black tracking-tight mb-2">Danger Zone</h4>
              <p className="text-red-500 text-[10px] font-bold uppercase tracking-[0.15em] mb-6">Irreversible Account Deletion</p>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to permanently delete your merchant account and all associated payment links? This cannot be undone.")) {
                    onDelete?.();
                  }
                }}
                className="w-full p-5 bg-white border border-red-200 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white transition-all shadow-lg hover:shadow-red-200"
              >
                Purge Merchant Data
              </button>
            </div>
            </div>
          </div>
        ) : activeTab === "privacy" ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 bg-purple-950/10 rounded-[2.5rem] border border-purple-500/10 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <svg className="w-32 h-32 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-purple-300 text-lg font-black tracking-tight uppercase tracking-widest">Umbra Protocol</h3>
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-black rounded border border-purple-500/30 uppercase tracking-widest">Privacy Engine</span>
                </div>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-sm font-medium">
                  Enable stealth payments to decouple your business identity from on-chain transactions.
                </p>
              </div>

              <div className="space-y-6">
                {!stealthViewPubkey ? (
                  <div className="p-6 bg-purple-500/5 rounded-3xl border border-purple-500/10 text-center space-y-4">
                    <p className="text-[10px] text-purple-300/60 font-bold uppercase tracking-widest leading-relaxed">
                      You haven&apos;t set up a stealth view key yet.<br/>Generate one to unlock private payments.
                    </p>
                    <button 
                      onClick={generateStealthKeys}
                      className="px-6 py-3 bg-purple-500 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-purple-400 transition-all shadow-lg shadow-purple-500/20"
                    >
                      Initialize Stealth Identity
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-purple-400/60 uppercase tracking-[0.2em] pl-1">Stealth View Public Key (Published)</label>
                      <div className="flex gap-2">
                        <code className="flex-1 p-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-mono text-purple-200 truncate">
                          {stealthViewPubkey}
                        </code>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(stealthViewPubkey); onNotify?.("Copied Pubkey", "info"); }}
                          className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
                        >
                          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                      </div>
                    </div>

                    {stealthSecret && (
                      <div className="p-6 bg-red-500/10 rounded-3xl border border-red-500/20 space-y-3 animate-in zoom-in-95 duration-500">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <label className="text-[9px] font-black text-red-400 uppercase tracking-[0.2em]">Secret Key — Save it now!</label>
                        </div>
                        <p className="text-[9px] text-red-400/70 font-bold leading-tight">
                          BiePay does not store your secret key. You need this to sweep funds from stealth addresses.
                        </p>
                        <div className="flex gap-2 pt-1">
                          <code className="flex-1 p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-[9px] font-mono text-red-200 break-all">
                            {stealthSecret}
                          </code>
                          <button 
                            onClick={() => { navigator.clipboard.writeText(stealthSecret); onNotify?.("Secret Copied!", "success"); }}
                            className="p-3 bg-red-500/20 border border-red-500/20 rounded-xl hover:bg-red-500/30 transition-colors"
                          >
                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={generateStealthKeys}
                        className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black text-zinc-400 uppercase tracking-widest hover:bg-white/10 transition-all"
                      >
                        Rotate Identity
                      </button>
                      <button 
                        onClick={() => { setStealthViewPubkey(""); setStealthSecret(null); }}
                        className="flex-1 py-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[9px] font-black text-red-400/60 uppercase tracking-widest hover:bg-red-500/10 transition-all"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 bg-zinc-50 rounded-[2.5rem] border border-zinc-100 space-y-4">
              <h4 className="text-zinc-900 text-[10px] font-black uppercase tracking-[0.2em]">Stealth Compliance</h4>
              <p className="text-zinc-500 text-[10px] font-medium leading-relaxed">
                Umbra stealth addresses are derived using ECDH. While the transaction is private on-chain, you are still responsible for maintaining records for tax and legal compliance.
              </p>
            </div>
          </div>
        ) : (
      </div>

      {/* Action Footer */}
      <div className="pt-4 space-y-4">
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="text-xs font-black text-red-900 uppercase tracking-tight">Sync Failure</p>
              <p className="text-[11px] text-red-600 leading-tight font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full py-5 font-black text-xs uppercase tracking-[0.25em] rounded-2xl transition-all duration-500 flex items-center justify-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.15)] ${
            saveStatus === "success" ? "bg-emerald-500 text-white scale-[1.02]" : 
            saveStatus === "error" ? "bg-red-600 text-white animate-shake" : 
            "bg-zinc-950 text-white hover:bg-zinc-800"
          }`}
        >
          {isSaving ? (
            <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saveStatus === "success" ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
          ) : saveStatus === "error" ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          )}
          {isSaving ? "Synchronizing..." : saveStatus === "success" ? "Identity Locked" : saveStatus === "error" ? "Update Blocked" : "Lock In Changes"}
        </button>
      </div>
    </div>
  );
}
