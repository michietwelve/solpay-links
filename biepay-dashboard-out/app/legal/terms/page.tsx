"use client";

import Logo from "../../../components/layout/Logo";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-900 selection:text-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <header className="mb-16">
          <Logo className="w-10 h-10 mb-8" />
          <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-zinc-400 mt-2 font-mono text-xs uppercase tracking-widest">Last updated: May 4, 2024</p>
        </header>

        <section className="space-y-12">
          <div className="space-y-4">
            <h2 className="text-lg font-bold">1. Agreement to Terms</h2>
            <p className="text-zinc-600 leading-relaxed">
              By accessing or using BiePay, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">2. Digital Assets & Solana</h2>
            <p className="text-zinc-600 leading-relaxed">
              BiePay provides an interface for interacting with the Solana blockchain. We do not take custody of your funds. You are responsible for maintaining the security of your private keys and seed phrases.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">3. Merchant Responsibilities</h2>
            <p className="text-zinc-600 leading-relaxed">
              As a merchant, you are responsible for the products and services you sell using BiePay links. You must comply with all local laws and regulations regarding your business activities.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">4. Limitation of Liability</h2>
            <p className="text-zinc-600 leading-relaxed">
              BiePay is provided "as is" without any warranties. We are not liable for any losses resulting from network outages, smart contract bugs, or unauthorized access to your account.
            </p>
          </div>
        </section>

        <footer className="mt-24 pt-12 border-t border-zinc-100">
          <a href="/dashboard" className="text-sm font-bold hover:underline">← Back to Dashboard</a>
        </footer>
      </div>
    </div>
  );
}
