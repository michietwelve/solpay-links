/** @type {import('next').NextConfig} */

// The production Railway API URL — single source of truth
const RAILWAY_API = "https://biepay-links-production.up.railway.app";

const nextConfig = {
  env: {
    // On Vercel (process.env.VERCEL === "1"), ALWAYS use the Railway URL.
    // This prevents a misconfigured localhost URL in Vercel's dashboard from
    // being baked into the production bundle, causing "Failed to fetch" errors.
    NEXT_PUBLIC_API_URL: process.env.VERCEL
      ? RAILWAY_API
      : (process.env.NEXT_PUBLIC_API_URL ?? RAILWAY_API),
    NEXT_PUBLIC_RPC_ENDPOINT:
      process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com",
  },
};
module.exports = nextConfig;

