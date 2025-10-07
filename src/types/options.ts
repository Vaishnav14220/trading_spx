export interface OptionTrade {
  timestamp: string;
  contract: string;
  quantity: number;
  price: number;
  exchange: string;
  bidAsk: string;
  delta: string;
  iv: string;
  underlyingPrice: number;
  type: 'C' | 'P';
  strike: number;
  breakeven: number;
  absDelta: number;
}

export interface OptionsSummary {
  totalCallVolume: number;
  totalPutVolume: number;
  averageCallPrice: number;
  averagePutPrice: number;
  averageCallBreakeven: number;
  averagePutBreakeven: number;
}

export interface ParsedOptionData {
  trades: OptionTrade[];
  summary: OptionsSummary;
}