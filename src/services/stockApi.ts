import { ChartData } from '../types/chart';

const API_URL = 'https://api.investing.com/api/financialdata/1175153/historical/chart/?interval=PT1M&pointscount=160&endTime=' + Math.floor(Date.now() / 1000);

interface InvestingResponse {
  data: [number, number, number, number, number, number, number][]; // [timestamp, open, high, low, close, volume, ?]
  events: null;
}

let lastData: ChartData[] = [];
let lastFetchTime = 0;
const FETCH_INTERVAL = 60000; // Fetch new data every minute

export async function fetchSPXData(): Promise<ChartData[]> {
  try {
    // Calculate start time (24 hours ago)
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (24 * 60 * 60);
    
    const url = `https://api.investing.com/api/financialdata/1175153/historical/chart/?interval=PT1M&pointscount=160&startTime=${startTime}&endTime=${endTime}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch SPX data');
    }

    const data: InvestingResponse = await response.json();
    
    if (!Array.isArray(data?.data)) {
      throw new Error('Invalid data format');
    }

    // Transform the data into the required format and add 1 to all prices
    lastData = data.data.map(([timestamp, open, high, low, close]) => ({
      time: timestamp / 1000,
      open: open + 1,
      high: high + 1,
      low: low + 1,
      close: close + 1
    }));
    
    lastFetchTime = Date.now();
    return lastData;

  } catch (error) {
    console.error('API Error:', error);
    throw new Error('Failed to fetch SPX data. Please try again later.');
  }
}