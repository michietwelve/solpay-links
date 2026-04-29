import "dotenv/config";
import express from "express";
import morgan from "morgan";
import { Connection } from "@solana/web3.js";

import { actionsHeaders } from "./middleware/actions";
import actionsRouter from "./routes/actions";
import linksRouter from "./routes/links";
import actionsJsonRouter from "./routes/actionsJson";
import payRouter from "./routes/pay";
import { startEventListener } from "./lib/listener";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ─── Global middleware ────────────────────────────────────────────────────

app.use(morgan("dev"));
app.use(express.json());

// Solana Actions headers must be on every response
app.use(actionsHeaders);

// Handle CORS preflight
app.options("*", (_req, res) => {
  res.status(200).end();
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

// ─── Health check ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "solpay-links-api",
    version: "0.1.0",
    rpc: process.env.RPC_ENDPOINT ?? "devnet",
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
  console.log(`\n🚀 SolPay Links API running on port ${PORT}`);
  console.log(`   Health : http://localhost:${PORT}/health`);
  console.log(`   Actions: http://localhost:${PORT}/actions/:linkId`);
  console.log(`   Links  : http://localhost:${PORT}/api/links`);
  console.log(`   Pay    : http://localhost:${PORT}/pay/:linkId`);
  console.log(`   RPC    : ${process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com"}`);

  // Start on-chain event listener for payment confirmations
  const rpc = process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  
  try {
    const unsubscribe = startEventListener(connection);
    // Clean shutdown
    process.on("SIGTERM", () => { unsubscribe(); process.exit(0); });
    process.on("SIGINT",  () => { unsubscribe(); process.exit(0); });
  } catch (err) {
    console.error("❌ Failed to start payment listener:", err);
    console.warn("API will continue running but on-chain payments won't be automatically detected.");
  }
});

export default app;
