"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Shield, Globe, TrendingUp, Sparkles, Zap, Users, Activity } from "lucide-react";
import Logo from "../components/layout/Logo";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function AnimCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const { ref, inView } = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const t = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(t); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [inView, target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

export default function Home() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("mousemove", onMouse); window.removeEventListener("scroll", onScroll); };
  }, []);

  const hero = useInView(0.1);
  const features = useInView(0.1);
  const stats = useInView(0.1);

  const cta = useInView(0.1);

  const cards = [
    { icon: <TrendingUp className="w-6 h-6 text-[#c5a36e]" />, title: "Real-time Settlement", desc: "Payments settled on-chain in sub-second time. No holding periods, no delays." },
    { icon: <Shield className="w-6 h-6 text-[#c5a36e]" />, title: "Embedded Security", desc: "Industrial-grade security via Privy. No seed phrases. No compromises." },
    { icon: <Globe className="w-6 h-6 text-[#c5a36e]" />, title: "Global Fiat Ramp", desc: "Accept payments from 160+ countries. Native PPP localization for every buyer." },
  ];



  return (
    <div className="min-h-screen bg-[#020202] text-white overflow-x-hidden selection:bg-[#c5a36e]/30">

      {/* Cursor glow */}
      <div
        className="fixed pointer-events-none z-50 w-64 h-64 rounded-full opacity-[0.07] transition-transform duration-75"
        style={{ background: "radial-gradient(circle, #c5a36e 0%, transparent 70%)", left: mousePos.x - 128, top: mousePos.y - 128 }}
      />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-40 border-b border-white/5 bg-[#020202]/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo variant="gold" className="w-9 h-9" />
            <span className="text-xl font-black tracking-tighter uppercase">BiePay</span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <a href="#features" className="hover:text-[#c5a36e] transition-colors duration-300">Infrastructure</a>
            <a href="#superpowers" className="hover:text-[#c5a36e] transition-colors duration-300">Protocol</a>
            <a href="#stats" className="hover:text-[#c5a36e] transition-colors duration-300">Stats</a>
          </div>
          <Link href="/dashboard" className="px-8 py-3 bg-[#c5a36e] text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#d4b47e] transition-all hover:scale-105 active:scale-95 shadow-xl shadow-[#c5a36e]/20">
            Enter Dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-56 pb-40 px-6 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] bg-[#c5a36e]/8 blur-[180px] rounded-full -z-10"
          style={{ transform: `translateX(-50%) translateY(${scrollY * 0.15}px)` }} />
        <div className="absolute top-40 right-[-5%] w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full -z-10" />
        <div className="absolute bottom-0 left-[-5%] w-[400px] h-[400px] bg-[#c5a36e]/5 blur-[100px] rounded-full -z-10" />

        <div ref={hero.ref} className="max-w-5xl mx-auto text-center space-y-12">
          <div className={`inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e] backdrop-blur-md shadow-2xl transition-all duration-700 ${hero.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <Sparkles className="w-3 h-3 animate-spin" style={{ animationDuration: "4s" }} />
            The Gold Standard of Solana Payments
          </div>

          <h1 className={`text-7xl md:text-[110px] font-black tracking-tighter leading-[0.85] uppercase transition-all duration-1000 delay-200 ${hero.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            Monetize <br />
            <span className="text-[#c5a36e] relative inline-block">
              Everywhere.
              <div className="absolute -bottom-2 left-0 w-full h-1 bg-gradient-to-r from-[#c5a36e]/0 via-[#c5a36e]/60 to-[#c5a36e]/0 animate-pulse" />
            </span>
          </h1>

          <p className={`text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-medium transition-all duration-1000 delay-400 ${hero.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            BiePay transforms any URL into a high-conversion checkout experience.
            Share as <span className="text-white font-bold underline decoration-[#c5a36e] decoration-2 underline-offset-4">Blinks</span> and accept payments directly in the social feed.
          </p>

          <div className={`flex flex-col sm:flex-row items-center justify-center gap-6 pt-8 transition-all duration-1000 delay-[600ms] ${hero.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <Link href="/dashboard" className="group w-full sm:w-auto px-12 py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-[#c5a36e] transition-all duration-300 hover:scale-105 shadow-2xl shadow-white/10">
              Start Accepting SOL
              <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
            </Link>
            <a href="#features" className="w-full sm:w-auto px-12 py-5 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-white/10 hover:border-[#c5a36e]/30 transition-all duration-300 backdrop-blur-xl text-center">
              View Protocol
            </a>
          </div>
        </div>

        {/* Terminal mockup */}
        <div className="mt-32 max-w-6xl mx-auto relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#c5a36e]/30 via-zinc-800/50 to-[#c5a36e]/30 rounded-[40px] blur opacity-0 group-hover:opacity-100 transition duration-1000" />
          <div className="relative bg-[#050505] rounded-[40px] border border-white/5 overflow-hidden shadow-[0_0_100px_rgba(197,163,110,0.08)]">
            <div className="h-14 bg-white/[0.02] border-b border-white/5 flex items-center justify-between px-8">
              <div className="flex items-center gap-2">
                {["bg-red-500/40", "bg-yellow-500/40", "bg-green-500/40"].map((c, i) => (
                  <div key={i} className={`w-3 h-3 rounded-full ${c} animate-pulse`} style={{ animationDelay: `${i * 200}ms` }} />
                ))}
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
                    BiePay Links are built on the Solana Actions protocol. Your storefront lives wherever your link is shared—Twitter, Discord, or Telegram.
                  </p>
                  <div className="flex items-center gap-6 pt-4">
                    <div className="flex -space-x-3">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-[#050505] bg-gradient-to-br from-zinc-700 to-zinc-900" />
                      ))}
                    </div>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Trusted by 2k+ Merchants</p>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-10 bg-[#c5a36e]/15 blur-[80px] rounded-full animate-pulse" style={{ animationDuration: "3s" }} />
                  <div className="relative bg-[#0a0a0a] rounded-3xl p-8 border border-[#c5a36e]/20 shadow-2xl space-y-6 hover:border-[#c5a36e]/40 transition-all duration-500">
                    <div className="flex justify-between items-center">
                      <Logo variant="gold" className="w-12 h-12 shadow-xl shadow-[#c5a36e]/20" />
                      <div className="text-right">
                        <div className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em]">Transaction Value</div>
                        <div className="text-3xl font-black tracking-tighter">0.50 SOL</div>
                      </div>
                    </div>
                    <div className="space-y-3 pt-4">
                      <div className="h-14 w-full bg-[#c5a36e] text-black rounded-2xl text-[11px] font-black flex items-center justify-center uppercase tracking-[0.2em] shadow-lg shadow-[#c5a36e]/30 hover:bg-[#d4b47e] transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-95">
                        Confirm Purchase
                      </div>
                      <div className="h-14 w-full bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black flex items-center justify-center text-zinc-400 uppercase tracking-[0.2em] hover:bg-white/8 transition-all duration-300 cursor-pointer">
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

      {/* Stats */}
      <section id="stats" className="py-24 px-6 border-y border-white/5 bg-white/[0.01]">
        <div ref={stats.ref} className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { val: 2000, suffix: "+", label: "Active Merchants" },
            { val: 48000, suffix: "+", label: "Payments Processed" },
            { val: 160, suffix: "+", label: "Countries Supported" },
            { val: 12, suffix: "", label: "Hackathon Superpowers" },
          ].map((s, i) => (
            <div key={i} className={`text-center space-y-2 transition-all duration-700 ${stats.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`} style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="text-4xl md:text-5xl font-black tracking-tighter text-[#c5a36e]">
                {stats.inView && <AnimCounter target={s.val} suffix={s.suffix} />}
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-40 px-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#c5a36e]/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-7xl mx-auto">
          <div ref={features.ref} className={`text-center mb-24 space-y-4 transition-all duration-700 ${features.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-[11px] font-black text-[#c5a36e] uppercase tracking-[0.3em]">Core Infrastructure</h2>
            <p className="text-5xl font-black tracking-tighter uppercase">Built for Scale.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {cards.map((f, i) => (
              <div
                key={i}
                className={`p-10 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-6 hover:bg-white/[0.05] hover:border-[#c5a36e]/20 transition-all duration-500 group cursor-default ${features.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}
                style={{ transitionDelay: `${i * 150}ms`, transitionDuration: "700ms" }}
              >
                <div className="w-14 h-14 bg-[#c5a36e]/10 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-[#c5a36e]/20 transition-all duration-300">
                  {f.icon}
                </div>
                <h4 className="text-xl font-black uppercase tracking-tight group-hover:text-[#c5a36e] transition-colors duration-300">{f.title}</h4>
                <p className="text-zinc-500 font-medium leading-relaxed text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* CTA */}
      <section className="py-40 px-6 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#c5a36e]/10 blur-[100px] rounded-full -z-10 animate-pulse" style={{ animationDuration: "4s" }} />
        <div ref={cta.ref} className={`max-w-3xl mx-auto text-center space-y-10 transition-all duration-1000 ${cta.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
          <Zap className="w-12 h-12 text-[#c5a36e] mx-auto animate-bounce" style={{ animationDuration: "2s" }} />
          <h2 className="text-6xl md:text-7xl font-black tracking-tighter uppercase">
            Ready to <span className="text-[#c5a36e]">Monetize?</span>
          </h2>
          <p className="text-zinc-400 text-xl font-medium leading-relaxed">Join thousands of merchants already using BiePay to turn every link into revenue.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-4 px-16 py-6 bg-[#c5a36e] text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-[#d4b47e] transition-all duration-300 hover:scale-105 active:scale-95 shadow-2xl shadow-[#c5a36e]/30 group">
            Launch Your Dashboard
            <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-24 px-6 border-t border-white/5 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-16 mb-16">
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <Logo variant="gold" className="w-10 h-10" />
                <span className="text-2xl font-black tracking-tighter uppercase">BiePay</span>
              </div>
              <p className="text-zinc-500 max-w-sm font-medium leading-relaxed">
                Reimagining the future of social commerce on Solana. Fast, secure, and beautiful payments for everyone.
              </p>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-green-400">All Systems Operational</span>
              </div>
            </div>
            <div className="space-y-6">
              <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e]">Protocol</h5>
              <div className="flex flex-col gap-4 text-sm font-bold text-zinc-500">
                {["Documentation", "SDK", "Actions Spec"].map(l => (
                  <a key={l} href="#" className="hover:text-white transition-colors">{l}</a>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c5a36e]">Connect</h5>
              <div className="flex flex-col gap-4 text-sm font-bold text-zinc-500">
                {["Twitter (X)", "GitHub", "Discord"].map(l => (
                  <a key={l} href="#" className="hover:text-white transition-colors">{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">© 2026 BiePay Infrastructure. All rights reserved.</p>
            <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-zinc-600">
              <a href="/legal/privacy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/legal/terms" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
