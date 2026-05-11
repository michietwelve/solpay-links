"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Shield, Clock, CheckCircle, RefreshCcw, Loader2, ArrowRight } from "lucide-react";
import Layout from "../../components/layout/Layout";

interface EscrowRecord {
  id: string;
  linkId: string;
  payerWallet: string;
  amountLamports: string;
  token: string;
  escrowStatus: string;
  createdAt: string;
  link: {
    label: string;
  }
}

export default function EscrowPage() {
  const { authenticated, getAccessToken } = usePrivy();
  const [records, setRecords] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchEscrow = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/links/escrow/active`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) {
      console.error("Failed to fetch escrow records", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) fetchEscrow();
  }, [authenticated]);

  const handleAction = async (recordId: string, type: "release" | "refund") => {
    setProcessingId(recordId);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/links/escrow/${type}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ recordId })
      });
      if (res.ok) {
        fetchEscrow(); // refresh
      }
    } catch (e) {
      console.error(`Escrow ${type} failed`, e);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#c5a36e] mb-1">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">BiePay Security</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-900">Escrow Management</h1>
            <p className="text-zinc-500 text-sm font-medium">Verify delivery and release funds from secure multi-sig custody.</p>
          </div>

          <div className="flex gap-4">
            <div className="px-6 py-4 bg-zinc-50 rounded-2xl border border-zinc-100">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Locked Value</p>
              <p className="text-xl font-black text-zinc-900">
                {records.reduce((acc, r) => acc + (parseFloat(r.amountLamports) / 1e9), 0).toFixed(2)} SOL
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-[400px] bg-zinc-50 rounded-[2.5rem] border border-zinc-100 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-zinc-200 animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-20 bg-zinc-50 rounded-[2.5rem] border border-dashed border-zinc-200 text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
              <Shield className="w-8 h-8 text-zinc-200" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black uppercase tracking-tight text-zinc-900">No Active Escrows</h3>
              <p className="text-zinc-500 text-sm max-w-xs mx-auto">When you create links with Escrow enabled, the funds will appear here for settlement.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {records.map((record) => (
              <div key={record.id} className="p-6 bg-white border border-zinc-100 rounded-3xl shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100">
                      <Clock className="w-6 h-6 text-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-zinc-900 uppercase tracking-tight">{record.link.label}</h4>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 uppercase">
                        <span>Payer: {record.payerWallet.slice(0, 4)}...{record.payerWallet.slice(-4)}</span>
                        <span className="w-1 h-1 bg-zinc-200 rounded-full" />
                        <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-sm font-black text-zinc-900">{(parseFloat(record.amountLamports) / 1e9).toFixed(4)} {record.token}</p>
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Locked</p>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAction(record.id, "refund")}
                        disabled={!!processingId}
                        className="px-4 py-2 bg-zinc-50 text-zinc-500 text-[10px] font-black uppercase rounded-xl hover:bg-red-50 hover:text-red-500 transition-all border border-zinc-100"
                      >
                        Refund
                      </button>
                      <button 
                        onClick={() => handleAction(record.id, "release")}
                        disabled={!!processingId}
                        className="px-6 py-2 bg-zinc-900 text-white text-[10px] font-black uppercase rounded-xl hover:bg-zinc-800 transition-all flex items-center gap-2"
                      >
                        {processingId === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 text-emerald-400" />}
                        Release Funds
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-amber-100 w-full opacity-30" />
                <div className="absolute bottom-0 left-0 h-1 bg-amber-500 w-1/3" />
              </div>
            ))}
          </div>
        )}

        <div className="p-8 bg-zinc-950 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Shield className="w-32 h-32 text-white" />
          </div>
          <div className="relative z-10 space-y-4">
            <h3 className="text-white font-black text-lg uppercase tracking-tight">How BiePay Escrow Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <p className="text-[#c5a36e] font-black text-[10px] uppercase tracking-widest">01. Commitment</p>
                <p className="text-zinc-400 text-xs leading-relaxed">Funds are sent to a secure platform-controlled vault upon payment confirmation.</p>
              </div>
              <div className="space-y-2">
                <p className="text-[#c5a36e] font-black text-[10px] uppercase tracking-widest">02. Fulfillment</p>
                <p className="text-zinc-400 text-xs leading-relaxed">Merchant fulfills the order. You can automate this via API once shipping is confirmed.</p>
              </div>
              <div className="space-y-2">
                <p className="text-[#c5a36e] font-black text-[10px] uppercase tracking-widest">03. Settlement</p>
                <p className="text-zinc-400 text-xs leading-relaxed">Merchant releases funds to their own wallet. If a dispute occurs, BiePay provides arbitration.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
