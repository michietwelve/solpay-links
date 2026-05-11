import { Resend } from 'resend';
import { prisma } from './db';
import { queueWebhook } from './webhookWorker';
import { getMerchantProfile } from './merchant';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Use your own verified domain in RESEND_FROM_EMAIL, or leave blank to use Resend's free sender
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

export async function sendPaymentNotification(email: string, details: {
  amount: string;
  token: string;
  linkLabel: string;
  customerWallet: string;
  signature: string;
}) {
  console.log(`[notification] Attempting to send email to ${email} for payment on "${details.linkLabel}"`);

  if (!resend) {
    console.warn("[notification] No RESEND_API_KEY found. Email skipped (Mock success).");
    return { success: true, mock: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `BiePay <${FROM_EMAIL}>`,
      to: [email],
      subject: `💰 Payment Received: ${details.amount} ${details.token}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #111;">Payment Confirmed!</h2>
          <p style="color: #666;">You just received a new payment through BiePay.</p>
          
          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Link:</strong> ${details.linkLabel}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${details.amount} ${details.token}</p>
            <p style="margin: 5px 0;"><strong>Payer:</strong> <code style="background: #eee; padding: 2px 4px;">${details.customerWallet}</code></p>
          </div>

          <a href="https://explorer.solana.com/tx/${details.signature}${process.env.IS_MAINNET !== 'true' ? '?cluster=devnet' : ''}" 
             style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; border-radius: 5px; text-decoration: none; font-weight: bold;">
            View on Explorer
          </a>

          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            Institutional Payment Infrastructure by BiePay
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[notification] Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[notification] Failed to send email:", err);
    return { success: false, error: err };
  }
}

export async function deliverNotifications(link: any, payment: any) {
  try {
    const merchant = await getMerchantProfile(link.merchantId);
    if (!merchant) return;

    // 1. Email Notification
    if (merchant.email) {
      const decimals = 9; // Fallback
      const amountHuman = (BigInt(payment.amountLamports) / BigInt(10 ** decimals)).toString();
      
      await sendPaymentNotification(merchant.email, {
        amount: amountHuman,
        token: payment.token,
        linkLabel: link.label,
        customerWallet: payment.payerWallet,
        signature: payment.signature || "unknown"
      });
    }

    // 2. Webhook Notification
    if (merchant.webhookUrl) {
      await queueWebhook(link.merchantId, merchant.webhookUrl, {
        event: "payment.confirmed",
        signature: payment.signature,
        linkId: link.id,
        payer: payment.payerWallet,
        amount: payment.amountLamports,
        token: payment.token,
        timestamp: new Date().toISOString()
      }, merchant.webhookSecret);
    }
  } catch (err) {
    console.error("[deliverNotifications] Failed to process:", err);
  }
}
