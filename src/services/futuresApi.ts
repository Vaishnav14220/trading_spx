import { getAuthService, BASE_URL } from './capitalAuth';
import { DEFAULT_SPOT_EPIC, getStoredFuturesEpic } from '../utils/marketDefaults';

// Get EPICs from localStorage or use defaults
function getSpotEpic(): string {
  return localStorage.getItem('market_spot_epic') || DEFAULT_SPOT_EPIC;
}

function getFuturesEpic(): string {
  return getStoredFuturesEpic();
}

interface MarketDetails {
  instrumentName: string;
  epic: string;
  bid: number;
  offer: number;
  updateTime: string;
  marketStatus: string;
}

export interface FuturesSpreadData {
  spotPrice: number;
  futuresPrice: number;
  spread: number;
  spreadPercent: number;
  lastUpdate: Date;
  spotEpic: string;
  futuresEpic: string;
}

async function fetchMarketData(epic: string, tokens: any): Promise<MarketDetails> {
  console.log(`[Futures API] Fetching market data for: ${epic}`);
  
  const response = await fetch(`${BASE_URL}/api/v1/markets/${epic}`, {
    method: 'GET',
    headers: {
      'X-SECURITY-TOKEN': tokens.securityToken,
      'CST': tokens.cst,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Futures API] Failed to fetch ${epic}:`, errorText);
    throw new Error(`Failed to fetch ${epic}: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[Futures API] Data for ${epic}:`, data);
  
  return data.snapshot || data;
}

export async function fetchFuturesSpread(): Promise<FuturesSpreadData> {
  try {
    const authService = getAuthService();
    const tokens = await authService.getValidTokens();

    const spotEpic = getSpotEpic();
    const futuresEpic = getFuturesEpic();

    console.log(`[Futures API] Using Spot: ${spotEpic}, Futures: ${futuresEpic}`);

    const spotData = await fetchMarketData(spotEpic, tokens);
    let futuresData: MarketDetails | null = null;

    try {
      futuresData = await fetchMarketData(futuresEpic, tokens);
    } catch (error) {
      console.warn(`[Futures API] Futures epic ${futuresEpic} unavailable. Spread widget will use spot as fallback.`, error);
    }

    // Use mid price (average of bid and offer)
    const spotPrice = (spotData.bid + spotData.offer) / 2;
    const futuresPrice = futuresData ? (futuresData.bid + futuresData.offer) / 2 : spotPrice;
    const spread = futuresPrice - spotPrice;
    const spreadPercent = (spread / spotPrice) * 100;

    console.log(`[Futures API] SUCCESS - Spot: ${spotPrice.toFixed(2)}, Futures: ${futuresPrice.toFixed(2)}, Spread: ${spread.toFixed(2)}`);

    return {
      spotPrice,
      futuresPrice,
      spread,
      spreadPercent,
      lastUpdate: new Date(),
      spotEpic,
      futuresEpic,
    };
  } catch (error) {
    console.error('[Futures API] Failed to fetch spread:', error);
    throw error;
  }
}
