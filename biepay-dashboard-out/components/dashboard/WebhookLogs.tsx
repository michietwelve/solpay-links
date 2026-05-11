"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";

interface WebhookLog {
  id: string;
  url: string;
  event: string;
  status: number;
  success: boolean;
  createdAt: string;
  payload: string;
}

export default function WebhookLogs() {
  const { user } = usePrivy();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://biepay-links-production.up.railway.app"}/api/merchants/${user.id}/webhook-logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (err) {
        console.error("Failed to fetch webhook logs", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-20 bg-zinc-50 rounded-[2rem] border border-zinc-100">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-zinc-100">
          <svg className="w-8 h-8 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm font-black text-zinc-400 uppercase tracking-widest">No webhook activity yet</p>
        <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px] mx-auto leading-relaxed">Incoming payments will trigger notifications to your configured endpoint.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2 mb-2">
        <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Live Delivery Stream</h4>
        <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
          <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
          Monitoring
        </span>
      </div>

      <div className="space-y-3">
        {logs.map((log) => (
          <div 
            key={log.id}
            className={`group bg-white border ${log.success ? 'border-zinc-100' : 'border-red-100'} rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg`}
          >
            <div 
              className="p-4 flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 ${log.success ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'} rounded-xl flex items-center justify-center shrink-0 border ${log.success ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                  {log.success ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-zinc-900 uppercase tracking-tight">{log.event}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${log.success ? 'bg-zinc-100 text-zinc-500' : 'bg-red-500 text-white'}`}>
                      {log.status === 0 ? "TIMEOUT" : log.status}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate max-w-[200px]">{log.url}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-zinc-900">
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="text-[9px] font-medium text-zinc-400">
                  {new Date(log.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {expandedId === log.id && (
              <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
                <div className="p-4 bg-zinc-950 rounded-xl space-y-3 border border-white/5 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Payload</span>
                    <button 
                      onClick={() => navigator.clipboard.writeText(log.payload)}
                      className="text-[9px] font-bold text-zinc-400 hover:text-white uppercase underline"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono text-emerald-400/80 overflow-x-auto leading-relaxed">
                    {JSON.stringify(JSON.parse(log.payload), null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
