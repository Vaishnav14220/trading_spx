import { OptionTrade } from '../types/options';
import { parseTimestamp } from './dateUtils';

export const parseOptionsData = (data: string): OptionTrade[] => {
  return data
    .trim()
    .split('\n')
    .map<OptionTrade | null>(line => {
      const parts = line.trim().split('\t');
      
      if (parts.length < 4) return null;

      const { timestamp, isTimeOnly } = parseTimestamp(parts[0]);
      
      const strike = parseFloat(parts[1]);
      const price = parseFloat(parts[2]);
      const breakeven = parseFloat(parts[3]);
      const type = parts[4]?.toUpperCase().startsWith('P') ? 'P' : 'C';
      const quantity = Number.parseInt(parts[5] ?? '1', 10) || 1;
      
      return {
        timestamp,
        contract: parts[6] ?? `${strike} ${type}`,
        quantity,
        strike,
        price,
        exchange: '',
        bidAsk: '',
        delta: '0',
        iv: '0',
        underlyingPrice: 0,
        breakeven,
        type,
        absDelta: 0,
        isTimeOnly,
      };
    })
    .filter((trade): trade is OptionTrade => trade !== null && !isNaN(trade.strike) && !isNaN(trade.price) && !isNaN(trade.breakeven));
};
