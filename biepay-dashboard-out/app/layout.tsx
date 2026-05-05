"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

import { PrivyProvider } from "@privy-io/react-auth";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "cmoh2gc1n004c0cl4svxkhsxx";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <html lang="en">
      <head>
        <title>BiePay Links</title>
        <meta name="description" content="Stripe-grade payment links for Solana" />
        <link rel="icon" href="/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        {/* Jupiter Terminal – data-preload fetches widget assets on page load for instant open */}
        <script src="https://terminal.jup.ag/main-v3.js" data-preload defer />
      </head>
      <body>
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ["email", "google", "wallet"],
            appearance: {
              theme: "light",
              accentColor: "#18181b",
            },
            embeddedWallets: {
              createOnLogin: "all-users",
              requireUserPasswordOnCreate: false,
            },
            externalWallets: {
              solana: {
                connectors: toSolanaWalletConnectors(),
              },
            },
            solanaClusters: [{
              name: "devnet",
              rpcUrl: RPC,
            }],
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
