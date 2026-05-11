"use client";

import React, { useState, useRef } from "react";
import nacl from "tweetnacl";
import bs58 from "bs58";
import WebhookLogs from "./WebhookLogs";

interface MerchantProfile {
  businessName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  snsDomain?: string | null;
  stealthViewPubkey?: string | null;
  isPro?: boolean;
  merkleTree?: string | null;
  collectionMint?: string | null;
  network?: string;
}

interface StorefrontSettingsProps {
  profile: MerchantProfile;
  onSave: (data: Partial<MerchantProfile>) => Promise<void>;
  onExport: () => void;
  onNotify?: (msg: string, type?: "success" | "info" | "error") => void;
  onDelete?: () => void;
  getAccessToken: () => Promise<string | null>;
  walletAddress: string | null;
}

export default function StorefrontSettings({ profile, onSave, onExport, onNotify, onDelete, getAccessToken, walletAddress }: StorefrontSettingsProps) {
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
  const [network, setNetwork] = useState((profile as any).network ?? "devnet");
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
        network: network,
      } as any);
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

  const [scanResults, setScanResults] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const runScan = async () => {
    if (!stealthSecret) return onNotify?.("Enter or generate a secret key first.", "error");
    setIsScanning(true);
    onNotify?.("Scanning for stealth funds...", "info");
    try {
      const token = await getAccessToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/stealth/scan`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ stealthSecret })
      });
      if (res.ok) {
        const findings = await res.json();
        setScanResults(findings);
        onNotify?.(`Found ${findings.length} active stealth balances.`, "success");
      } else {
        throw new Error("Scan failed");
      }
    } catch (e) {
      onNotify?.("Scan service unavailable.", "error");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSweep = async (linkId: string) => {
    if (!stealthSecret || !walletAddress) return;
    onNotify?.("Sweeping funds to main wallet...", "info");
    try {
      const token = await getAccessToken();
      
      // Get the ephemeral pubkey for this link
      const linksRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/links/merchant/${profile.businessName}`, {
         headers: { "Authorization": `Bearer ${token}` }
      });
      // Simplified: in a real app, scanResults would include the ephemeralPubkey
      // For now, we assume the API handles it or we find it in the link data
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/stealth/sweep`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          stealthSecret, 
          ephemeralPubkey: scanResults.find(r => r.linkId === linkId)?.address, // Placeholder logic
          destination: walletAddress 
        })
      });
      if (res.ok) {
        onNotify?.("Funds successfully recovered!", "success");
        runScan(); // refresh
      } else {
        const err = await res.json();
        onNotify?.(err.message || "Sweep failed.", "error");
      }
    } catch (e) {
      onNotify?.("Network error during recovery.", "error");
    }
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
                  <div className="h-11 w-full rounded-xl flex items-center justify-center text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-lg" style={{ backgroundColor: accentColor || '#18181b' }}>
                    Pay with Solana
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Live Blink Preview</span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Brand Identity</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-white border border-zinc-200 rounded-[2rem] shadow-sm">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-4 block">Storefront Name</label>
                    <input 
                      placeholder="e.g. Acme Store"
                      className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-bold outline-none"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>

                  <div className="p-6 bg-white border border-zinc-200 rounded-[2rem] shadow-sm">
                    <label className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-4 block">Storefront Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-zinc-50 rounded-2xl border border-zinc-200 flex items-center justify-center overflow-hidden">
                        {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <div className="text-zinc-300">LOGO</div>}
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                      <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 px-4 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Upload</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Network</h4>
                <div className="grid grid-cols-2 gap-4">
                  {["devnet", "mainnet"].map((net) => (
                    <button 
                      key={net}
                      onClick={() => setNetwork(net)}
                      className={`p-4 rounded-2xl border-2 uppercase text-[10px] font-black tracking-widest transition-all ${network === net ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-100 text-zinc-400"}`}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === "security" ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 bg-zinc-950 rounded-[2.5rem] border border-white/5 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-zinc-800 to-transparent"></div>
              
              <div className="space-y-2">
                <h3 className="text-white text-lg font-black tracking-tight">Enterprise Infrastructure</h3>
                <p className="text-zinc-500 text-xs leading-relaxed max-w-sm">
                  Configure high-throughput webhooks and generate API keys for headless commerce.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Webhook API Endpoint</label>
                    <button 
                      onClick={async () => {
                        if (!webhookUrl) return onNotify?.("Enter a URL first.", "error");
                        try {
                          const token = await getAccessToken();
                          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/merchants/test-webhook`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify({ url: webhookUrl })
                          });
                          if (res.ok) onNotify?.("Test webhook sent!", "success");
                          else onNotify?.("Webhook error.", "error");
                        } catch (e) { onNotify?.("Fetch failed.", "error"); }
                      }}
                      className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[8px] font-black uppercase rounded"
                    >
                      Test
                    </button>
                  </div>
                  <input 
                    placeholder="https://api.yourstore.com/webhooks"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    className="w-full p-5 bg-zinc-900/50 border border-zinc-800 text-white rounded-2xl text-sm font-mono outline-none"
                  />
                  <WebhookLogs />
                </div>

                <div className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Management API Key</label>
                    <button 
                      onClick={generateApiKey}
                      disabled={isGeneratingKey}
                      className="text-[9px] font-black text-[#c5a36e] uppercase tracking-widest flex items-center gap-2"
                    >
                      {isGeneratingKey ? <div className="w-3 h-3 border-2 border-[#c5a36e] border-t-transparent rounded-full animate-spin" /> : null}
                      {apiKey ? "Regenerate" : "Generate Key"}
                    </button>
                  </div>
                  {apiKey ? (
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                      <code className="flex-1 text-xs font-mono text-zinc-400 truncate">
                        {apiKey}
                      </code>
                      <button 
                        onClick={() => { navigator.clipboard.writeText(apiKey); onNotify?.("API Key Copied", "success"); }}
                        className="text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center">
                      <p className="text-[10px] text-zinc-500 font-medium">Generate an API key to access BiePay programmatically.</p>
                    </div>
                  )}
                </div>
                
                <div className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Institutional Security</h4>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-black rounded border border-emerald-500/30 uppercase tracking-widest">Self-Custody</span>
                  </div>
                  
                  <div className="p-6 bg-zinc-900 rounded-3xl border border-white/5 space-y-4">
                    <p className="text-zinc-500 text-[10px] font-medium leading-relaxed">
                      Your embedded wallet is secured by Privy. You can export your private key at any time to import it into Phantom or Solflare.
                    </p>
                    <button 
                      onClick={onExport}
                      className="w-full py-4 bg-white/5 border border-white/10 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 group"
                    >
                      <svg className="w-4 h-4 text-[#c5a36e] group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      Export Private Key
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 bg-purple-950/10 rounded-[2.5rem] border border-purple-500/10 space-y-8 shadow-2xl relative overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-purple-300 text-lg font-black tracking-tight uppercase tracking-widest">Umbra Protocol</h3>
                  <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-black rounded border border-purple-500/30 uppercase tracking-widest">Privacy Engine</span>
                </div>
              </div>

              <div className="space-y-6">
                {!stealthViewPubkey ? (
                  <button onClick={generateStealthKeys} className="w-full py-4 bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">Initialize Stealth Identity</button>
                ) : (
                  <div className="space-y-6">
                    <div className="p-6 bg-red-500/10 rounded-3xl border border-red-500/20 space-y-3">
                      <label className="text-[9px] font-black text-red-400 uppercase tracking-[0.2em]">Private Secret Key</label>
                      <input 
                        type="password"
                        placeholder="Paste your stealth secret key here to scan/sweep"
                        className="w-full p-4 bg-black/40 border border-red-500/20 rounded-xl text-xs font-mono text-red-200 outline-none"
                        value={stealthSecret || ""}
                        onChange={(e) => setStealthSecret(e.target.value)}
                      />
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Stealth Discovery</label>
                        <button onClick={runScan} disabled={isScanning} className="text-[9px] font-black text-purple-400 uppercase tracking-widest">
                          {isScanning ? "Scanning..." : "Run Scan"}
                        </button>
                      </div>
                      
                      {scanResults.length > 0 ? (
                        <div className="space-y-3">
                          {scanResults.map((res, i) => (
                            <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                              <div className="text-[10px] font-black text-zinc-300 uppercase">{res.label} ({res.balance.toFixed(4)} SOL)</div>
                              <button onClick={() => handleSweep(res.linkId)} className="px-3 py-1.5 bg-purple-500 text-white text-[9px] font-black uppercase rounded-lg">Sweep</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center">
                          <p className="text-[10px] text-zinc-500 font-medium">No active stealth balances found.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
