"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { PrivyProvider } from "@privy-io/react-auth";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <html lang="en">
      <head>
        <title>SolPay Links</title>
        <meta name="description" content="Stripe-grade payment links for Solana" />
      </head>
      <body>
        {/*
          PrivyProvider wraps the whole app so any page can call usePrivy().
          The /pay/[linkId] page uses it for embedded-wallet auth.
          The /dashboard page continues to use the Solana wallet adapter below.
        */}
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ["email", "wallet", "google"],
            appearance: {
              theme: "light",
              accentColor: "#18181b", // zinc-900 — matches the dashboard palette
            },
            embeddedWallets: {
              createOnLogin: "users-without-wallets",
            },
            // Expose Solana as the default chain in the embedded wallet
            supportedChains: [{
              id: 101,
              name: "Solana",
              network: "mainnet-beta",
              nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
              rpcUrls: {
                default: { http: [RPC] },
                public:  { http: [RPC] },
              },
            }],
            defaultChain: {
              id: 101,
              name: "Solana",
              network: "mainnet-beta",
              nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
              rpcUrls: {
                default: { http: [RPC] },
                public:  { http: [RPC] },
              },
            },
          }}
        >
          <ConnectionProvider endpoint={RPC}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                {children}
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
