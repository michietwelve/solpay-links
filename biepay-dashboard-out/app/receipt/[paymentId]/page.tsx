"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Logo from "../../../components/layout/Logo";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import bs58 from "bs58";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://biepay-links-production.up.railway.app";

export default function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const [payment, setPayment] = useState<any>(null);
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);

  const { authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const allWallets = [...wallets, ...solanaWallets];

  useEffect(() => {
    if (!paymentId) return;
    fetch(`${API_BASE}/api/payments/${paymentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPayment(data.payment);
        setLink(data.link);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [paymentId]);

  const handleClaim = async () => {
    if (!authenticated) return login();
    
    setIsSigning(true);
    try {
      const addr = payment.payerWallet;
      const activeWallet = allWallets.find(w => w.address === addr);
      
      if (!activeWallet) {
        throw new Error(`Please connect the wallet used for payment: ${addr.slice(0,6)}...`);
      }

      const message = `BiePay Fulfillment: ${link.id}`;
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await (activeWallet as any).signMessage(encodedMessage);
      const signatureBase58 = bs58.encode(signature);

      const res = await fetch(`${API_BASE}/api/fulfillment/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId: link.id,
          publicKey: addr,
          signature: signatureBase58
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      setAssetUrl(result.assetUrl);
      window.open(result.assetUrl, "_blank");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSigning(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !payment) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-black text-zinc-900 uppercase">Receipt Not Found</h1>
        <p className="text-sm text-zinc-500">{error || "This payment record does not exist or is still pending."}</p>
        <a href="/" className="inline-block text-xs font-bold underline">Return Home</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 py-20 px-6">
      <div className="max-w-xl mx-auto bg-white rounded-[2.5rem] border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="p-10 text-center border-b border-zinc-50">
          <Logo className="w-12 h-12 mx-auto mb-6" variant="gold" />
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight uppercase">Payment Receipt</h1>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mt-2">ID: {payment.id}</p>
        </div>

        <div className="p-10 space-y-8">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Amount Paid</p>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tighter">{payment.amountHuman} {payment.token}</h2>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Status</p>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase">Confirmed</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-zinc-100">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Merchant</p>
              <p className="text-xs font-bold text-zinc-900">{link.label}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Date</p>
              <p className="text-xs font-bold text-zinc-900">{new Date(payment.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          {link.digitalAssetUrl && (
            <div className="pt-8 space-y-4">
              <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100 space-y-3">
                <h3 className="text-[10px] font-black text-zinc-900 uppercase tracking-widest">Digital Content Included</h3>
                <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                  Your purchase includes access to a digital asset. Verify your wallet ownership to unlock the download link.
                </p>
                {assetUrl ? (
                  <a 
                    href={assetUrl} 
                    target="_blank"
                    className="w-full py-4 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
                  >
                    Download Asset
                  </a>
                ) : (
                  <button 
                    onClick={handleClaim}
                    disabled={isSigning}
                    className="w-full py-4 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500 transition-colors disabled:opacity-50"
                  >
                    {isSigning ? "Verifying..." : "Unlock Content"}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="pt-8 flex flex-col gap-3">
            <a 
              href={`https://explorer.solana.com/tx/${payment.signature}${process.env.NEXT_PUBLIC_NETWORK !== "mainnet-beta" ? "?cluster=devnet" : ""}`}
              target="_blank"
              className="text-center py-4 bg-zinc-50 text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-100 transition-colors"
            >
              View On-Chain Transaction
            </a>
          </div>
        </div>

        <div className="px-10 pb-10 text-center">
          <p className="text-[9px] text-zinc-300 font-bold uppercase tracking-widest">
            BiePay Protocol • Institutional Social Commerce
          </p>
        </div>
      </div>
    </div>
  );
}
