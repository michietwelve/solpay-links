"use client";

import React, { useEffect, useRef, useCallback } from "react";

/**
 * JUPITER TERMINAL INTEGRATION
 * Initialises Jupiter in modal mode so `window.Jupiter.resume()` opens
 * the swap overlay when the merchant clicks "Swap Earnings".
 *
 * Script is loaded via <script> in layout.tsx (main-v3.js).
 * We listen for the global "jupiter-terminal-ready" event as a reliable
 * signal that the SDK is available.
 */

// ── TypeScript ambient declarations ──────────────────────────────────────────
declare global {
  interface Window {
    Jupiter: {
      init: (config: Record<string, unknown>) => void;
      resume: () => void;
      close: () => void;
    };
  }
}

let isJupiterInitialized = false;

export function openJupiterSwap() {
  console.log("Swap button clicked", { isJupiterInitialized, jupiterObj: window.Jupiter });
  if (typeof window !== "undefined" && window.Jupiter) {
    if (!isJupiterInitialized) {
      console.log("Initializing Jupiter Terminal...");
      isJupiterInitialized = true;
      window.Jupiter.init({
        // Modal mode: Jupiter renders as a full overlay
        displayMode: "modal",

        // Use a reliable mainnet RPC to avoid rate limits
        endpoint: "https://api.mainnet-beta.solana.com",
        
        strictTokenList: false,

        formProps: {
          initialInputMint: "So11111111111111111111111111111111111111112", // SOL
          initialOutputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        },

        // PREMIUM DESIGN OVERHAUL
        theme: "dark",
        customStyles: {
          widgetStyle: {
            borderRadius: "24px",
            backgroundColor: "#09090b", // zinc-950
          }
        },
        containerStyles: { zIndex: 9999 },
      });
      // Sometimes init() takes a second, but it usually handles opening itself if modal.
      // If not, we can force resume after a small timeout.
      setTimeout(() => {
        console.log("Forcing resume...");
        if (window.Jupiter && window.Jupiter.resume) {
           window.Jupiter.resume();
        }
      }, 500);
    } else {
      console.log("Resuming Jupiter Terminal...");
      window.Jupiter.resume();
    }
  } else {
    console.warn("Jupiter object not found on window!");
  }
}

export function JupiterTerminal() {
  // No visible DOM — Jupiter mounts its own portal when initialized
  return null;
}
