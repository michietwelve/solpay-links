"use client";

import { useState, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useLinks, useStats, createLink } from "../../hooks/useLinks";
import { formatAmount, timeAgo, getShareUrls } from "../../lib/api";
import type { PaymentLink, CreateLinkResponse } from "../../lib/api";
import CreateLinkForm from "../../components/dashboard/CreateLinkForm";
import ShareModal     from "../../components/dashboard/ShareModal";

type Modal = "create" | "share" | null;

export default function DashboardPage() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  
  const address = useMemo(() => {
    // Find the first Solana wallet in the list
    const solWallet = wallets.find(w => (w as any).chainType === 'solana');
    return solWallet?.address || user?.wallet?.address;
  }, [wallets, user]);

  const { links, isLoading } = useLinks(address);
  const { stats } = useStats(address);

  const [modal, setModal]       = useState<Modal>(null);
  const [shareLink, setShareLink] = useState<{ id: string; label: string } | null>(null);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detailLink, setDetailLink] = useState<PaymentLink | null>(null);

  const filtered = links.filter(l =>
    (l.label.toLowerCase().includes(search.toLowerCase()) || l.id.includes(search)) &&
    (!statusFilter || l.status === statusFilter)
  );

  function openShare(l: PaymentLink) {
    setShareLink({ id: l.id, label: l.label });
    setModal("share");
  }

  function handleCreated(result: CreateLinkResponse) {
    setModal(null);
    setShareLink({ id: result.link.id, label: result.link.label });
    setModal("share");
  }

  const statusPill = (s: PaymentLink["status"]) => {
    const map: Record<string, string> = {
      active:    "bg-emerald-50 text-emerald-800",
      completed: "bg-purple-50 text-purple-800",
      expired:   "bg-zinc-100 text-zinc-500",
      cancelled: "bg-red-50 text-red-700",
    };
    return map[s] ?? map.expired;
  };

  if (!ready) return null;

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-zinc-900 rounded-xl mx-auto flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V9" />
            </svg>
          </div>
          <h1 className="text-xl font-medium">SolPay Links</h1>
          <p className="text-sm text-zinc-500">Log in to manage your merchant links</p>
          <button
            onClick={login}
            className="px-8 py-2.5 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Topbar */}
      <header className="bg-white border-b border-zinc-200 px-6 h-14 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 16 16">
              <path d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z" fill="none" stroke="white" strokeWidth="1.5"/>
              <circle cx="8" cy="8" r="2" fill="white"/>
            </svg>
          </div>
          <span className="font-medium text-sm">SolPay Links</span>
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">beta</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
          <button
            onClick={logout}
            className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            Logout
          </button>
          <button
            onClick={() => setModal("create")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 text-white text-sm rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 16 16">
              <line x1="8" y1="2" x2="8" y2="14" strokeWidth="1.5"/>
              <line x1="2" y1="8" x2="14" y2="8" strokeWidth="1.5"/>
            </svg>
            New link
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total volume", value: `$${stats.totalVolume.toFixed(2)}`, delta: "↑ 23% this week", up: true },
            { label: "Payments received", value: String(stats.totalPayments), delta: "all time", up: true },
            { label: "Active links", value: String(stats.activeLinks), delta: "across all tokens", up: true },
            { label: "Platform fees", value: `$${stats.platformFees.toFixed(2)}`, delta: "0.5% rate", up: false },
          ].map(s => (
            <div key={s.label} className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-xs text-zinc-400 font-medium mb-2">{s.label}</p>
              <p className="text-2xl font-medium tracking-tight">{s.value}</p>
              <p className={`text-xs mt-1.5 ${s.up ? "text-emerald-600" : "text-zinc-400"}`}>{s.delta}</p>
            </div>
          ))}
        </div>

        {/* Links table */}
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-medium">Payment links</h2>
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                  <circle cx="7" cy="7" r="5" strokeWidth="1.5"/><line x1="11" y1="11" x2="14" y2="14" strokeWidth="1.5"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search links…"
                  className="text-xs bg-transparent outline-none w-36 text-zinc-700 placeholder:text-zinc-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-white outline-none text-zinc-600"
              >
                <option value="">All status</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-zinc-400">Loading links…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-400 mb-3">No payment links yet</p>
              <button
                onClick={() => setModal("create")}
                className="text-sm text-zinc-900 underline underline-offset-2"
              >
                Create your first link
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  {["Link", "Token", "Amount", "Payments", "Status", "Created", ""].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-zinc-400 px-5 py-3 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr
                    key={l.id}
                    onClick={() => setDetailLink(l)}
                    className="border-b border-zinc-100 last:border-none hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium">{l.label}</p>
                      <p className="text-xs font-mono text-zinc-400 mt-0.5">{l.id}</p>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-zinc-600">{l.token}</td>
                    <td className="px-5 py-3.5 text-sm font-mono">{formatAmount(l.amountLamports, l.token)}</td>
                    <td className="px-5 py-3.5 text-sm font-mono text-zinc-600">
                      {l.paymentCount}{l.maxPayments !== null ? `/${l.maxPayments}` : ""}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusPill(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-zinc-400">{timeAgo(l.createdAt)}</td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      {l.status === "active" && (
                        <button
                          onClick={() => openShare(l)}
                          className="text-xs px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                        >
                          Share
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </main>

      {/* Create modal */}
      {modal === "create" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-[500px] max-w-[90vw] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
              <h2 className="text-sm font-medium">New payment link</h2>
              <button onClick={() => setModal(null)} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5">
              <CreateLinkForm onSuccess={handleCreated} onCancel={() => setModal(null)} />
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {modal === "share" && shareLink && (
        <ShareModal linkId={shareLink.id} label={shareLink.label} onClose={() => setModal(null)} />
      )}

      {/* Detail slide-over */}
      {detailLink && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDetailLink(null)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-white border-l border-zinc-200 overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 sticky top-0 bg-white">
              <span className="text-sm font-medium">Link details</span>
              <button onClick={() => setDetailLink(null)} className="text-zinc-400 hover:text-zinc-600 text-xl">×</button>
            </div>
            <div className="px-5 py-5 space-y-5">
              <div>
                <p className="text-base font-medium">{detailLink.label}</p>
                <p className="text-xs font-mono text-zinc-400 mt-1">{detailLink.id}</p>
                <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mt-2 ${statusPill(detailLink.status)}`}>
                  {detailLink.status}
                </span>
              </div>
              <div className="space-y-0">
                {[
                  ["Token", detailLink.token],
                  ["Amount", formatAmount(detailLink.amountLamports, detailLink.token)],
                  ["Payments", `${detailLink.paymentCount}${detailLink.maxPayments !== null ? ` / ${detailLink.maxPayments}` : ""}`],
                  ["Memo", detailLink.memo ?? "—"],
                  ["Expires", detailLink.expiresAt ? new Date(detailLink.expiresAt).toLocaleDateString() : "Never"],
                  ["Created", new Date(detailLink.createdAt).toLocaleDateString()],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between items-center py-3 border-b border-zinc-100 last:border-none">
                    <span className="text-xs text-zinc-400">{k}</span>
                    <span className="text-sm font-medium font-mono">{v}</span>
                  </div>
                ))}
              </div>
              {detailLink.status === "active" && (
                <button
                  onClick={() => { openShare(detailLink); setDetailLink(null); }}
                  className="w-full py-2.5 text-sm bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors"
                >
                  Share this link
                </button>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
