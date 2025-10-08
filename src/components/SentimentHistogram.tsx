import React, { useMemo } from 'react';
import { OptionTrade } from '../types/options';

interface SentimentHistogramProps {
  trades: OptionTrade[];
  currentPrice: number;
  futuresSpread?: number;
  roundFigures?: boolean;
}

interface IntervalSentiment {
  startPrice: number;
  endPrice: number;
  bullishPremium: number;
  bearishPremium: number;
  totalPremium: number;
  bullishPercentage: number;
}

const SentimentHistogram: React.FC<SentimentHistogramProps> = ({ trades, currentPrice, futuresSpread = 0, roundFigures = false }) => {
  const sentimentData = useMemo(() => {
    const intervalSize = roundFigures ? 1 : 5;
    const uniqueBreakevens = [...new Set(trades.map(t => {
      const breakevenValue = roundFigures ? Math.round(t.breakeven) : t.breakeven;
      return Math.round(breakevenValue / intervalSize) * intervalSize;
    }))];
    
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
      const breakevenValue = roundFigures ? Math.round(trade.breakeven) : trade.breakeven;
      const intervalStart = Math.round(breakevenValue / intervalSize) * intervalSize;
      
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
  }, [trades, currentPrice, roundFigures]);

  const maxPremium = Math.max(...sentimentData.map(d => Math.max(d.bullishPremium, d.bearishPremium)));

  const formatPremium = (premium: number): string => {
    if (premium >= 1_000_000) {
      return `$${(premium / 1_000_000).toFixed(1)}M`;
    } else if (premium >= 1_000) {
      return `$${(premium / 1_000).toFixed(1)}K`;
    }
    return `$${premium.toFixed(0)}`;
  };

  // Sort all data by total premium (highest at top) 
  const sortedData = useMemo(() => {
    return [...sentimentData].sort((a, b) => b.totalPremium - a.totalPremium);
  }, [sentimentData]);

  return (
    <div className="bg-slate-800 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-white">
          Premium Distribution (All {sortedData.length} Levels - Sorted by Total Premium)
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-sm" />
            <span className="text-gray-400">Bearish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-sm" />
            <span className="text-gray-400">Bullish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-yellow-500 rounded-sm" />
            <span className="text-gray-400">Current Price</span>
          </div>
        </div>
      </div>

      <div className="relative w-full space-y-1 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {sortedData.map((data, index) => {
          const bullishWidth = (data.bullishPremium / maxPremium) * 100;
          const bearishWidth = (data.bearishPremium / maxPremium) * 100;
          const containsCurrentPrice = currentPrice >= data.startPrice && currentPrice < data.endPrice;

          return (
            <div 
              key={index} 
              className={`flex items-center gap-2 h-7 px-2 rounded transition-all ${
                containsCurrentPrice ? 'bg-yellow-500/20 ring-1 ring-yellow-500/50 scale-105' : 'hover:bg-slate-700/50'
              }`}
            >
              <div className="w-8 text-right text-xs text-gray-500 font-medium">
                #{index + 1}
              </div>
              
              <div 
                className={`min-w-[130px] text-right font-mono font-bold flex items-center justify-end gap-2 ${
                  containsCurrentPrice ? 'text-yellow-400' : 'text-gray-300'
                }`}
              >
                <div className="text-xs">
                  $<span className="text-base">{data.startPrice.toFixed(0)}</span>
                </div>
                {futuresSpread > 0 && (
                  <div className="text-blue-400 text-[10px]">
                    [<span className="text-xs">${(data.startPrice + futuresSpread).toFixed(0)}</span>]
                  </div>
                )}
              </div>

              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 flex justify-end items-center gap-1">
                  <div className="text-xs text-red-400 font-medium min-w-[45px] text-right">
                    {formatPremium(data.bearishPremium)}
                  </div>
                  <div 
                    className={`h-4 rounded-sm transition-all duration-300 ${
                      containsCurrentPrice ? 'bg-yellow-500' : 'bg-red-500/80'
                    }`}
                    style={{ width: `${bearishWidth}%` }}
                  />
                </div>

                <div className="w-10 text-center">
                  <div className={`text-xs font-mono font-bold ${
                    data.bullishPercentage > 50 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {data.bullishPercentage.toFixed(0)}%
                  </div>
                </div>

                <div className="flex-1 flex items-center gap-1">
                  <div 
                    className={`h-4 rounded-sm transition-all duration-300 ${
                      containsCurrentPrice ? 'bg-yellow-500' : 'bg-green-500/80'
                    }`}
                    style={{ width: `${bullishWidth}%` }}
                  />
                  <div className="text-xs text-green-400 font-medium min-w-[45px]">
                    {formatPremium(data.bullishPremium)}
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-500 min-w-[50px] text-right font-medium">
                {formatPremium(data.totalPremium)}
              </div>
            </div>
          );
        })}
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
};

export default SentimentHistogram;