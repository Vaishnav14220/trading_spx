import { ChartData } from '../types/chart';
import { getAuthService, BASE_URL, SessionTokens } from './capitalAuth';

const EPIC = "US500";
const DEFAULT_HISTORICAL_DAYS = 5;
const MAX_PRICES_PER_REQUEST = 1000;
const HISTORICAL_FETCH_CONCURRENCY = 3;
const ONE_MINUTE_MS = 60 * 1000;
const CACHE_KEY = 'capital_historical_us500_cache';
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CapitalHistoricalPrice {
  snapshotTime: string;
  snapshotTimeUTC: string;
  openPrice: {
    bid: number;
    ask: number;
  };
  closePrice: {
    bid: number;
    ask: number;
  };
  highPrice: {
    bid: number;
    ask: number;
  };
  lowPrice: {
    bid: number;
    ask: number;
  };
  lastTradedVolume: number;
}

interface CapitalHistoricalResponse {
  prices: CapitalHistoricalPrice[];
}

interface HistoricalCache {
  days: number;
  timestamp: number;
  data: ChartData[];
}

interface HistoricalChunk {
  chunkNumber: number;
  from: string;
  to: string;
  url: string;
}

function formatCapitalDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

function transformPrices(prices: CapitalHistoricalPrice[]): ChartData[] {
  return prices.map((price) => {
    const timestamp = new Date(price.snapshotTimeUTC).getTime() / 1000;

    return {
      time: timestamp,
      open: price.openPrice.bid,
      high: price.highPrice.bid,
      low: price.lowPrice.bid,
      close: price.closePrice.bid,
    };
  });
}

function buildPricesUrl(params: Record<string, string | number>): string {
  const url = new URL(`/api/v1/prices/${EPIC}`, BASE_URL);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function readHistoricalCache(days: number, allowStale = false): ChartData[] | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  try {
    const rawCache = sessionStorage.getItem(CACHE_KEY);

    if (!rawCache) {
      return null;
    }

    const cache = JSON.parse(rawCache) as HistoricalCache;
    const isFresh = Date.now() - cache.timestamp < CACHE_TTL_MS;

    if (cache.days !== days || cache.data.length === 0 || (!allowStale && !isFresh)) {
      return null;
    }

    console.log(`[Capital API] Using ${isFresh ? 'fresh' : 'stale'} cached historical data (${cache.data.length} candles)`);
    return cache.data;
  } catch (error) {
    console.warn('[Capital API] Failed to read historical cache:', error);
    return null;
  }
}

function writeHistoricalCache(days: number, data: ChartData[]) {
  if (typeof sessionStorage === 'undefined' || data.length === 0) {
    return;
  }

  try {
    const cache: HistoricalCache = {
      days,
      timestamp: Date.now(),
      data,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('[Capital API] Failed to write historical cache:', error);
  }
}

function buildHistoricalChunks(days: number): HistoricalChunk[] {
  const endTime = Date.now();
  const startRange = endTime - days * 24 * 60 * 60 * 1000;
  const chunkDurationMs = (MAX_PRICES_PER_REQUEST - 1) * ONE_MINUTE_MS;
  const chunks: HistoricalChunk[] = [];
  let chunkNumber = 1;

  for (
    let chunkStart = startRange;
    chunkStart < endTime;
    chunkStart += chunkDurationMs + ONE_MINUTE_MS
  ) {
    const chunkEnd = Math.min(chunkStart + chunkDurationMs, endTime);
    const from = formatCapitalDate(new Date(chunkStart));
    const to = formatCapitalDate(new Date(chunkEnd));
    const url = buildPricesUrl({
      resolution: 'MINUTE',
      max: MAX_PRICES_PER_REQUEST,
      from,
      to,
    });

    chunks.push({
      chunkNumber,
      from,
      to,
      url,
    });

    chunkNumber += 1;
  }

  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker()
  );

  await Promise.all(workers);
  return results;
}

async function fetchHistoricalChunk(url: string, tokens: SessionTokens): Promise<ChartData[]> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-SECURITY-TOKEN': tokens.securityToken,
      'CST': tokens.cst,
    },
  });

  console.log(`[Capital API] Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status}: ${errorText}`);
  }

  const data: CapitalHistoricalResponse = await response.json();
  console.log('[Capital API] Response keys:', Object.keys(data));

  if (!data.prices || !Array.isArray(data.prices)) {
    throw new Error('Invalid data format');
  }

  return transformPrices(data.prices);
}

async function fetchRecentFallback(tokens: SessionTokens): Promise<ChartData[]> {
  const url = buildPricesUrl({
    resolution: 'MINUTE',
    max: MAX_PRICES_PER_REQUEST,
  });

  console.warn('[Capital API] Falling back to the most recent 1000 one-minute candles');
  const fallbackData = await fetchHistoricalChunk(url, tokens);
  return fallbackData.sort((a, b) => a.time - b.time);
}

export async function fetchCapitalHistoricalData(days: number = DEFAULT_HISTORICAL_DAYS): Promise<ChartData[]> {
  try {
    console.log(`[Capital API] Starting fetch for ${days} days of historical data...`);
    const startTime = Date.now();
    const cachedData = readHistoricalCache(days);

    if (cachedData) {
      return cachedData;
    }

    const authService = getAuthService();
    const tokens = await authService.getValidTokens();
    console.log(`[Capital API] Got auth tokens in ${Date.now() - startTime}ms`);

    const chunks = buildHistoricalChunks(days).reverse();
    const allData = new Map<number, ChartData>();
    let lastError: unknown = null;

    await mapWithConcurrency(chunks, HISTORICAL_FETCH_CONCURRENCY, async ({ chunkNumber, from, to, url }) => {
      console.log(`[Capital API] Fetching chunk ${chunkNumber}: ${from} -> ${to}`);

      try {
        const chunkData = await fetchHistoricalChunk(url, tokens);

        if (chunkData.length === 0) {
          console.warn(`[Capital API] No prices returned for chunk ${chunkNumber}`);
        }

        chunkData.forEach((candle) => {
          allData.set(candle.time, candle);
        });
      } catch (error) {
        console.warn(`[Capital API] Chunk ${chunkNumber} failed:`, error);
        lastError = error;
      }
    });

    const chartData = Array.from(allData.values()).sort((a, b) => a.time - b.time);

    if (chartData.length === 0) {
      console.error('[Capital API] No historical data loaded');
      const fallbackData = await fetchRecentFallback(tokens);

      if (fallbackData.length > 0) {
        writeHistoricalCache(days, fallbackData);
        return fallbackData;
      }

      throw lastError || new Error('Failed to fetch historical data');
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Capital API] Loaded ${chartData.length} candles in ${totalTime}ms`);
    console.log(`[Capital API] Date range: ${new Date(chartData[0].time * 1000).toLocaleString()} to ${new Date(chartData[chartData.length - 1].time * 1000).toLocaleString()}`);

    writeHistoricalCache(days, chartData);
    return chartData;
  } catch (error) {
    console.error('[Capital API] Fatal error:', error);
    const staleCache = readHistoricalCache(days, true);

    if (staleCache) {
      return staleCache;
    }

    throw error;
  }
}
