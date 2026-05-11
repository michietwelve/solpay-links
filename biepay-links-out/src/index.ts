import "dotenv/config";

// ─── BigInt Serialization Patch ──────────────────────────────────────────
// Prisma and Solana records often contain BigInts which native JSON cannot serialize.
(BigInt.prototype as any).toJSON = function() { return this.toString() };

import express from "express";
import morgan from "morgan";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { actionsHeaders } from "./middleware/actions";
import actionsRouter from "./routes/actions";
import linksRouter from "./routes/links";
import actionsJsonRouter from "./routes/actionsJson";
import payRouter from "./routes/pay";
import merchantsRouter from "./routes/merchants";
import analyticsRouter from "./routes/analytics";
import debugRouter from "./routes/debug";
import fulfillmentRouter from "./routes/fulfillment";
import stealthRouter from "./routes/stealth";
import solanaWebhooks from "./routes/solanaWebhooks";
import { startEventListener } from "./lib/listener";
import { startWebhookWorker } from "./lib/webhookWorker";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const rpcUrl = process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

// Trust proxy for express-rate-limit to work correctly behind reverse proxies
app.set("trust proxy", 1);

// ─── Global middleware ────────────────────────────────────────────────────

app.use(morgan("dev"));
app.use(express.json({ limit: "5mb" }));

// Enable standard CORS for all origins (Crucial for Vercel -> Railway communication)
app.use(cors());

// Basic security headers, but disabled for cross-domain API functionality
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false
}));

// ─── Rate Limiting (Institutional Protection) ─────────────────────────────

// Global API limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per window
  message: { message: "Too many requests from this IP, please try again later." }
});

// Stricter limiter for Blinks/Actions to protect the Fee Payer wallet
const actionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // limit each IP to 20 actions per 5 minutes
  message: { message: "Action rate limit exceeded. Please wait a few minutes." }
});

app.use("/api", globalLimiter);
app.use("/actions", actionLimiter);
app.use("/pay", globalLimiter);

// Solana Actions specific headers (Protocol versioning)
app.use((_req, res, next) => {
  res.setHeader("X-Action-Version", "2.4");
  res.setHeader("X-Blockchain-Ids", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────

// Required by Blinks spec — must be at root domain
app.use("/actions.json", actionsJsonRouter);

// Core Actions API — consumed by wallets (Phantom, Backpack)
app.use("/actions", actionsRouter);

// Merchant management API — consumed by dashboard
app.use("/api/links", linksRouter);

// Hosted payment page data — consumed by /pay/[linkId] Next.js page
app.use("/pay", payRouter);

// Merchant profile settings
app.use("/api/merchants", merchantsRouter);

// Analytics
app.use("/api/analytics", analyticsRouter);
app.use("/api/webhooks", solanaWebhooks);

// Debug
app.use("/api/debug", debugRouter);

// Fulfillment
app.use("/api/fulfillment", fulfillmentRouter);

// Stealth
app.use("/api/stealth", stealthRouter);

// ─── Health check ─────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  let feePayerBalance = null;
  const secret = process.env.FEE_PAYER_SECRET;
  
  if (secret) {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(secret));
      const bal = await connection.getBalance(keypair.publicKey);
      feePayerBalance = bal / LAMPORTS_PER_SOL;
      
      if (feePayerBalance < 0.1) {
        console.warn(`[LIQUIDITY ALERT] Fee Payer balance low: ${feePayerBalance} SOL`);
      }
    } catch (e) {
      console.error("[Health] Failed to fetch fee payer balance", e);
    }
  }

  res.json({
    status: "ok",
    service: "biepay-links-api",
    version: "1.8.0-institutional",
    rpc: rpcUrl,
    feePayer: feePayerBalance !== null ? `${feePayerBalance} SOL` : "not configured",
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 fallback ─────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ─── Global error handler ────────────────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[unhandled error]", err);
    res.status(500).json({ message: "Internal server error" });
  }
);

// ─── Start ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 BiePay Links API running on port ${PORT}`);
  console.log(`   Health : http://localhost:${PORT}/health`);
  console.log(`   Actions: http://localhost:${PORT}/actions/:linkId`);
  console.log(`   Links  : http://localhost:${PORT}/api/links`);
  console.log(`   Pay    : http://localhost:${PORT}/pay/:linkId`);
  console.log(`   RPC    : ${rpcUrl}`);

  // Start on-chain event listener for payment confirmations
  const unsubscribe = startEventListener(connection);

  // Start background webhook processor
  const stopWorker = startWebhookWorker();

  // Clean shutdown
  process.on("SIGTERM", () => { unsubscribe(); stopWorker(); process.exit(0); });
  process.on("SIGINT",  () => { unsubscribe(); stopWorker(); process.exit(0); });
});

export default app;
