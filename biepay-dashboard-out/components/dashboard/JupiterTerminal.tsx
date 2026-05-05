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
  if (typeof window !== "undefined" && window.Jupiter) {
    if (!isJupiterInitialized) {
      isJupiterInitialized = true;
      window.Jupiter.init({
        // Modal mode: Jupiter renders as a full overlay
        displayMode: "modal",

        // We omit 'endpoint' here so Jupiter uses its internal robust RPC,
        // preventing the "Your RPC is not responding" errors.

        strictTokenList: false,

        formProps: {
          initialInputMint: "So11111111111111111111111111111111111111112", // SOL
          initialOutputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        },
        containerStyles: { zIndex: 9999 },
      });
    } else {
      window.Jupiter.resume();
    }
  }
}

export function JupiterTerminal() {
  // No visible DOM — Jupiter mounts its own portal when initialized
  return null;
}
