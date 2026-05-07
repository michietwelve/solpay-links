"use client";

import Logo from "../../../components/layout/Logo";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-100 selection:text-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="flex items-center gap-4 mb-16">
          <Logo className="w-10 h-10" variant="gold" />
          <h1 className="text-3xl font-black tracking-tight uppercase">Terms of Service</h1>
        </div>
        
        <div className="space-y-12 text-sm leading-relaxed text-zinc-600">
          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">1. Acceptance of Terms</h2>
            <p>
              By accessing or using BiePay, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service. BiePay provides institutional-grade payment infrastructure on the Solana blockchain.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">2. Merchant Responsibilities</h2>
            <p>
              Merchants are solely responsible for the legality of the goods and services they sell using BiePay. BiePay is a non-custodial tool; we do not hold your funds. You are responsible for the security of your private keys and the accuracy of your settlement addresses.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">3. Fees and Payments</h2>
            <p>
              BiePay currently operates on Solana Devnet for demonstration purposes. On Mainnet, a standard platform fee of 0.5% (50 BPS) applies to all transactions. Network gas fees (SOL) are paid by the sender.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xs font-black text-zinc-950 uppercase tracking-[0.2em]">4. Prohibited Content</h2>
            <p>
              You may not use BiePay to facilitate transactions for illegal substances, unauthorized weapons, or fraudulent financial schemes. We reserve the right to flag or restrict accounts associated with malicious on-chain activity.
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
