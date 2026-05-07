"use client";

import Logo from "../../../components/layout/Logo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-100 selection:text-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="flex items-center gap-4 mb-16">
          <Logo className="w-10 h-10" variant="gold" />
          <h1 className="text-3xl font-black tracking-tight uppercase">Privacy Policy</h1>
        </div>
        
        <div className="space-y-12 text-sm leading-relaxed text-zinc-600">
          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">1. Data Minimization</h2>
            <p>
              BiePay is designed as a privacy-first platform. We do not sell your data. We collect only what is necessary to facilitate on-chain transactions and provide merchant analytics.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">2. On-Chain Transparency</h2>
            <p>
              Please note that all transactions on the Solana blockchain are public. Payer and recipient wallet addresses, transaction amounts, and timestamps are visible to anyone via the Solana Explorer.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">3. Third-Party Services</h2>
            <p>
              We use Privy for authentication and MoonPay/Transak for fiat on-ramps. These providers have their own privacy policies which govern the data you provide to them directly (such as email addresses or credit card info).
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">4. Security</h2>
            <p>
              Your private keys are never stored on our servers. We use industry-standard encryption for all data in transit and at rest. Merchants using our "Self-Custody" export feature are responsible for securing their own exported keys.
            </p>
          </section>

          <section className="space-y-4 pt-12 border-t border-zinc-100">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Last Updated: May 2026 • v1.8 Production</p>
            <a href="/dashboard" className="inline-block text-[10px] font-black text-zinc-900 uppercase tracking-widest hover:underline decoration-2 underline-offset-4">Return to Dashboard</a>
          </section>
        </div>
      </div>
    </div>
  );
}
