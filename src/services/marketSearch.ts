import { getAuthService, BASE_URL } from './capitalAuth';

export interface Market {
  epic: string;
  instrumentName: string;
  marketStatus: string;
  instrumentType: string;
  expiry: string;
  bid: number;
  offer: number;
}

export async function searchMarkets(searchTerm: string = ''): Promise<Market[]> {
  try {
    const authService = getAuthService();
    const tokens = await authService.getValidTokens();

    // Search for markets - use search endpoint
    const url = searchTerm 
      ? `${BASE_URL}/api/v1/markets?searchTerm=${encodeURIComponent(searchTerm)}`
      : `${BASE_URL}/api/v1/markets`;
    
    console.log('[Market Search] Fetching markets with term:', searchTerm);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-SECURITY-TOKEN': tokens.securityToken,
        'CST': tokens.cst,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Market Search] Failed:', errorText);
      throw new Error(`Failed to fetch markets: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Market Search] Response:', data);
    
    // The response structure might be { markets: [...] } or just [...]
    const markets = data.markets || data;
    
    return markets.map((m: any) => ({
      epic: m.epic,
      instrumentName: m.instrumentName || m.name || m.epic,
      marketStatus: m.marketStatus || 'UNKNOWN',
      instrumentType: m.instrumentType || 'UNKNOWN',
      expiry: m.expiry || 'N/A',
      bid: m.bid || 0,
      offer: m.offer || 0,
    }));
  } catch (error) {
    console.error('[Market Search] Error:', error);
    throw error;
  }
}

export async function getMarketDetails(epic: string): Promise<Market | null> {
  try {
    const authService = getAuthService();
    const tokens = await authService.getValidTokens();

    const response = await fetch(`${BASE_URL}/api/v1/markets/${epic}`, {
      method: 'GET',
      headers: {
        'X-SECURITY-TOKEN': tokens.securityToken,
        'CST': tokens.cst,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const snapshot = data.snapshot || data;
    
    return {
      epic: snapshot.epic,
      instrumentName: snapshot.instrumentName || snapshot.name || epic,
      marketStatus: snapshot.marketStatus || 'UNKNOWN',
      instrumentType: snapshot.instrumentType || 'UNKNOWN',
      expiry: snapshot.expiry || 'N/A',
      bid: snapshot.bid || 0,
      offer: snapshot.offer || 0,
    };
  } catch (error) {
    console.error(`[Market Search] Error fetching ${epic}:`, error);
    return null;
  }
}

