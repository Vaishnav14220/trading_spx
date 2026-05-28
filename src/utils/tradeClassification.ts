import { OptionTrade } from '../types/options';

export const HIGH_DELTA_THRESHOLD = 0.64;
export const COPY_DELTA_THRESHOLD = HIGH_DELTA_THRESHOLD;
export const MID_DELTA_RANGE = { min: 0.50, max: 0.60 };

export type TradeBias = 'bullish' | 'bearish';
export type LevelDirection = 'above' | 'below';

export interface ParsedBidAsk {
  bid: number | null;
  ask: number | null;
  mid: number;
  isValid: boolean;
}

export interface ClassifiedTrade {
  bias: TradeBias;
  direction: LevelDirection;
  isBuy: boolean;
  midPrice: number;
  premium: number;
  confidence: 'high' | 'low';
}

export function getTradePremium(trade: OptionTrade): number {
  return trade.price * trade.quantity * 100;
}

export function parseBidAsk(bidAsk: string, fallbackPrice: number): ParsedBidAsk {
  const [rawBid, rawAsk] = bidAsk.split(/[xX]/).map(part => Number.parseFloat(part));
  const hasValidBidAsk = Number.isFinite(rawBid) && Number.isFinite(rawAsk);

  if (!hasValidBidAsk) {
    return {
      bid: null,
      ask: null,
      mid: fallbackPrice,
      isValid: false,
    };
  }

  return {
    bid: rawBid,
    ask: rawAsk,
    mid: (rawBid + rawAsk) / 2,
    isValid: true,
  };
}

export function classifyTrade(trade: OptionTrade): ClassifiedTrade {
  const bidAsk = parseBidAsk(trade.bidAsk, trade.price);
  const isBuy = trade.price >= bidAsk.mid;
  const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);

  return {
    bias: isBullish ? 'bullish' : 'bearish',
    direction: isBullish ? 'above' : 'below',
    isBuy,
    midPrice: bidAsk.mid,
    premium: getTradePremium(trade),
    confidence: bidAsk.isValid ? 'high' : 'low',
  };
}

export function getBreakevenLevel(trade: OptionTrade, roundFigures: boolean): number {
  return roundFigures ? Math.round(trade.breakeven) : trade.breakeven;
}

export function parseTradeTimestampMs(timestamp: string): number | null {
  const parsedTime = new Date(timestamp).getTime();
  return Number.isFinite(parsedTime) ? parsedTime : null;
}

export function formatCompactPremium(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) return `$${(absValue / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `$${(absValue / 1_000).toFixed(1)}K`;
  return `$${absValue.toFixed(0)}`;
}
