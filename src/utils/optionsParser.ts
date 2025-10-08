import { OptionTrade } from '../types/options';
import { parseTimestamp } from './dateUtils';

export const parseOptionsData = (data: string): OptionTrade[] => {
  return data
    .trim()
    .split('\n')
    .map(line => {
      const parts = line.trim().split('\t');
      const timestamp = parseTimestamp(parts[0]);
      
      if (parts.length < 4) return null;
      
      const strike = parseFloat(parts[1]);
      const price = parseFloat(parts[2]);
      const breakeven = parseFloat(parts[3]);
      const type = parts[4]?.toUpperCase() || 'CALL';
      
      return {
        timestamp,
        strike,
        price,
        breakeven,
        type,
        volume: 1,
      };
    })
    .filter((trade): trade is OptionTrade => trade !== null && !isNaN(trade.strike) && !isNaN(trade.price) && !isNaN(trade.breakeven));
};