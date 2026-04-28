/**
 * src/lib/listener.ts
 *
 * Subscribes to SolPay Links program logs via `onLogs`.
 * On every confirmed PaymentMade event:
 *   1. Updates the payment record in the store
 *   2. Fires merchant webhooks (if configured)
 *
 * Start this alongside the Express server in production:
 *   import { startEventListener } from "./lib/listener";
 *   startEventListener(connection);
 */

import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { incrementPaymentCount } from "./store";

const PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

function parseSolPayLinkId(logs: string[]): string | null {
  // Look for "Program log: SolPay:XXXXXXXXXX"
  for (const log of logs) {
    const match = log.match(/SolPay:([A-Za-z0-9_-]{1,32})/);
    if (match) return match[1];
  }
  return null;
}

// ─── Webhook delivery ────────────────────────────────────────────────────────

interface WebhookPayload {
  event: "payment.confirmed";
  signature: string;
  timestamp: string;
}

async function deliverWebhook(url: string, payload: WebhookPayload): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[webhook] ${url} responded ${res.status}`);
    } else {
      console.log(`[webhook] delivered to ${url}`);
    }
  } catch (err) {
    console.error(`[webhook] failed to deliver to ${url}:`, err);
  }
}

// ─── Listener ────────────────────────────────────────────────────────────────

export function startEventListener(connection: Connection): () => void {
  console.log("[listener] Subscribing to SolPay Links program logs...");

  const subscriptionId = connection.onLogs(
    PROGRAM_ID,
    async (logs: Logs) => {
      if (logs.err) return; // skip failed transactions

      const { signature, logs: logLines } = logs;

      const linkId = parseSolPayLinkId(logLines);
      if (!linkId) return;

      console.log(`[listener] Payment confirmed for link ${linkId}: ${signature}`);

      // Credit the link in our store
      await incrementPaymentCount(linkId);

      // Fire webhooks — in production, look up merchant webhook URL from DB
      const webhookUrl = process.env.WEBHOOK_URL;
      if (webhookUrl) {
        await deliverWebhook(webhookUrl, {
          event: "payment.confirmed",
          signature,
          timestamp: new Date().toISOString(),
        });
      }
    },
    "confirmed"
  );

  console.log(`[listener] Subscribed (id: ${subscriptionId})`);

  // Return an unsubscribe function
  return () => {
    connection.removeOnLogsListener(subscriptionId);
    console.log("[listener] Unsubscribed.");
  };
}
