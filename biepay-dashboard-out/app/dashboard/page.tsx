"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useLinks, useStats, useAllPayments, useAnalytics, createLink, deleteLink, triggerSync } from "../../hooks/useLinks";
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
import ConfirmModal    from "../../components/dashboard/ConfirmModal";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferCheckedInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";

type Modal = "create" | "share" | "withdraw" | "success" | "settings" | "profile" | "sweep" | "debug" | null;

export default function DashboardPage() {
  const { ready, authenticated, user, login, logout, linkWallet, exportWallet, getAccessToken } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { publicKey, disconnect: solanaDisconnect } = useWallet();
  const { wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();

  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [isDeleting, setIsDeleting]           = useState(false);
  const [isWithdrawing, setIsWithdrawing]     = useState(false);
  const [isSweeping, setIsSweeping]           = useState(false);
  const [isIncognito, setIsIncognito]         = useState(false);
  
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
  const [toast, setToast]       = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "info" | "error" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  const [shareLink, setShareLink] = useState<{ id: string; label: string } | null>(null);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detailLink, setDetailLink] = useState<PaymentLink | null>(null);
  const [withdrawSource, setWithdrawSource] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [successData, setSuccessData] = useState<{ title: string; message: string; txSig?: string; isError?: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<"links" | "transactions">("links");
  const { payments = [], isLoading: isPaymentsLoading, mutate: mutatePayments } = useAllPayments();
  const { analytics = [], isLoading: isAnalyticsLoading } = useAnalytics(merchantIds);

  const unlinkedWallets = useMemo(() => {
    if (!user) return [];
    const linkedAddresses = user.linkedAccounts
      .filter((a: any) => a.type === 'wallet')
      .map((a: any) => a.address);
    
    // We only care about external wallets (not 'privy' embedded ones as they are always linked)
    return solanaWallets.filter(w => w.walletClientType !== 'privy' && !linkedAddresses.includes(w.address));
  }, [user, solanaWallets]);
  
  // Real-time Payment Notification Hook
  const previousPaymentCount = useRef(payments.length);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    if (isPaymentsLoading) return;
    
    // On the first successful fetch, just record the baseline
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      previousPaymentCount.current = payments.length;
      return;
    }

    // After baseline, if count goes up, it's a new payment!
    if (payments.length > previousPaymentCount.current) {
      const newPayment = payments[0]; // Assuming payments are sorted desc by date
      if (newPayment) {
        showToast(`Payment Received! ${formatAmount(newPayment.amountLamports, newPayment.token)} ${newPayment.token}`, "success");
        // Play subtle success sound
        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3");
        audio.volume = 0.4;
        audio.play().catch(() => {});
      }
    }
    previousPaymentCount.current = payments.length;
  }, [payments, isPaymentsLoading]);
  

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-950 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <p className="text-sm font-black text-white">
            ${payload[0].value.toFixed(2)} <span className="text-[10px] text-zinc-500 ml-1">VOLUME</span>
          </p>
        </div>
      );
    }
    return null;
  };
  // Play sound on success modal
  useMemo(() => {
    if (successData) {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }
  }, [successData]);
  const [profile, setProfile] = useState<{ businessName: string | null; logoUrl: string | null; accentColor: string | null; webhookUrl: string | null; webhookSecret: string | null } | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; message: string; onConfirm: () => void; variant?: "danger" | "gold" } | null>(null);

  const filtered = links.filter(l =>
    (l.label.toLowerCase().includes(search.toLowerCase()) || l.id.includes(search)) &&
    (!statusFilter || l.status === statusFilter)
  );

  const downloadCSV = () => {
    if (links.length === 0) return;
    const headers = ["ID", "Label", "Token", "Amount", "Payments", "Status", "Created"];
    const rows = links.map(l => [
      l.id,
      l.label,
      l.token,
      formatAmount(l.amountLamports, l.token),
      l.paymentCount,
      getEffectiveStatus(l),
      new Date(l.createdAt).toLocaleDateString()
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biepay_links_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

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

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  const fetchProfile = async () => {
    if (!user?.id) return;
    setIsProfileLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/merchants/${user.id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
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
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/analytics/${merchantIds}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
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
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/merchants/${user.id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
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

  const [debugData, setDebugData] = useState<any>(null);
  const showDebugInfo = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API_BASE}/api/debug`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setDebugData(data);
      setModal("debug");
    } catch (e) {
      showToast("Debug fetch failed", "error");
    }
  };

  function handleCreated(result: CreateLinkResponse) {
    setModal(null);
    setShareLink({ id: result.link.id, label: result.link.label });
    setModal("share");
  }

  async function handleDelete(id: string) {
    setConfirmConfig({
      title: "Delete Payment Link",
      message: "Are you sure you want to permanently remove this link? All transaction history for this link will be purged from your dashboard.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmConfig(null);
        setIsDeleting(true);
        try {
          const token = await getAccessToken();
          await deleteLink(token ?? "", id);
          setDetailLink(null);
          setSuccessData({
            title: "Link Deleted",
            message: "The payment link has been permanently removed."
          });
          setModal("success");
        } catch (err) {
          setSuccessData({
            title: "Delete Failed",
            message: "We couldn't delete this link. Please try again later.",
            isError: true
          });
          setModal("success");
        } finally {
          setIsDeleting(false);
        }
      }
    });
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
      setSuccessData({
        title: "Connection Required",
        message: "Please connect your destination wallet (Phantom) first to perform a sweep."
      });
      setModal("success");
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
        setSuccessData({
          title: "Nothing to Sweep",
          message: "No compatible funds (SOL, USDC, or USDT) were found in your embedded wallet."
        });
        setModal("success");
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
      setSuccessData({
        title: "Sweep Failed",
        message: err.message || "An unexpected error occurred during the transfer.",
        isError: true
      });
      setModal("success");
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
      <div className="min-h-screen bg-white">
        <header className="px-6 h-20 flex items-center justify-between border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8" variant="gold" />
            <span className="font-bold text-lg">BiePay</span>
          </div>
          <button onClick={login} className="text-sm font-bold text-zinc-900 hover:text-zinc-600 transition-colors">Sign In</button>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-24 text-center space-y-12">
          <div className="space-y-6">
            <h1 className="text-6xl font-black tracking-tight text-zinc-900 leading-[1.1]">
              Social Commerce <br />
              <span className="text-zinc-400">Powered by Solana.</span>
            </h1>
            <p className="text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">
              Accept payments globally with zero friction. Create payment links that live directly inside social feeds as Solana Blinks.
            </p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={login}
              className="px-8 py-4 bg-zinc-900 text-white rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-all shadow-2xl shadow-zinc-200 hover:-translate-y-1 active:translate-y-0"
            >
              Get Started for Free
            </button>
          </div>
          <div className="pt-20 grid grid-cols-3 gap-8 border-t border-zinc-100">
            {[
              { t: "Global Settlement", d: "Accept SOL, USDC, and USDT instantly." },
              { t: "Zero Redirects", d: "Checkout directly inside social feeds." },
              { t: "Self-Custodial", d: "Your funds, your keys, your business." }
            ].map(f => (
              <div key={f.t} className="space-y-2 text-left">
                <h3 className="font-bold text-zinc-900">{f.t}</h3>
                <p className="text-sm text-zinc-500">{f.d}</p>
              </div>
            ))}
          </div>
        </main>
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
          <div className="w-px h-6 bg-zinc-200 mx-1"></div>
          <button
            onClick={() => setIsIncognito(!isIncognito)}
            className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all ${
              isIncognito 
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' 
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
            title={isIncognito ? "Disable Incognito Mode" : "Enable Incognito Mode"}
          >
            {isIncognito ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            )}
          </button>
          
          <button
            onClick={showDebugInfo}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-all"
            title="Session Debug"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>

          <div className="relative group">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {payments.filter((p: any) => p.status === 'confirmed').length > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-amber-500 rounded-full border border-white"></span>
              )}
            </button>
            <div className="absolute right-0 mt-2 w-64 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all">
              <div className="px-4 py-3 border-b border-zinc-100">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Recent Notifications</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {payments.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400">No new notifications</div>
                ) : (
                  payments.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="p-3 border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                      <p className="text-[10px] font-black text-zinc-900 uppercase">{p.linkLabel}</p>
                      <p className="text-[9px] text-emerald-600 font-bold">Payment Confirmed</p>
                      <p className="text-[8px] text-zinc-400 mt-1">{timeAgo(p.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
                          setSuccessData({
                            title: "Generation Failed",
                            message: "We encountered a network error while creating your secure wallet."
                          });
                          setModal("success");
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

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Available Balance</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-black tracking-tighter">
                {isIncognito ? "••••" : (balance !== null ? balance.toFixed(4) : "0.0000")} {!isIncognito && <span className="text-sm font-bold text-zinc-400">SOL</span>}
              </h3>
            </div>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Main Settlement Wallet</p>
          </div>
          <div className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Lifetime Value</p>
            <h3 className="text-2xl font-black tracking-tighter">{isIncognito ? "••••" : `$${stats.totalVolume.toLocaleString()}`}</h3>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter">Gross Revenue</p>
          </div>
          <div className="p-6 bg-white rounded-3xl border border-zinc-200 shadow-sm space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Payments Received</p>
            <h3 className="text-2xl font-black tracking-tighter">{isIncognito ? "••••" : stats.totalPayments}</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">Total Completed</p>
          </div>
          <div className="p-6 bg-zinc-950 rounded-3xl border border-zinc-800 shadow-xl space-y-1 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Logo className="w-16 h-16" variant="gold" />
            </div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Platform Fees</p>
            <h3 className="text-2xl font-black tracking-tighter text-white">{isIncognito ? "••••" : `$${stats.platformFees.toFixed(2)}`}</h3>
            <p className="text-[10px] text-amber-500 font-black uppercase tracking-tighter">Institutional v1.8</p>
          </div>
        </div>
        
        {/* Revenue Analytics Chart */}
        <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight">Revenue Analytics</h2>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">7-Day Gross Performance</p>
            </div>
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-100">
              Live Feed
            </div>
          </div>
          <RevenueChart data={analytics} />
        </div>

        {/* Links table */}
        {/* Main content tabs */}
        <div className="space-y-6 mt-8">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-zinc-100 p-1 rounded-2xl border border-zinc-200/50">
              <button 
                onClick={() => setActiveTab("links")}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "links" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
              >
                Payment Links
              </button>
              <button 
                onClick={() => setActiveTab("transactions")}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "transactions" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
              >
                Transactions
              </button>
            </div>

            <div className="flex gap-3">
              {activeTab === "transactions" && (
                <button 
                  onClick={async () => {
                    showToast("Syncing with Solana Ledger...", "info");
                    try {
                      const token = await getAccessToken();
                      const result = await triggerSync(token ?? "");
                      if (result.count > 0) {
                        showToast(`Sync complete. Reconciled ${result.count} new transactions.`, "success");
                        mutatePayments();
                      } else {
                        showToast("Dashboard is already up to date.", "info");
                      }
                    } catch (err) {
                      showToast("Sync failed. Please try again later.", "error");
                    }
                  }}
                  className="p-2.5 bg-zinc-950 text-amber-500 border border-amber-900/30 rounded-2xl hover:bg-zinc-900 transition-all shadow-xl flex items-center gap-2 group"
                  title="Sync with Chain"
                >
                  <svg className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest pr-1">Sync</span>
                </button>
              )}
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search links..." 
                  className="pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-2xl text-xs font-bold w-64 outline-none focus:border-zinc-900 transition-all shadow-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <svg className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <button onClick={downloadCSV} className="p-2.5 bg-white border border-zinc-200 rounded-2xl hover:bg-zinc-50 transition-all shadow-sm" title="Export CSV">
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
            </div>
          </div>

          {activeTab === "links" ? (
            <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-100">
                    {["Link", "Token", "Amount", "Payments", "Status", "Created", ""].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-zinc-400 px-6 py-4 uppercase tracking-widest">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filtered.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setDetailLink(l)}
                      className="group border-b border-zinc-50 last:border-none hover:bg-zinc-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-zinc-950 tracking-tight group-hover:text-amber-600 transition-colors">{l.label}</p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">{l.id}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-zinc-600">{l.token}</td>
                      <td className="px-6 py-4 text-xs font-black text-zinc-900">{isIncognito ? "••••" : formatAmount(l.amountLamports, l.token)}</td>
                      <td className="px-6 py-4 text-xs font-bold text-zinc-600">
                        {isIncognito ? "—" : `${l.paymentCount}${l.maxPayments !== null ? ` / ${l.maxPayments}` : ""}`}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-tighter border ${statusPill(getEffectiveStatus(l))}`}>
                          {getEffectiveStatus(l)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{timeAgo(l.createdAt)}</td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => { setShareLink({ id: l.id, label: l.label }); setModal("share"); }}
                            className="p-2 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-xl transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Transaction History Table */
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/50">
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Product</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Payer Wallet</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Amount</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {isPaymentsLoading ? (
                      Array(5).fill(0).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={5} className="px-6 py-4 h-16 bg-zinc-50/30" />
                        </tr>
                      ))
                    ) : (unlinkedWallets.length > 0 || payments.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12">
                          {unlinkedWallets.length > 0 && (
                            <div className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center gap-3 text-left">
                                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shrink-0">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-black text-amber-900 uppercase tracking-tight">Unlinked Wallets Detected</p>
                                  <p className="text-[11px] text-amber-700 leading-tight">Some connected wallets are not linked to your profile. Transactions for these wallets won't appear here.</p>
                                </div>
                              </div>
                              <button 
                                onClick={() => linkWallet()}
                                className="px-4 py-2 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-700 transition-all shadow-md active:scale-95 shrink-0"
                              >
                                Link Wallets
                              </button>
                            </div>
                          )}

                          {payments.length === 0 && (
                            <div className="text-center py-8">
                              <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-100">
                                <svg className="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              </div>
                              <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">No transactions recorded yet</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      payments.map((p: any) => (
                        <tr key={p.id} className="hover:bg-zinc-50/80 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-zinc-900">{new Date(p.createdAt).toLocaleDateString()}</p>
                            <p className="text-[10px] text-zinc-400 font-medium">{new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-black text-zinc-900 tracking-tight">{p.linkLabel}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded group-hover:bg-white transition-colors">
                                {p.payerWallet.slice(0, 4)}...{p.payerWallet.slice(-4)}
                              </code>
                              <button 
                                onClick={() => navigator.clipboard.writeText(p.payerWallet)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-zinc-400 hover:text-zinc-900 uppercase"
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-black text-zinc-950">{formatAmount(p.amountLamports, p.token)}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {p.signature ? (
                              <a 
                                href={`https://explorer.solana.com/tx/${p.signature}?cluster=devnet`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-all uppercase tracking-widest"
                              >
                                Explorer
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                              </a>
                            ) : (
                              <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      {/* Institutional Footer */}
      <footer className="mt-12 py-12 border-t border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3 opacity-40 grayscale">
          <Logo className="w-5 h-5" variant="gold" />
          <span className="text-xs font-bold tracking-tight">BiePay Institutional</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="/legal/terms" className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors">Terms</a>
          <a href="/legal/privacy" className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-900 transition-colors">Privacy</a>
          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">© 2026 BiePay</span>
        </div>
      </footer>
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

      {/* Confirm modal */}
      {confirmConfig && (
        <ConfirmModal
          {...confirmConfig}
          onCancel={() => setConfirmConfig(null)}
        />
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
                  ["Amount", isIncognito ? "••••" : formatAmount(detailLink.amountLamports, detailLink.token)],
                  ["Payments", isIncognito ? "—" : `${detailLink.paymentCount}${detailLink.maxPayments !== null ? ` / ${detailLink.maxPayments}` : ""}`],
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
      {/* Withdraw modal */}
      <WithdrawModal
        isOpen={modal === "withdraw"}
        onClose={() => setModal(null)}
        sourceLink={withdrawSource}
        address={address}
        onSuccess={() => { mutatePayments(); }}
      />

      {modal === "debug" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setModal(null)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Session Debug Data</h2>
                <p className="text-sm text-zinc-400 font-medium">Internal authentication state for BiePay support.</p>
              </div>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto bg-zinc-50 font-mono text-[10px]">
              <pre>{JSON.stringify(debugData, null, 2)}</pre>
            </div>
            <div className="p-8 bg-white border-t border-zinc-100">
              <button onClick={() => setModal(null)} className="w-full py-4 bg-zinc-900 text-white font-bold rounded-2xl">Close Debugger</button>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {modal === "success" && successData && (
        <SuccessModal
          title={successData.title}
          message={successData.message}
          txSig={successData.txSig}
          isError={successData.isError}
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
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div 
            className="w-full max-w-md bg-white h-screen shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 pb-4 flex items-center justify-between border-b border-zinc-100 bg-white sticky top-0 z-10">
              <h2 className="text-2xl font-black tracking-tight text-zinc-900 uppercase tracking-widest">Settings</h2>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-zinc-900">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 pt-6">
              {isProfileLoading ? (
                <div className="py-20 text-center text-zinc-400 flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div>
                  <span>Loading storefront settings...</span>
                </div>
              ) : (
                <StorefrontSettings 
                profile={profile || { businessName: "", logoUrl: "", accentColor: "#c5a36e", webhookUrl: "", webhookSecret: "" }} 
                onSave={handleSaveProfile}
                onExport={handleExportWallet}
                onNotify={showToast}
              />
              )}

            </div>
          </div>
        </div>
      )}

      {/* Profile Panel */}
      {modal === "profile" && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div 
            className="w-full max-w-md bg-white h-screen shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto">
              <div className="h-48 bg-zinc-900 relative">
                <button onClick={() => setModal(null)} className="absolute right-6 top-6 text-white/50 hover:text-white text-3xl">×</button>
                <div className="absolute -bottom-10 left-8 w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border-4 border-white overflow-hidden">
                  {profile?.logoUrl ? (
                    <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center text-2xl font-bold uppercase">
                      {user?.email?.address?.[0] ?? "B"}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-4 right-6 flex gap-2">
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-md border border-emerald-500/30 uppercase tracking-tighter">Verified Merchant</span>
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-md border border-amber-500/30 uppercase tracking-tighter">Devnet</span>
                </div>
              </div>
              <div className="p-8 pt-16 space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 leading-tight">
                    {profile?.businessName ?? user?.email?.address?.split('@')[0] ?? "Merchant"}
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">{user?.email?.address}</p>
                </div>

                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Primary Wallet</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <code className="text-xs font-mono text-zinc-600 bg-white px-2 py-1 rounded border border-zinc-100">
                      {address?.slice(0, 8)}...{address?.slice(-8)}
                    </code>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(address ?? ''); }}
                      className="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 uppercase underline"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button onClick={() => setModal("settings")} className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-zinc-50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center group-hover:bg-white transition-colors">
                        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </div>
                      <span>Manage Branding</span>
                    </div>
                    <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  
                  <button onClick={() => window.open('https://dial.to', '_blank')} className="w-full p-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-zinc-50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center group-hover:bg-white transition-colors">
                        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </div>
                      <span>Test Blink Validator</span>
                    </div>
                    <svg className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>

                  <button onClick={logout} className="w-full p-4 bg-white border border-red-100 text-red-600 rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-red-50 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center group-hover:bg-white transition-colors">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      </div>
                      <span>Log Out</span>
                    </div>
                  </button>
                </div>

                <div className="flex flex-col items-center gap-2 py-8">
                  <div className="flex gap-4 text-[10px] text-zinc-400 font-bold uppercase tracking-widest justify-center">
                    <a href="/legal/terms" className="hover:text-zinc-900">Terms</a>
                    <span>•</span>
                    <a href="/legal/privacy" className="hover:text-zinc-900">Privacy</a>
                    <span>•</span>
                    <a href="#" className="hover:text-zinc-900">v1.2.0</a>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-300 uppercase tracking-tight">
                    UID: {user?.id} | LNKD: {user?.linkedAccounts.filter((a: any) => a.type === 'wallet').length} wallets
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 bg-white border-t border-zinc-100 flex gap-3 sticky bottom-0 z-10">
              <button onClick={() => setModal("settings")} className="flex-1 py-4 bg-zinc-900 text-white font-bold rounded-2xl shadow-xl shadow-zinc-200 hover:bg-zinc-800 transition-all">Storefront Settings</button>
            </div>
          </div>
        </div>
      )}
      <AIAssistant />
      <JupiterTerminal />
      {/* Premium Toast Notification System */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-10 duration-500">
          <div className={`px-6 py-4 rounded-[2rem] shadow-[0_30px_60px_rgba(0,0,0,0.3)] backdrop-blur-2xl border flex items-center gap-4 min-w-[320px] ${
            toast.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
            toast.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 
            'bg-zinc-900/90 border-white/10 text-white'
          }`}>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              {toast.type === 'error' ? '✕' : toast.type === 'success' ? '✓' : 'ℹ'}
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.1em]">{toast.message}</p>
            <button onClick={() => setToast(null)} className="ml-auto opacity-50 hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
