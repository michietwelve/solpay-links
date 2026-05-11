import { createHmac } from "crypto";
import { prisma } from "./db";

const MAX_RETRIES = 5;

async function processWebhooks() {
  const now = new Date();
  
  // Find jobs that are pending and ready to run
  const jobs = await prisma.webhookJob.findMany({
    where: {
      status: "pending",
      nextRunAt: { lte: now }
    },
    take: 20 // Process in small batches
  });

  for (const job of jobs) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (job.secret) {
        const signature = createHmac("sha256", job.secret).update(job.payload).digest("hex");
        headers["X-BiePay-Signature"] = signature;
      }

      const res = await fetch(job.url, {
        method: "POST",
        headers,
        body: job.payload,
        signal: AbortSignal.timeout(10_000),
      });

      // Also log the attempt
      await prisma.webhookLog.create({
        data: {
          merchantId: job.merchantId,
          url: job.url,
          event: JSON.parse(job.payload).event || "unknown",
          payload: job.payload,
          status: res.status,
          success: res.ok,
        }
      });

      if (res.ok) {
        // Success
        await prisma.webhookJob.update({
          where: { id: job.id },
          data: { status: "completed", attempts: job.attempts + 1 }
        });
      } else {
        // Failed but didn't throw
        handleJobFailure(job);
      }
    } catch (err) {
      // Network error, timeout, etc.
      await prisma.webhookLog.create({
        data: {
          merchantId: job.merchantId,
          url: job.url,
          event: JSON.parse(job.payload).event || "unknown",
          payload: job.payload,
          status: 0,
          success: false,
        }
      });
      handleJobFailure(job);
    }
  }
}

async function handleJobFailure(job: any) {
  const attempts = job.attempts + 1;
  if (attempts >= MAX_RETRIES) {
    await prisma.webhookJob.update({
      where: { id: job.id },
      data: { status: "failed", attempts }
    });
  } else {
    // Exponential backoff: 15s, 1m, 5m, 15m, etc.
    const delayMs = Math.pow(4, attempts) * 1000;
    const nextRunAt = new Date(Date.now() + delayMs);
    await prisma.webhookJob.update({
      where: { id: job.id },
      data: { attempts, nextRunAt }
    });
  }
}

export function startWebhookWorker() {
  console.log("[WebhookWorker] Starting persistent background queue...");
  // Poll every 10 seconds
  const interval = setInterval(processWebhooks, 10000);
  return () => clearInterval(interval);
}

export async function queueWebhook(merchantId: string, url: string, payload: any, secret?: string | null) {
  await prisma.webhookJob.create({
    data: {
      merchantId,
      url,
      payload: JSON.stringify(payload),
      secret,
    }
  });
}
