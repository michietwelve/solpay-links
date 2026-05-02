"use client";
import Link from "next/link";
import { ArrowRight, Zap, Shield, CreditCard, Globe, Share2, Sparkles, TrendingUp, ZapOff } from "lucide-react";
import Logo from "../components/layout/Logo";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#020202] text-white selection:bg-[#c5a36e]/30 overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#020202]/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="gold" className="w-9 h-9" />
            <span className="text-xl font-black tracking-tighter uppercase">BiePay</span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <a href="#features" className="hover:text-[#c5a36e] transition-colors">Infrastructure</a>
            <a href="#how-it-works" className="hover:text-[#c5a36e] transition-colors">Protocol</a>
            <a href="#" className="hover:text-[#c5a36e] transition-colors">Documentation</a>
          </div>
          <Link 
            href="/dashboard"
            className="px-8 py-3 bg-[#c5a36e] text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#d4b47e] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-[#c5a36e]/20"
          >
            Enter Dashboard
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="pt-56 pb-40 px-6 relative">
        {/* Luxury Background Orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] bg-[#c5a36e]/10 blur-[150px] rounded-full -z-10 pointer-events-none" />
        <div className="absolute top-40 right-[-10%] w-[500px] h-[500px] bg-[#c5a36e]/5 blur-[120px] rounded-full -z-10 pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center space-y-12">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e] backdrop-blur-md animate-fade-in shadow-2xl">
            <Sparkles className="w-3 h-3" />
            The Gold Standard of Solana Payments
          </div>
          
          <h1 className="text-7xl md:text-[110px] font-black tracking-tighter leading-[0.85] uppercase">
            Monetize <br />
            <span className="text-[#c5a36e] relative">
              Everywhere.
              <div className="absolute -bottom-4 left-0 w-full h-2 bg-[#c5a36e]/20 blur-lg" />
            </span>
          </h1>
          
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-medium">
            BiePay transforms any URL into a high-conversion checkout experience. 
            Share as <span className="text-white font-bold underline decoration-[#c5a36e] decoration-2 underline-offset-4">Blinks</span> and accept payments directly in the social feed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <Link 
              href="/dashboard"
              className="group w-full sm:w-auto px-12 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-[#c5a36e] transition-all hover:scale-105 shadow-2xl shadow-white/10"
            >
              Start Accepting SOL
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button 
              className="w-full sm:w-auto px-12 py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-white/10 transition-all backdrop-blur-xl"
            >
              View Protocol
            </button>
          </div>
        </div>

        {/* Hero Image / UI Preview */}
        <div className="mt-32 max-w-6xl mx-auto relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#c5a36e] to-zinc-500 rounded-[40px] blur opacity-10 group-hover:opacity-25 transition duration-1000"></div>
          <div className="relative bg-[#050505] rounded-[40px] border border-white/5 overflow-hidden shadow-[0_0_100px_rgba(197,163,110,0.1)]">
            <div className="h-14 bg-white/[0.02] border-b border-white/5 flex items-center justify-between px-8">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white/10" />
                <div className="w-3 h-3 rounded-full bg-white/10" />
                <div className="w-3 h-3 rounded-full bg-white/10" />
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">biepay_terminal_v2.0</div>
            </div>
            <div className="p-10 md:p-20">
              <div className="grid md:grid-cols-2 gap-20 items-center">
                <div className="space-y-8">
                  <div className="inline-block px-4 py-1.5 bg-[#c5a36e]/10 text-[#c5a36e] text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-[#c5a36e]/20">
                    Blink Architecture
                  </div>
                  <h3 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tighter uppercase">Native checkout <br /> inside the feed.</h3>
                  <p className="text-zinc-500 font-medium leading-relaxed">
                    BiePay Links are built on the Solana Actions protocol. Your storefront 
                    lives wherever your link is shared—Twitter, Discord, or Telegram.
                  </p>
                  <div className="flex items-center gap-6 pt-4">
                    <div className="flex -space-x-3">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-[#050505] bg-zinc-800" />
                      ))}
                    </div>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Trusted by 2k+ Merchants</p>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-10 bg-[#c5a36e]/20 blur-[80px] rounded-full" />
                  <div className="relative bg-[#0a0a0a] rounded-3xl p-8 border border-[#c5a36e]/20 shadow-2xl space-y-6">
                    <div className="flex justify-between items-center">
                      <Logo variant="gold" className="w-12 h-12 shadow-xl shadow-[#c5a36e]/20" />
                      <div className="text-right">
                        <div className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">Transaction Value</div>
                        <div className="text-3xl font-black tracking-tighter">0.50 SOL</div>
                      </div>
                    </div>
                    <div className="space-y-3 pt-4">
                      <div className="h-14 w-full bg-[#c5a36e] text-black rounded-2xl text-[11px] font-black flex items-center justify-center uppercase tracking-[0.2em] shadow-lg shadow-[#c5a36e]/20">
                        Confirm Purchase
                      </div>
                      <div className="h-14 w-full bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black flex items-center justify-center text-zinc-400 uppercase tracking-[0.2em]">
                        Cancel Order
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-40 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-24 space-y-4">
            <h2 className="text-[11px] font-black text-[#c5a36e] uppercase tracking-[0.3em]">Core Infrastructure</h2>
            <p className="text-5xl font-black tracking-tighter uppercase">Built for Scale.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { icon: <TrendingUp className="text-[#c5a36e]" />, title: "Real-time Settlement", desc: "Payments are settled on-chain in sub-second time. No holding periods, no delays." },
              { icon: <Shield className="text-[#c5a36e]" />, title: "Embedded Security", desc: "Powered by Privy, we provide industrial-grade security with no seed-phrase management." },
              { icon: <Globe className="text-[#c5a36e]" />, title: "Global Fiat Ramp", desc: "Accept payments from 160+ countries via credit card with native MoonPay integration." }
            ].map((f, i) => (
              <div key={i} className="p-10 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-6 hover:bg-white/[0.04] transition-all group">
                <div className="w-14 h-14 bg-[#c5a36e]/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h4 className="text-xl font-black uppercase tracking-tight">{f.title}</h4>
                <p className="text-zinc-500 font-medium leading-relaxed text-sm">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-32 px-6 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-16 mb-24">
            <div className="col-span-2 space-y-8">
              <div className="flex items-center gap-3">
                <Logo variant="gold" className="w-10 h-10" />
                <span className="text-2xl font-black tracking-tighter uppercase">BiePay</span>
              </div>
              <p className="text-zinc-500 max-w-sm font-medium leading-relaxed">
                Reimagining the future of social commerce on the Solana blockchain. 
                Fast, secure, and beautiful payments for everyone.
              </p>
            </div>
            <div className="space-y-6">
              <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e]">Protocol</h5>
              <div className="flex flex-col gap-4 text-sm font-bold text-zinc-500">
                <a href="#" className="hover:text-white transition-colors">Documentation</a>
                <a href="#" className="hover:text-white transition-colors">SDK</a>
                <a href="#" className="hover:text-white transition-colors">Actions Spec</a>
              </div>
            </div>
            <div className="space-y-6">
              <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e]">Connect</h5>
              <div className="flex flex-col gap-4 text-sm font-bold text-zinc-500">
                <a href="#" className="hover:text-white transition-colors">Twitter (X)</a>
                <a href="#" className="hover:text-white transition-colors">GitHub</a>
                <a href="#" className="hover:text-white transition-colors">Discord</a>
              </div>
            </div>
          </div>
          <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">
              © 2026 BiePay Infrastructure. All rights reserved.
            </p>
            <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-zinc-600">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Background Styles ── */}
      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 6s ease infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        body {
          background-color: #020202;
        }
      `}</style>
    </div>
  );
}
