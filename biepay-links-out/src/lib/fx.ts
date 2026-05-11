// lib/fx.ts
// FX rate service with live rates (5-min cache) and hardcoded fallback.

export type FiatCurrency = 'NGN' | 'IDR' | 'INR' | 'USD';

// Fallback rates (1 USDC = X Fiat) — used when the price API is unavailable
const FALLBACK_FIAT_RATES: Record<FiatCurrency, number> = {
  NGN: 1500,
  IDR: 16000,
  INR: 83.5,
  USD: 1,
};

// PPP (Purchasing Power Parity) multipliers
export const PPP_MULTIPLIER: Record<FiatCurrency, number> = {
  NGN: 0.6,
  IDR: 0.7,
  INR: 0.7,
  USD: 1.0,
};

// ─── Live rate cache ──────────────────────────────────────────────────────────

interface RateCache {
  rates: Record<FiatCurrency, number>;
  fetchedAt: number;
}

let _rateCache: RateCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchLiveRates(): Promise<Record<FiatCurrency, number>> {
  try {
    // Use CoinGecko's free API to get USDC→fiat rates
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn,idr,inr,usd',
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) throw new Error('CoinGecko rate fetch failed');
    const data = await res.json();
    const usdc = data['usd-coin'];
    return {
      NGN: usdc?.ngn ?? FALLBACK_FIAT_RATES.NGN,
      IDR: usdc?.idr ?? FALLBACK_FIAT_RATES.IDR,
      INR: usdc?.inr ?? FALLBACK_FIAT_RATES.INR,
      USD: usdc?.usd ?? 1,
    };
  } catch (err) {
    console.warn('[fx] Live rate fetch failed, using fallback rates:', err);
    return FALLBACK_FIAT_RATES;
  }
}

export async function getLiveFiatRates(): Promise<Record<FiatCurrency, number>> {
  const now = Date.now();
  if (_rateCache && now - _rateCache.fetchedAt < CACHE_TTL_MS) {
    return _rateCache.rates;
  }
  const rates = await fetchLiveRates();
  _rateCache = { rates, fetchedAt: now };
  return rates;
}

// ─── Sync helpers (use fallback for non-async contexts) ───────────────────────

export function getFiatEquivalent(usdcAmount: number, currency: FiatCurrency): string {
  const rates = _rateCache?.rates ?? FALLBACK_FIAT_RATES;
  const rate = rates[currency] ?? 1;
  const converted = usdcAmount * rate;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(converted);
}

export function detectLocalCurrency(ipOrRegion?: string): FiatCurrency {
  if (ipOrRegion === 'ID') return 'IDR';
  if (ipOrRegion === 'IN') return 'INR';
  if (ipOrRegion === 'US') return 'USD';
  // Default to NGN for emerging markets showcase
  return 'NGN';
}

// Prime the cache on server startup (fire-and-forget)
fetchLiveRates().then(rates => {
  _rateCache = { rates, fetchedAt: Date.now() };
  console.log('[fx] Rate cache primed:', rates);
}).catch(() => {});
