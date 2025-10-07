import React, { useMemo } from 'react';
import { OptionTrade } from '../types/options';

interface SentimentHistogramProps {
  trades: OptionTrade[];
  currentPrice: number;
}

interface IntervalSentiment {
  startPrice: number;
  endPrice: number;
  bullishPremium: number;
  bearishPremium: number;
  totalPremium: number;
  bullishPercentage: number;
}

const SentimentHistogram: React.FC<SentimentHistogramProps> = ({ trades, currentPrice }) => {
  const sentimentData = useMemo(() => {
    const intervalSize = 5;
    const uniqueBreakevens = [...new Set(trades.map(t => Math.round(t.breakeven / intervalSize) * intervalSize))];
    
    const intervals = new Map<number, IntervalSentiment>();
    
    uniqueBreakevens.forEach(startPrice => {
      intervals.set(startPrice, {
        startPrice,
        endPrice: startPrice + intervalSize,
        bullishPremium: 0,
        bearishPremium: 0,
        totalPremium: 0,
        bullishPercentage: 0
      });
    });

    trades.forEach(trade => {
      const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
      const midPrice = (bid + ask) / 2;
      const isBuy = trade.price >= midPrice;
      
      // Determine if the trade is bullish:
      // - Buying calls = bullish
      // - Selling puts = bullish
      // - Selling calls = bearish
      // - Buying puts = bearish
      const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);
      
      const premium = trade.price * trade.quantity * 100;
      const intervalStart = Math.round(trade.breakeven / intervalSize) * intervalSize;
      
      const interval = intervals.get(intervalStart);
      if (interval) {
        if (isBullish) {
          interval.bullishPremium += premium;
        } else {
          interval.bearishPremium += premium;
        }
        interval.totalPremium += premium;
      }
    });

    return Array.from(intervals.values())
      .map(interval => ({
        ...interval,
        bullishPercentage: interval.totalPremium > 0 
          ? (interval.bullishPremium / interval.totalPremium) * 100 
          : 0
      }))
      .sort((a, b) => b.startPrice - a.startPrice);
  }, [trades, currentPrice]);

  const maxPremium = Math.max(...sentimentData.map(d => Math.max(d.bullishPremium, d.bearishPremium)));

  const formatPremium = (premium: number): string => {
    if (premium >= 1_000_000) {
      return `$${(premium / 1_000_000).toFixed(1)}M`;
    } else if (premium >= 1_000) {
      return `$${(premium / 1_000).toFixed(1)}K`;
    }
    return `$${premium.toFixed(0)}`;
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Premium Distribution by Price Level</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span className="text-gray-400">Bearish Premium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <span className="text-gray-400">Bullish Premium</span>
          </div>
        </div>
      </div>

      <div className="relative w-full space-y-2">
        {sentimentData.map((data, index) => {
          const bullishWidth = (data.bullishPremium / maxPremium) * 100;
          const bearishWidth = (data.bearishPremium / maxPremium) * 100;
          const containsCurrentPrice = currentPrice >= data.startPrice && currentPrice < data.endPrice;

          return (
            <div key={index} className="flex items-center gap-2 h-12">
              <div 
                className={`w-32 text-right ${
                  containsCurrentPrice ? 'text-yellow-400 font-bold' : 'text-gray-400'
                }`}
              >
                ${data.startPrice.toFixed(0)}
              </div>

              <div className="flex-1 flex items-center">
                <div className="flex-1 flex justify-end items-center">
                  <div className="text-xs text-red-400 mr-2">
                    {formatPremium(data.bearishPremium)}
                  </div>
                  <div 
                    className="h-8 bg-red-500 rounded-sm transition-all duration-300"
                    style={{ width: `${bearishWidth}%` }}
                  />
                </div>

                <div className="w-16 text-center">
                  <div className={`text-sm font-mono font-bold ${
                    data.bullishPercentage > 50 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {data.bullishPercentage.toFixed(1)}%
                  </div>
                </div>

                <div className="flex-1 flex items-center">
                  <div 
                    className="h-8 bg-green-500 rounded-sm transition-all duration-300"
                    style={{ width: `${bullishWidth}%` }}
                  />
                  <div className="text-xs text-green-400 ml-2">
                    {formatPremium(data.bullishPremium)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SentimentHistogram;