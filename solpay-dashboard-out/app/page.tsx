"use client";
import Link from "next/link";
import { ArrowRight, Zap, Shield, CreditCard, Globe, Share2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-emerald-400 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Zap className="w-6 h-6 text-black fill-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">SolPay Links</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="https://solana.com/developers/actions" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Blinks</a>
          </div>
          <Link 
            href="/dashboard"
            className="px-6 py-2.5 bg-white text-black rounded-full text-sm font-bold hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="pt-44 pb-32 px-6 relative">
        {/* Abstract Background Orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-600/20 blur-[120px] rounded-full -z-10 pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] rounded-full -z-10 pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-purple-400 backdrop-blur-md animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            Built for the Solana Frontier Hackathon
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
            THE FASTEST WAY TO <br />
            <span className="bg-gradient-to-r from-purple-400 via-emerald-400 to-purple-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">GET PAID</span> ON SOLANA.
          </h1>
          
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Create professional payment links in seconds. Share them anywhere as 
            <span className="text-white font-medium"> Blinks</span>. 
            Accept SOL, USDC, and USDT with zero friction.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link 
              href="/dashboard"
              className="group w-full sm:w-auto px-8 py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all hover:scale-105"
            >
              Start Building Links
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a 
              href="#demo"
              className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-bold hover:bg-white/10 transition-all"
            >
              Watch Demo
            </a>
          </div>
        </div>

        {/* Hero Image / UI Preview */}
        <div className="mt-24 max-w-6xl mx-auto relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-emerald-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative bg-[#0a0a0a] rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="h-10 bg-white/5 border-b border-white/5 flex items-center gap-1.5 px-4">
              <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
              <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/40" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
            </div>
            <div className="p-8 md:p-12">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-md border border-emerald-500/20">
                    Live Blink Preview
                  </div>
                  <h3 className="text-3xl font-bold leading-tight">Turn your Twitter into a Store.</h3>
                  <p className="text-zinc-400">
                    When you share a SolPay Link on Twitter, it automatically transforms into a 
                    Solana Blink. Your customers can pay without ever leaving their feed.
                  </p>
                </div>
                <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5 backdrop-blur-sm">
                  {/* Mock Payment Card */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
                        <Zap className="w-6 h-6 text-black fill-black" />
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Amount Due</div>
                        <div className="text-2xl font-bold">100.00 USDC</div>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="h-10 w-full bg-white text-black rounded-lg text-xs font-black flex items-center justify-center uppercase tracking-widest">
                        Pay with Phantom
                      </div>
                      <div className="h-10 w-full bg-white/10 border border-white/10 rounded-lg text-xs font-bold flex items-center justify-center text-zinc-400">
                        Buy with Credit Card
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
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-4 hover:bg-white/[0.07] transition-all">
              <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center">
                <Share2 className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-xl font-bold">Social Commerce</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Integrated with the Solana Actions spec. Your links become native 
                checkout components on Twitter, Discord, and beyond.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-4 hover:bg-white/[0.07] transition-all">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-xl font-bold">Zero-Wallet Onboarding</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Powered by Privy. Users can pay with just an email address. 
                We handle the complex wallet creation in the background.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-4 hover:bg-white/[0.07] transition-all">
              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-xl font-bold">Fiat-to-Crypto</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Native MoonPay integration. Let your customers pay with their 
                credit card if they don't have crypto ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-20 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:row items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 opacity-50">
            <Zap className="w-5 h-5 text-white" />
            <span className="text-lg font-bold tracking-tight">SolPay Links</span>
          </div>
          <p className="text-zinc-500 text-sm">
            © 2026 SolPay Links. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">Twitter</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Discord</a>
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
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 1s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
