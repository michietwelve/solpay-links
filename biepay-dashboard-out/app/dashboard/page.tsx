"use client";

import { useState, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useLinks, useStats, createLink, deleteLink } from "../../hooks/useLinks";
import { formatAmount, timeAgo, getShareUrls, getEffectiveStatus } from "../../lib/api";
import type { PaymentLink, CreateLinkResponse } from "../../lib/api";
import CreateLinkForm from "../../components/dashboard/CreateLinkForm";
import ShareModal     from "../../components/dashboard/ShareModal";
import SweepModal    from "../../components/dashboard/SweepModal";
import WithdrawModal from "../../components/dashboard/WithdrawModal";
import { AIAssistant } from "../../components/dashboard/AIAssistant";
import { JupiterTerminal, openJupiterSwap } from "../../components/dashboard/JupiterTerminal";
import ProfileMenu    from "../../components/dashboard/ProfileMenu";
import SuccessModal   from "../../components/dashboard/SuccessModal";
import StorefrontSettings from "../../components/dashboard/StorefrontSettings";
import RevenueChart    from "../../components/dashboard/RevenueChart";
import Logo           from "../../components/layout/Logo";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferCheckedInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";

type Modal = "create" | "share" | "withdraw" | "success" | "settings" | "profile" | "sweep" | null;

export default function DashboardPage() {
  const { ready, authenticated, user, login, logout, linkWallet, exportWallet } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { publicKey, disconnect: solanaDisconnect } = useWallet();
  const { wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();

  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isDeleting, setIsDeleting]           = useState(false);
  const [isWithdrawing, setIsWithdrawing]     = useState(false);
  const [isSweeping, setIsSweeping]           = useState(false);
  
  const allAddresses = useMemo(() => {
    const list: { address: string; type: string; label: string }[] = [];
    
    // Always include Embedded first if it exists to ensure stability
    solanaWallets.forEach(w => {
      if (w.walletClientType === 'privy') {
        list.push({ address: w.address, type: 'SOL', label: 'Privy Embedded' });
      }
    });

    privyWallets.forEach(w => {
      const wallet = w as any;
      if (wallet.chainType === 'solana' && wallet.walletClientType !== 'privy') {
        list.push({ 
          address: w.address, 
          type: 'SOL', 
          label: w.meta?.name ?? 'External Solana' 
        });
      }
    });

    if (publicKey) {
      const addr = publicKey.toBase58();
      // Only add if not already in list (some wallets show up in both)
      if (!list.some(l => l.address === addr)) {
        list.push({ address: addr, type: 'SOL', label: 'Phantom/Adapter' });
      }
    }

    // Remove duplicates
    return list.filter((v, i, a) => a.findIndex(t => t.address === v.address) === i);
  }, [publicKey, privyWallets, solanaWallets, user]);

  const activeAddress = useMemo(() => {
    // 1. If user explicitly selected one, keep it
    if (selectedAddress && allAddresses.some(a => a.address === selectedAddress)) {
      return selectedAddress;
    }
    
    // 2. If no selection, prefer Embedded Wallet for stability
    const embedded = allAddresses.find(a => a.label === 'Privy Embedded');
    if (embedded) return embedded.address;

    // 3. Fallback to first SOL wallet
    return allAddresses.find(a => a.type === 'SOL')?.address ?? allAddresses[0]?.address ?? null;
  }, [selectedAddress, allAddresses]);

  // Use the activeAddress for everything
  const address = activeAddress;

  const merchantIds = useMemo(() => {
    const ids = [user?.id];
    allAddresses.forEach(a => ids.push(a.address));
    return ids.filter(Boolean).join(",");
  }, [user?.id, allAddresses]);
  
  const { links = [], isLoading } = useLinks(merchantIds);
  const { stats } = useStats(merchantIds);

  const [modal, setModal]       = useState<Modal>(null);
  const [shareLink, setShareLink] = useState<{ id: string; label: string } | null>(null);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detailLink, setDetailLink] = useState<PaymentLink | null>(null);
  const [withdrawSource, setWithdrawSource] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [successData, setSuccessData] = useState<{ title: string; message: string; txSig?: string } | null>(null);
  const [profile, setProfile] = useState<{ businessName: string | null; logoUrl: string | null; accentColor: string | null; webhookUrl: string | null } | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);

  const filtered = links.filter(l =>
    (l.label.toLowerCase().includes(search.toLowerCase()) || l.id.includes(search)) &&
    (!statusFilter || l.status === statusFilter)
  );

  const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

  // Real-time balance fetching
  const refreshBalance = async () => {
    if (!address || address.startsWith("0x")) return;
    try {
      const connection = new Connection(RPC, "confirmed");
      const bal = await connection.getBalance(new PublicKey(address));
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch (e) {
      console.error("Balance fetch failed:", e);
    }
  };

  useMemo(() => {
    refreshBalance();
  }, [address]);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://biepay-links-production.up.railway.app";

  const fetchProfile = async () => {
    if (!user?.id) return;
    setIsProfileLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/merchants/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (e) {
      console.error("Profile fetch failed:", e);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!merchantIds) return;
    try {
      const res = await fetch(`${API_BASE}/api/analytics/${merchantIds}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.error("Analytics fetch failed:", e);
    }
  };

  useMemo(() => {
    fetchProfile();
    fetchAnalytics();
  }, [user?.id, merchantIds]);

  const handleSaveProfile = async (data: any) => {
    if (!user?.id) return;
    console.log("Saving profile for:", user.id, data);
    try {
      const res = await fetch(`${API_BASE}/api/merchants/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        console.log("Profile saved successfully:", updated);
        setProfile(updated);
      } else {
        const errData = await res.json();
        console.error("Profile save failed:", res.status, errData);
        throw new Error(errData.message || "Save failed");
      }
    } catch (e) {
      console.error("Profile save error:", e);
      throw e;
    }
  };

  function openShare(l: PaymentLink) {
    setShareLink({ id: l.id, label: l.label });
    setModal("share");
  }

  function handleCreated(result: CreateLinkResponse) {
    setModal(null);
    setShareLink({ id: result.link.id, label: result.link.label });
    setModal("share");
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this payment link?")) return;
    setIsDeleting(true);
    try {
      await deleteLink(id);
      setDetailLink(null);
      setSuccessData({
        title: "Link Deleted",
        message: "The payment link has been permanently removed."
      });
      setModal("success");
    } catch (err) {
      setSuccessData({
        title: "Delete Failed",
        message: "We couldn't delete this link. Please try again later."
      });
      setModal("success");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleWithdraw(dest: string) {
    if (!withdrawSource) return;
    
    const sourceAddress = withdrawSource;
    const wallet = solanaWallets.find(w => w.address === sourceAddress);
    if (!wallet) return;

    try {
      const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
      const connection = new Connection(RPC, "confirmed");
      
      const balance = await connection.getBalance(new PublicKey(sourceAddress));
      const fee = 5000; // rough estimate for tx fee
      const amount = balance - fee;

      if (amount <= 0) {
        throw new Error("Insufficient balance to cover fees.");
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(sourceAddress),
          toPubkey: new PublicKey(dest),
          lamports: amount,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(sourceAddress);
      const signedTx = await (wallet as any).signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // Immediate UI update
      setBalance(0); 
      setModal(null);
      setWithdrawSource(null);
      
      setSuccessData({
        title: "Withdrawal Successful!",
        message: `Successfully transferred ${(amount / LAMPORTS_PER_SOL).toFixed(4)} SOL to your destination wallet.`,
        txSig: sig
      });
      setModal("success");

      // Final refresh
      setTimeout(refreshBalance, 2000);
    } catch (err: any) {
      console.error("Withdraw failed:", err);
      throw err; // WithdrawModal will handle the error display
    }
  }

  async function handleSweep() {
    if (!address || !publicKey) {
      alert("Please connect your destination wallet (Phantom) first.");
      return;
    }
    setModal("sweep");
  }

  async function confirmSweep() {
    try {
      const connection = new Connection(RPC, "confirmed");
      const payer = new PublicKey(address);
      const dest = publicKey;
      const tx = new Transaction();
      
      // 1. Sweep SOL (leave 0.002 for rent/fees)
      const bal = await connection.getBalance(payer);
      const leave = 0.002 * LAMPORTS_PER_SOL;
      if (bal > leave) {
        tx.add(SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: dest,
          lamports: bal - leave,
        }));
      }

      // 2. Sweep USDC & USDT
      const mints = {
        USDC: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        USDT: "EJwZwpRvqiS86SAt9ikRWB9S5bwGrnF399qcSip8T6Y3"
      };

      for (const [name, mintStr] of Object.entries(mints)) {
        const mint = new PublicKey(mintStr);
        const sourceAta = getAssociatedTokenAddressSync(mint, payer);
        const destAta = getAssociatedTokenAddressSync(mint, dest);
        
        try {
          const account = await connection.getTokenAccountBalance(sourceAta);
          if (account.value.uiAmount && account.value.uiAmount > 0) {
            tx.add(createTransferCheckedInstruction(
              sourceAta,
              mint,
              destAta,
              payer,
              BigInt(account.value.amount),
              6
            ));
          }
        } catch (e) {
          // ATA likely doesn't exist, skip
        }
      }

      if (tx.instructions.length === 0) {
        alert("No funds found to sweep.");
        setIsSweeping(false);
        return;
      }

      const activeWallet = solanaWallets.find(w => w.address === address);
      if (!activeWallet) throw new Error("Embedded wallet not found.");

      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;

      const signedTx = await activeWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setSuccessData({
        title: "Sweep Complete!",
        message: "All available funds have been moved to your destination wallet.",
        txSig: sig
      });
      setModal("success");
      setTimeout(refreshBalance, 2000);
    } catch (err: any) {
      console.error("Sweep failed:", err);
      alert("Sweep failed: " + (err.message || "Unknown error"));
    } finally {
      setIsSweeping(false);
      setModal(null);
    }
  }

  async function handleExportWallet() {
    try {
      await exportWallet();
    } catch (err) {
      console.error("Export failed:", err);
    }
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
        <div className="text-center space-y-6">
          <Logo className="w-16 h-16 mx-auto shadow-xl" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">BiePay Links</h1>
            <p className="text-sm text-zinc-500">Log in to manage your merchant links</p>
          </div>
          <button
            onClick={login}
            className="px-10 py-3 bg-zinc-900 text-white rounded-2xl font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
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
          <Logo className="w-7 h-7" variant="gold" />
          <span className="font-bold text-sm tracking-tight">BiePay Links</span>
          <span className="text-[10px] bg-zinc-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">beta</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            {allAddresses.length > 0 && (
              <select 
                value={address ?? ''} 
                onChange={(e) => setSelectedAddress(e.target.value)}
                className="text-[11px] font-mono bg-zinc-100 border border-zinc-200 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-zinc-400 transition-all cursor-pointer"
              >
                {allAddresses.map((a) => (
                  <option key={a.address} value={a.address}>
                    ({a.type}) {a.label}: {a.address.slice(0, 4)}...{a.address.slice(-4)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <ProfileMenu 
            onSettingsClick={() => setModal("settings")}
            onProfileClick={() => setModal("profile")}
          />
          <button
            onClick={() => setModal("create")}
            disabled={!address || address.startsWith("0x")}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 text-white text-sm rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Native Solana Wallet Section */}
        <div className="mb-8 p-6 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-between shadow-xl shadow-zinc-200">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 20c4.478 0 8.268-2.943 9.543-7a9.97 9.97 0 000-6C20.268 2.943 16.478 0 12 0c-4.478 0-8.268 2.943-9.543 7a9.97 9.97 0 00.01 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold">Wallet Management</h3>
              <p className="text-zinc-400 text-sm">Manage your external and embedded Solana wallets.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Show Privy Embedded Status */}
            {(() => {
              const privySol = allAddresses.find(a => a.label === 'Privy Embedded' && a.type === 'SOL');
              if (privySol) {
                return (
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl flex flex-col gap-0.5">
                      <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Privy Embedded</span>
                      <span className="text-xs text-white font-mono">{privySol.address.slice(0,4)}...{privySol.address.slice(-4)}</span>
                    </div>
                    <button
                      onClick={() => {
                        setWithdrawSource(privySol.address);
                        setModal("withdraw");
                      }}
                      disabled={isWithdrawing}
                      className="px-4 py-2 bg-white text-zinc-900 border border-zinc-200 rounded-xl text-xs font-medium hover:bg-zinc-50 transition-all flex items-center gap-2"
                    >
                      {isWithdrawing ? (
                        <div className="w-3 h-3 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                      Withdraw
                    </button>
                    <button
                      onClick={handleSweep}
                      disabled={isSweeping || !publicKey}
                      className="px-4 py-2 bg-zinc-900 text-[#c5a36e] border border-zinc-800 rounded-xl text-xs font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 group"
                      title={!publicKey ? "Connect Phantom to sweep" : "Sweep all tokens to cold storage"}
                    >
                      {isSweeping ? (
                        <div className="w-3 h-3 border-2 border-[#c5a36e]/30 border-t-[#c5a36e] rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                      Sweep to Cold Storage
                    </button>
                    <button
                      onClick={openJupiterSwap}
                      className="px-4 py-2 bg-gradient-to-r from-[#c5a36e]/20 to-[#c5a36e]/10 text-[#c5a36e] border border-[#c5a36e]/30 rounded-xl text-xs font-bold hover:from-[#c5a36e]/30 hover:to-[#c5a36e]/20 hover:shadow-[0_0_20px_rgba(197,163,110,0.25)] hover:border-[#c5a36e]/50 transition-all duration-200 flex items-center gap-2 group"
                      title="Swap your earnings to any token via Jupiter best-price routing"
                    >
                      <svg className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L13 16M17 20L21 16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Swap Earnings
                    </button>
                  </div>
                );
              }
              return (
                <button
                  onClick={() => {
                    console.log("Creating Solana wallet...");
                    if (!createSolanaWallet) {
                      console.error("createSolanaWallet function is missing. Is Privy configured for Solana?");
                      alert("Privy is not ready. Please refresh.");
                      return;
                    }
                    createSolanaWallet()
                      .then(w => console.log("Wallet created:", w))
                      .catch(e => {
                        console.error("Wallet creation failed:", e);
                        // If it failed because it exists, we'll just refresh
                        if (String(e).includes("already has an embedded wallet")) {
                          window.location.reload();
                        } else {
                          alert("Wallet creation failed. Check browser console for details.");
                        }
                      });
                  }}
                  className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium hover:bg-emerald-500/20 transition-all"
                >
                  Generate Embedded Wallet
                </button>
              );
            })()}
            
            <div className="custom-wallet-button">
              <WalletMultiButton />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { 
              label: "Available balance", 
              value: balance !== null ? `${balance.toFixed(4)} SOL` : "—", 
              delta: "Withdraw anytime", 
              up: true,
              highlight: true 
            },
            { label: "Lifetime volume", value: `$${stats.totalVolume.toFixed(2)}`, delta: "gross revenue", up: true },
            { label: "Payments received", value: String(stats.totalPayments), delta: "all time", up: true },
            { label: "Active links", value: String(stats.activeLinks), delta: "across all tokens", up: true },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl p-5 ${(s as any).highlight ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200"}`}>
              <p className={`text-xs font-medium mb-2 ${(s as any).highlight ? "text-zinc-400" : "text-zinc-400"}`}>{s.label}</p>
              <p className="text-2xl font-bold tracking-tight">{s.value}</p>
              <p className={`text-xs mt-1.5 ${s.up ? ((s as any).highlight ? "text-[#c5a36e]" : "text-emerald-600") : "text-zinc-400"}`}>{s.delta}</p>
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
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusPill(getEffectiveStatus(l))}`}>
                        {getEffectiveStatus(l)}
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
              
              <div className="pt-4 border-t border-zinc-100">
                <button
                  onClick={() => handleDelete(detailLink.id)}
                  disabled={isDeleting}
                  className="w-full py-2.5 text-sm bg-white text-red-600 border border-red-100 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  Delete Link
                </button>
                <p className="text-[10px] text-zinc-400 text-center mt-3 leading-relaxed">
                  Permanently remove this link and all its payment history from your dashboard.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
      {/* Withdraw modal */}
      {modal === "withdraw" && withdrawSource && (
        <WithdrawModal
          sourceAddress={withdrawSource}
          suggestedDest={publicKey?.toBase58()}
          balance={balance}
          onConfirm={handleWithdraw}
          onClose={() => {
            setModal(null);
            setWithdrawSource(null);
          }}
        />
      )}
      {/* Success modal */}
      {modal === "success" && successData && (
        <SuccessModal
          title={successData.title}
          message={successData.message}
          txSig={successData.txSig}
          onClose={() => {
            setModal(null);
            setSuccessData(null);
          }}
        />
      )}

      {/* Sweep Modal */}
      {modal === "sweep" && address && publicKey && (
        <SweepModal
          address={address}
          destination={publicKey.toBase58()}
          isSweeping={isSweeping}
          onConfirm={confirmSweep}
          onClose={() => setModal(null)}
        />
      )}

      {/* Settings Panel */}
      {modal === "settings" && (
        <div className="fixed inset-0 z-[60] flex justify-end animate-in fade-in duration-300 bg-black/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md bg-white h-full shadow-2xl animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Settings</h2>
                <button onClick={() => setModal(null)} className="text-3xl text-zinc-400 hover:text-zinc-900">×</button>
              </div>
              
              {isProfileLoading ? (
                <div className="py-20 text-center text-zinc-400">Loading storefront settings...</div>
              ) : profile ? (
                <StorefrontSettings 
                  profile={profile} 
                  onSave={handleSaveProfile} 
                  onExport={handleExportWallet}
                />
              ) : null}

            </div>
          </div>
        </div>
      )}

      {/* Profile Panel */}
      {modal === "profile" && (
        <div className="fixed inset-0 z-[60] flex justify-end animate-in fade-in duration-300 bg-black/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-md bg-white h-full shadow-2xl animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
            <div className="p-0 overflow-y-auto h-full flex flex-col">
              <div className="h-48 bg-zinc-900 relative">
                <button onClick={() => setModal(null)} className="absolute right-6 top-6 text-white/50 hover:text-white text-3xl">×</button>
                <div className="absolute -bottom-10 left-8 w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border-4 border-white">
                  <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center text-2xl font-bold uppercase">
                    {user?.email?.address?.[0] ?? "B"}
                  </div>
                </div>
              </div>
              <div className="p-8 pt-16 space-y-8 flex-1">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900">{user?.email?.address?.split('@')[0] ?? "Merchant"}</h2>
                  <p className="text-zinc-500 text-sm mt-1">Solana Merchant since April 2024</p>
                </div>

                <div className="space-y-4 pt-4">
                  <button onClick={() => setModal("settings")} className="w-full p-4 bg-zinc-50 rounded-2xl text-sm font-medium flex items-center justify-between hover:bg-zinc-100 transition-all">
                    <span>Manage Branding</span>
                    <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button className="w-full p-4 bg-zinc-50 rounded-2xl text-sm font-medium flex items-center justify-between hover:bg-zinc-100 transition-all">
                    <span>Support Center</span>
                    <svg className="w-4 h-4 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={logout} className="w-full p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-red-100 transition-all">
                    <span>Log Out</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </button>
                </div>

                <div className="mt-auto flex gap-4 py-8 text-[10px] text-zinc-400 font-bold uppercase tracking-widest justify-center">
                  <a href="/legal/terms" className="hover:text-zinc-900">Terms</a>
                  <span>•</span>
                  <a href="/legal/privacy" className="hover:text-zinc-900">Privacy</a>
                  <span>•</span>
                  <a href="#" className="hover:text-zinc-900">v1.2.0</a>
                </div>
              </div>
              <div className="p-8 bg-zinc-50 border-t border-zinc-100">
                <button className="w-full py-4 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200">Update Profile</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <AIAssistant />
      <JupiterTerminal />
    </div>
  );
}
