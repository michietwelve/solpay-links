"use client";

import Logo from "../../../components/layout/Logo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-900 selection:text-white">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <header className="mb-16">
          <Logo className="w-10 h-10 mb-8" />
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-zinc-400 mt-2 font-mono text-xs uppercase tracking-widest">Last updated: May 4, 2024</p>
        </header>

        <section className="space-y-12">
          <div className="space-y-4">
            <h2 className="text-lg font-bold">1. Information We Collect</h2>
            <p className="text-zinc-600 leading-relaxed">
              We collect minimal information required to provide our services. This includes your email address (for authentication via Privy) and your public Solana wallet address.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">2. Blockchain Transparency</h2>
            <p className="text-zinc-600 leading-relaxed">
              Please note that all transactions conducted on the Solana network are public by nature. BiePay does not have the ability to delete or anonymize data that is already on the blockchain.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">3. Data Security</h2>
            <p className="text-zinc-600 leading-relaxed">
              We use industry-standard encryption and security protocols provided by Privy to protect your account data. We never store your private keys on our servers.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">4. Third-Party Services</h2>
            <p className="text-zinc-600 leading-relaxed">
              We may use third-party analytics tools to monitor and improve our service. These tools may collect information such as your IP address and browser type.
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
