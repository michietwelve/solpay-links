// lib/fx.ts

export type FiatCurrency = 'NGN' | 'IDR' | 'INR' | 'USD';

// Hardcoded rates for the hackathon demo to ensure 100% uptime without API rate limits.
// 1 USDC = X Fiat
export const FIAT_RATES: Record<FiatCurrency, number> = {
  NGN: 1500,     // Nigerian Naira
  IDR: 16000,    // Indonesian Rupiah
  INR: 83.5,     // Indian Rupee
  USD: 1,        // US Dollar
};

// PPP (Purchasing Power Parity) multipliers
// If a user is from a specific region, we can apply an automatic discount.
export const PPP_MULTIPLIER: Record<FiatCurrency, number> = {
  NGN: 0.6, // 40% discount for Nigeria
  IDR: 0.7, // 30% discount for Indonesia
  INR: 0.7, // 30% discount for India
  USD: 1.0, // Full price
};

export function getFiatEquivalent(usdcAmount: number, currency: FiatCurrency): string {
  const rate = FIAT_RATES[currency];
  const converted = usdcAmount * rate;
  
  // Format beautifully (e.g. 7,500 NGN)
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(converted);
}

export function detectLocalCurrency(ipOrRegion?: string): FiatCurrency {
  // In a real production app, we would use IP geolocation (e.g., from Vercel/Railway headers)
  // For the hackathon demo, we will default to NGN to show off the localization to judges,
  // or parse an incoming header if provided.
  if (ipOrRegion === 'ID') return 'IDR';
  if (ipOrRegion === 'IN') return 'INR';
  if (ipOrRegion === 'US') return 'USD';
  
  // Default to NGN to showcase emerging market focus
  return 'NGN';
}
