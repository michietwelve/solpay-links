"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { CheckCircle2, Download, Shield, Loader2, ExternalLink } from "lucide-react";
import Logo from "../../../components/layout/Logo";
import bs58 from "bs58";

export default function ClaimPage() {
  const { linkId } = useParams();
  const { login, authenticated, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!authenticated) {
      login();
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      setError("No Solana wallet found. Please connect your wallet.");
      return;
    }

    setStatus("verifying");
    setError(null);

    try {
      // 1. Sign the ownership proof
      const message = `BiePay Fulfillment: ${linkId}`;
      const signature = await wallet.signMessage(message);
      const signatureBase58 = bs58.encode(signature);

      // 2. Verify with the backend
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/fulfillment/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          publicKey: wallet.address,
          signature: signatureBase58
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAssetUrl(data.assetUrl);
        setStatus("success");
      } else {
        setError(data.message || "Failed to verify payment ownership.");
        setStatus("error");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during verification.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-white flex flex-col items-center justify-center p-6 selection:bg-[#c5a36e]/30">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#c5a36e]/5 blur-[120px] rounded-full -z-10" />
      
      <div className="max-w-md w-full space-y-12 text-center">
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-700">
          <Logo variant="gold" className="w-16 h-16 shadow-2xl shadow-[#c5a36e]/20" />
          <h1 className="text-3xl font-black uppercase tracking-tighter">BiePay Fulfillment</h1>
          <p className="text-zinc-500 text-sm font-medium">Verify your payment to unlock your digital assets.</p>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl backdrop-blur-xl space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#c5a36e]/40 to-transparent" />
          
          {status === "success" ? (
            <div className="space-y-6 animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase tracking-tight">Access Granted</h3>
                <p className="text-zinc-400 text-sm">Your payment has been verified. You can now access your digital content.</p>
              </div>
              <a 
                href={assetUrl!} 
                target="_blank"
                className="flex items-center justify-center gap-3 w-full py-5 bg-[#c5a36e] text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-[#d4b98c] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-[#c5a36e]/20"
              >
                <Download className="w-4 h-4" />
                Download Asset
              </a>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4 text-left">
                  <div className="w-10 h-10 bg-[#c5a36e]/10 rounded-xl flex items-center justify-center border border-[#c5a36e]/20">
                    <Shield className="w-5 h-5 text-[#c5a36e]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Secure Protocol</p>
                    <p className="text-xs font-bold text-zinc-300">Sign a message to prove ownership.</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 font-bold animate-shake">
                  {error}
                </div>
              )}

              <button
                onClick={handleClaim}
                disabled={status === "verifying"}
                className="group relative w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-[#c5a36e] transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-2xl shadow-white/5 overflow-hidden"
              >
                <div className="relative z-10 flex items-center justify-center gap-3">
                  {status === "verifying" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying Proof...
                    </>
                  ) : (
                    <>
                      Unlock Digital Asset
                      <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </>
                  )}
                </div>
                {status === "verifying" && (
                  <div className="absolute inset-0 bg-zinc-100 animate-pulse" />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-8 text-[10px] font-black uppercase tracking-widest text-zinc-600">
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Authenticated
          </span>
          <span className="flex items-center gap-2">
            <Shield className="w-3 h-3" />
            End-to-End Encrypted
          </span>
        </div>
      </div>
    </div>
  );
}
