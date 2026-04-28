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
        <title>SolPay Links</title>
        <meta name="description" content="Stripe-grade payment links for Solana" />
      </head>
      <body>
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ["email", "google"],
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
