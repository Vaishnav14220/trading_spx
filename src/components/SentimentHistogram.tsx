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

const gridTemplateColumns = '42px minmax(90px, 118px) minmax(0, 1fr) 54px minmax(0, 1fr) 78px';

const formatPremium = (premium: number): string => {
  if (premium >= 1_000_000) {
    return `$${(premium / 1_000_000).toFixed(1)}M`;
  }

  if (premium >= 1_000) {
    return `$${(premium / 1_000).toFixed(1)}K`;
  }

  return `$${premium.toFixed(0)}`;
};

const formatDistance = (distance: number): string => {
  if (Math.abs(distance) < 0.5) {
    return 'at spot';
  }

  return `${distance > 0 ? '+' : ''}${distance.toFixed(0)} pts`;
};

const SentimentHistogram: React.FC<SentimentHistogramProps> = ({ trades, currentPrice, futuresSpread = 0, roundFigures = false }) => {
  const intervalSize = roundFigures ? 1 : 5;

  const sentimentData = useMemo(() => {
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
      .sort((a, b) => b.totalPremium - a.totalPremium);
  }, [trades, intervalSize, roundFigures]);

  const {
    maxPremium,
    totalBullish,
    totalBearish,
    netBullishPercent,
    closestLevel,
  } = useMemo<{
    maxPremium: number;
    totalBullish: number;
    totalBearish: number;
    netBullishPercent: number;
    closestLevel: IntervalSentiment | null;
  }>(() => {
    let maxPremium = 1;
    let totalBullish = 0;
    let totalBearish = 0;
    let closestLevel: IntervalSentiment | null = null;

    sentimentData.forEach(item => {
      maxPremium = Math.max(maxPremium, item.bullishPremium, item.bearishPremium);
      totalBullish += item.bullishPremium;
      totalBearish += item.bearishPremium;

      if (!closestLevel || Math.abs(item.startPrice - currentPrice) < Math.abs(closestLevel.startPrice - currentPrice)) {
        closestLevel = item;
      }
    });

    const totalPremium = totalBullish + totalBearish;

    return {
      maxPremium,
      totalBullish,
      totalBearish,
      netBullishPercent: totalPremium > 0 ? (totalBullish / totalPremium) * 100 : 0,
      closestLevel,
    };
  }, [sentimentData, currentPrice]);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-700/70 bg-slate-950/40 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Premium Distribution</h3>
          <div className="mt-1 text-xs text-slate-400">
            {sentimentData.length.toLocaleString()} levels sorted by total premium
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-right text-xs">
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
            <div className="text-slate-400">Bearish</div>
            <div className="font-mono font-semibold text-red-300">{formatPremium(totalBearish)}</div>
          </div>
          <div className="rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2">
            <div className="text-slate-400">Bullish</div>
            <div className="font-mono font-semibold text-green-300">{formatPremium(totalBullish)}</div>
          </div>
          <div className="rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2">
            <div className="text-slate-400">Bias</div>
            <div className={`font-mono font-semibold ${netBullishPercent >= 50 ? 'text-green-300' : 'text-red-300'}`}>
              {netBullishPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-sm font-bold text-yellow-300">
            Current Price: ${roundFigures ? currentPrice.toFixed(0) : currentPrice.toFixed(2)}
            {futuresSpread > 0 && (
              <span className="ml-3 text-blue-300">
                Futures ${roundFigures ? (currentPrice + futuresSpread).toFixed(0) : (currentPrice + futuresSpread).toFixed(2)}
              </span>
            )}
          </div>
          {closestLevel && (
            <div className="text-xs text-slate-400">
              Nearest level: <span className="font-mono text-slate-200">${closestLevel.startPrice.toFixed(0)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-h-[560px] overflow-y-auto overflow-x-hidden pr-1 sentiment-scrollbar">
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b border-slate-700/70 bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          style={{ gridTemplateColumns }}
        >
          <div>#</div>
          <div>Level</div>
          <div className="text-right">Bearish</div>
          <div className="text-center">Bias</div>
          <div>Bullish</div>
          <div className="text-right">Total</div>
        </div>

        <div className="divide-y divide-slate-800/80">
          {sentimentData.map((data, index) => {
            const bullishWidth = Math.max(2, (data.bullishPremium / maxPremium) * 100);
            const bearishWidth = Math.max(2, (data.bearishPremium / maxPremium) * 100);
            const containsCurrentPrice = currentPrice >= data.startPrice && currentPrice < data.endPrice;
            const distance = data.startPrice - currentPrice;
            const futuresLevel = data.startPrice + futuresSpread;
            const dominantSide = data.bullishPremium >= data.bearishPremium ? 'bullish' : 'bearish';

            return (
              <div
                key={data.startPrice}
                className={`grid min-h-11 items-center gap-2 px-3 py-2 transition-colors ${
                  containsCurrentPrice
                    ? 'bg-yellow-500/10 ring-1 ring-inset ring-yellow-400/40'
                    : 'hover:bg-slate-800/70'
                }`}
                style={{ gridTemplateColumns }}
              >
                <div className="text-xs font-medium text-slate-500">#{index + 1}</div>

                <div className="min-w-0">
                  <div className={`font-mono text-sm font-bold ${containsCurrentPrice ? 'text-yellow-200' : 'text-slate-100'}`}>
                    ${data.startPrice.toFixed(0)}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    {formatDistance(distance)}
                    {futuresSpread > 0 && (
                      <span className="ml-1 text-blue-300">${futuresLevel.toFixed(0)}</span>
                    )}
                  </div>
                </div>

                <div className="flex min-w-0 items-center justify-end gap-2">
                  <div className="min-w-[52px] text-right font-mono text-[11px] font-semibold text-red-300">
                    {formatPremium(data.bearishPremium)}
                  </div>
                  <div className="flex h-5 flex-1 justify-end rounded-sm bg-slate-950/50">
                    <div
                      className={`h-full rounded-sm ${dominantSide === 'bearish' ? 'bg-red-400' : 'bg-red-500/55'}`}
                      style={{ width: `${bearishWidth}%` }}
                    />
                  </div>
                </div>

                <div className={`rounded-md px-1.5 py-1 text-center font-mono text-[11px] font-bold ${
                  data.bullishPercentage >= 50
                    ? 'bg-green-500/10 text-green-300'
                    : 'bg-red-500/10 text-red-300'
                }`}>
                  {data.bullishPercentage.toFixed(0)}%
                </div>

                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-5 flex-1 rounded-sm bg-slate-950/50">
                    <div
                      className={`h-full rounded-sm ${dominantSide === 'bullish' ? 'bg-green-400' : 'bg-green-500/55'}`}
                      style={{ width: `${bullishWidth}%` }}
                    />
                  </div>
                  <div className="min-w-[52px] font-mono text-[11px] font-semibold text-green-300">
                    {formatPremium(data.bullishPremium)}
                  </div>
                </div>

                <div className="text-right font-mono text-xs font-semibold text-slate-400">
                  {formatPremium(data.totalPremium)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <style>{`
        .sentiment-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .sentiment-scrollbar::-webkit-scrollbar-track {
          background: #0f172a;
        }

        .sentiment-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
          border: 2px solid #0f172a;
          border-radius: 999px;
        }

        .sentiment-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
};

export default SentimentHistogram;
