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
import { incrementPaymentCount, confirmPayment } from "./store";
import { prisma } from "./db";

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
  linkId?: string;
  payer?: string;
  amount?: string;
  token?: string;
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

      const refId = parseSolPayLinkId(logLines);
      if (!refId) return;

      console.log(`[listener] Payment confirmed for ref ${refId}: ${signature}`);

      let linkId = refId;
      let payer: string | undefined;
      let amount: string | undefined;
      let token: string | undefined;

      if (refId.length === 10) {
        // Old style: refId is linkId
        await incrementPaymentCount(refId);
      } else {
        // New style: refId is recordId
        const record = await prisma.paymentRecord.findUnique({ where: { id: refId } });
        if (record) {
          await confirmPayment(refId, signature);
          linkId = record.linkId;
          payer = record.payerWallet;
          amount = record.amountLamports;
          token = record.token;
        } else {
          console.warn(`[listener] Could not find PaymentRecord for id ${refId}`);
          return;
        }
      }

      // Fire webhooks — in production, look up merchant webhook URL from DB
      const webhookUrl = process.env.WEBHOOK_URL;
      if (webhookUrl) {
        await deliverWebhook(webhookUrl, {
          event: "payment.confirmed",
          signature,
          linkId,
          payer,
          amount,
          token,
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
