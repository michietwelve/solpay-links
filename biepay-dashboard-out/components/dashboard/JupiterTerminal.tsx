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

// Exported so the dashboard button can call it safely
export function openJupiterSwap() {
  if (typeof window !== "undefined" && window.Jupiter) {
    window.Jupiter.resume();
  }
}

export function JupiterTerminal() {
  const initialised = useRef(false);

  const initJupiter = useCallback(() => {
    if (initialised.current || !window.Jupiter) return;
    initialised.current = true;

    window.Jupiter.init({
      // Modal mode: Jupiter renders as a full overlay triggered by resume()
      displayMode: "modal",

      // Use the project RPC; fall back to devnet for safety
      endpoint:
        process.env.NEXT_PUBLIC_RPC_ENDPOINT ??
        "https://api.devnet.solana.com",

      strictTokenList: false,

      // Pre-fill: merchant is swapping earnings → output to USDC by default
      formProps: {
        initialInputMint: "So11111111111111111111111111111111111111112", // SOL
        initialOutputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      },

      // Jupiter Terminal appearance
      containerStyles: { zIndex: 9999 },
    });
  }, []);

  useEffect(() => {
    // If the SDK loaded synchronously (cached), init immediately
    if (window.Jupiter) {
      initJupiter();
      return;
    }

    // Otherwise wait for the SDK's own ready event
    document.addEventListener("jupiter-terminal-ready", initJupiter);
    return () => {
      document.removeEventListener("jupiter-terminal-ready", initJupiter);
    };
  }, [initJupiter]);

  // No visible DOM — Jupiter mounts its own portal
  return null;
}
