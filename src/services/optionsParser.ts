import { ParsedOptionData, OptionTrade, OptionsSummary } from '../types/options';
import { parseTimestamp } from '../utils/dateUtils';

const emptySummary = (): OptionsSummary => ({
  totalCallVolume: 0,
  totalPutVolume: 0,
  averageCallPrice: 0,
  averagePutPrice: 0,
  averageCallBreakeven: 0,
  averagePutBreakeven: 0,
});

export function summarizeOptionsTrades(trades: OptionTrade[]): OptionsSummary {
  const summary = emptySummary();

  let totalCallPrice = 0;
  let totalPutPrice = 0;
  let totalCallBreakeven = 0;
  let totalPutBreakeven = 0;
  let callCount = 0;
  let putCount = 0;

  trades.forEach(trade => {
    if (trade.type === 'C') {
      summary.totalCallVolume += trade.quantity;
      totalCallPrice += trade.price * trade.quantity;
      totalCallBreakeven += trade.breakeven * trade.quantity;
      callCount += trade.quantity;
    } else {
      summary.totalPutVolume += trade.quantity;
      totalPutPrice += trade.price * trade.quantity;
      totalPutBreakeven += trade.breakeven * trade.quantity;
      putCount += trade.quantity;
    }
  });

  return {
    ...summary,
    averageCallPrice: callCount > 0 ? totalCallPrice / callCount : 0,
    averagePutPrice: putCount > 0 ? totalPutPrice / putCount : 0,
    averageCallBreakeven: callCount > 0 ? totalCallBreakeven / callCount : 0,
    averagePutBreakeven: putCount > 0 ? totalPutBreakeven / putCount : 0,
  };
}

export function createParsedOptionData(trades: OptionTrade[]): ParsedOptionData {
  return {
    trades,
    summary: summarizeOptionsTrades(trades),
  };
}

export function parseOptionsData(data: string): ParsedOptionData {
  const lines = data.trim() ? data.trim().split('\n') : [];
  const trades: OptionTrade[] = [];

  lines.forEach(line => {
    const fields = line.trim().split('\t');
    if (fields.length < 9) return;
    
    // Parse and normalize timestamp
    const { timestamp, isTimeOnly } = parseTimestamp(fields[0]);
    
    // Extract contract details
    const contractParts = fields[1].split(' ');
    const type = contractParts[contractParts.length - 1] as 'C' | 'P';
    
    // Find the strike price - it's the numeric value before C/P
    let strike = 0;
    for (let i = contractParts.length - 2; i >= 0; i--) {
      const possibleStrike = parseFloat(contractParts[i]);
      if (!isNaN(possibleStrike)) {
        strike = possibleStrike;
        break;
      }
    }

    // Parse price - handle decimal points starting with .
    const priceStr = fields[3];
    const price = priceStr.startsWith('.') ? parseFloat('0' + priceStr) : parseFloat(priceStr);
    
    // Parse delta
    const deltaStr = fields[6];
    const delta = deltaStr.startsWith('.') ? parseFloat('0' + deltaStr) : parseFloat(deltaStr);
    
    // Calculate breakeven
    const breakeven = type === 'C' ? strike + price : strike - price;
    
    const trade: OptionTrade = {
      timestamp,
      contract: fields[1],
      quantity: parseInt(fields[2]),
      price,
      exchange: fields[4],
      bidAsk: fields[5],
      delta: deltaStr,
      absDelta: Math.abs(delta),
      iv: fields[7],
      underlyingPrice: parseFloat(fields[8]),
      type,
      strike,
      breakeven,
      isTimeOnly // Track if this was a time-only timestamp
    };
    
    // Only add valid trades
    if (!isNaN(strike) && !isNaN(price) && !isNaN(breakeven)) {
      trades.push(trade);
    }
  });

  return createParsedOptionData(trades);
}

export function formatBreakeven(value: number): string {
  return value.toFixed(2);
}

export function formatPrice(value: number): string {
  return value.toFixed(2);
}

export function formatVolume(value: number): string {
  return value.toLocaleString();
}

export function formatDelta(value: number): string {
  return Math.abs(value).toFixed(2);
}
