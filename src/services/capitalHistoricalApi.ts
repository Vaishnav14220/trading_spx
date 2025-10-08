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

export async function fetchCapitalHistoricalData(days: number = 3): Promise<ChartData[]> {
  try {
    console.log(`[Capital API] Starting fetch for ${days} days of historical data...`);
    const startTime = Date.now();
    
    const authService = getAuthService();
    const tokens = await authService.getValidTokens();
    console.log(`[Capital API] Got auth tokens in ${Date.now() - startTime}ms`);

    // Try multiple endpoint formats to find what works
    const endpoints = [
      // Format 1: Using max parameter
      `${BASE_URL}/api/v1/prices/${EPIC}?resolution=MINUTE&max=${Math.min(days * 24 * 60, 1000)}`,
      
      // Format 2: Using from/to dates
      `${BASE_URL}/api/v1/prices/${EPIC}?resolution=MINUTE&from=${new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()}&to=${new Date().toISOString()}`,
      
      // Format 3: Using pageSize
      `${BASE_URL}/api/v1/prices/${EPIC}?resolution=MINUTE&pageSize=${Math.min(days * 24 * 60, 1000)}`,
    ];

    let lastError = null;

    for (let i = 0; i < endpoints.length; i++) {
      const url = endpoints[i];
      console.log(`[Capital API] Attempt ${i + 1}/${endpoints.length}: ${url}`);

      try {
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
          console.warn(`[Capital API] Endpoint ${i + 1} failed:`, response.status, errorText);
          lastError = new Error(`${response.status}: ${errorText}`);
          continue; // Try next endpoint
        }

        const data: CapitalHistoricalResponse = await response.json();
        console.log('[Capital API] Response keys:', Object.keys(data));

        if (!data.prices || !Array.isArray(data.prices)) {
          console.warn('[Capital API] Invalid data format, trying next endpoint');
          lastError = new Error('Invalid data format');
          continue;
        }

        if (data.prices.length === 0) {
          console.warn('[Capital API] No prices returned, trying next endpoint');
          lastError = new Error('No prices returned');
          continue;
        }

        // Success! Transform the data
        const chartData: ChartData[] = data.prices.map((price) => {
          const timestamp = new Date(price.snapshotTimeUTC).getTime() / 1000;
          
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
        console.log(`[Capital API] ✅ SUCCESS! Loaded ${chartData.length} candles in ${totalTime}ms`);
        console.log(`[Capital API] Date range: ${new Date(chartData[0].time * 1000).toLocaleString()} to ${new Date(chartData[chartData.length - 1].time * 1000).toLocaleString()}`);
        
        return chartData;

      } catch (error) {
        console.error(`[Capital API] Exception on endpoint ${i + 1}:`, error);
        lastError = error;
        continue;
      }
    }

    // All endpoints failed
    console.error('[Capital API] ❌ All endpoints failed');
    throw lastError || new Error('Failed to fetch historical data from all endpoints');

  } catch (error) {
    console.error('[Capital API] ❌ Fatal error:', error);
    throw error;
  }
}
