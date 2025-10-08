import { ChartData } from '../types/chart';
import { getAuthService, BASE_URL } from './capitalAuth';

const EPIC = "US500";

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

export async function fetchCapitalHistoricalData(days: number = 7): Promise<ChartData[]> {
  try {
    console.log(`[Capital API] Starting fetch for ${days} days of historical data...`);
    const startTime = Date.now();
    
    const authService = getAuthService();
    const tokens = await authService.getValidTokens();
    console.log(`[Capital API] Got auth tokens in ${Date.now() - startTime}ms`);

    // Calculate date range
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    // Format dates as ISO strings
    const fromStr = from.toISOString();
    const toStr = to.toISOString();

    // MINUTE resolution for 1-minute candles
    const resolution = 'MINUTE';

    const url = `${BASE_URL}/api/v1/prices/${EPIC}?resolution=${resolution}&from=${fromStr}&to=${toStr}`;
    console.log(`[Capital API] Fetching from: ${url}`);

    const fetchStart = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-SECURITY-TOKEN': tokens.securityToken,
        'CST': tokens.cst,
      },
    });
    console.log(`[Capital API] API response received in ${Date.now() - fetchStart}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch historical data:', response.status, errorText);
      throw new Error(`Failed to fetch historical data: ${response.status}`);
    }

    const data: CapitalHistoricalResponse = await response.json();

    if (!data.prices || !Array.isArray(data.prices)) {
      throw new Error('Invalid historical data format');
    }

    // Transform Capital.com data to our ChartData format
    const chartData: ChartData[] = data.prices.map((price) => {
      // Parse the timestamp and convert to Unix timestamp (seconds)
      const timestamp = new Date(price.snapshotTimeUTC).getTime() / 1000;
      
      // Use bid prices (or you can use mid prices by averaging bid and ask)
      return {
        time: timestamp,
        open: price.openPrice.bid,
        high: price.highPrice.bid,
        low: price.lowPrice.bid,
        close: price.closePrice.bid,
      };
    });

    // Sort by time ascending
    chartData.sort((a, b) => a.time - b.time);

    const totalTime = Date.now() - startTime;
    console.log(`[Capital API] ✅ Loaded ${chartData.length} historical candles in ${totalTime}ms`);
    return chartData;

  } catch (error) {
    console.error('[Capital API] ❌ Failed to fetch historical data:', error);
    throw error;
  }
}
