import React, { useState, useMemo } from 'react';
import { OptionTrade } from '../types/options';
import { ArrowUpCircle, ArrowDownCircle, ArrowUpDown, TrendingUp, TrendingDown, Target, Copy, CopyCheck } from 'lucide-react';
import TradesModal from './TradesModal';
import SentimentHistogram from './SentimentHistogram';
import TradeContextTable from './TradeContextTable';

const DELTA_THRESHOLD = 0.64;
const COPY_DELTA_THRESHOLD = 0.64;
const MID_DELTA_RANGE = { min: 0.50, max: 0.60 };

interface SentimentAnalysisProps {
  trades: OptionTrade[];
  currentPrice?: number;
  futuresSpread?: number;
  roundFigures?: boolean;
}

interface BreakevenSentiment {
  level: number;
  totalPremium: number;
  direction: 'above' | 'below';
  trades: OptionTrade[];
  distance: number;
}

interface AggregatedSentiment {
  bullishPremium: number;
  bearishPremium: number;
}

type SortField = 'level' | 'premium' | 'distance';
type SortDirection = 'asc' | 'desc';

const SentimentAnalysis: React.FC<SentimentAnalysisProps> = ({ trades, currentPrice = 0, futuresSpread = 0, roundFigures = false }) => {
  const [sortField, setSortField] = useState<SortField>('distance');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedBreakeven, setSelectedBreakeven] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState({ high: false, mid: false });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const { sentiments, signal } = useMemo(() => {
    const highDeltaTrades = trades.filter(trade => Math.abs(Number(trade.delta)) > DELTA_THRESHOLD);
    
    if (highDeltaTrades.length === 0) {
      return { sentiments: [], signal: null };
    }

    const breakevens = highDeltaTrades.reduce<BreakevenSentiment[]>((acc, trade) => {
      const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
      const midPrice = (bid + ask) / 2;
      const isBuy = trade.price >= midPrice;
      const direction = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy) ? 'above' : 'below';
      
      // Round breakeven if roundFigures is enabled
      const breakevenLevel = roundFigures ? Math.round(trade.breakeven) : trade.breakeven;
      const distance = breakevenLevel - currentPrice;
      
      const existingSentiment = acc.find(s => s.level === breakevenLevel);
      const premium = trade.price * trade.quantity * 100;
      
      if (existingSentiment) {
        existingSentiment.totalPremium += premium;
        existingSentiment.trades.push(trade);
      } else {
        acc.push({
          level: breakevenLevel,
          totalPremium: premium,
          direction,
          trades: [trade],
          distance
        });
      }
      
      return acc;
    }, []);

    const sortedByPremium = [...breakevens].sort((a, b) => 
      Math.abs(b.totalPremium) - Math.abs(a.totalPremium)
    );

    const significantLevels = sortedByPremium.slice(0, Math.min(3, sortedByPremium.length));
    const nearestSignificant = significantLevels.reduce((nearest, current) => {
      if (!nearest) return current;
      return Math.abs(current.distance) < Math.abs(nearest.distance) ? current : nearest;
    }, significantLevels[0]);

    let signal = null;
    if (nearestSignificant) {
      // Determine trade direction
      const tradeDirection = nearestSignificant.direction === 'above' ? 'BUY' : 'SELL';
      
      // Get all levels in the direction of the trade
      const levelsInDirection = breakevens.filter(level => 
        tradeDirection === 'BUY' ? 
          level.level > currentPrice : 
          level.level < currentPrice
      );
      
      // Sort by premium (highest first)
      const sortedByPremiumInDirection = levelsInDirection.sort((a, b) => 
        Math.abs(b.totalPremium) - Math.abs(a.totalPremium)
      );
      
      // Target is the level with highest premium
      const target = sortedByPremiumInDirection[0];
      // Next target is the level with second highest premium
      const nextTarget = sortedByPremiumInDirection[1];

      if (target) {
        signal = {
          action: tradeDirection,
          entry: currentPrice,
          target: target.level,
          nextTarget: nextTarget?.level,
          points: Math.abs(target.level - currentPrice),
          premium: target.totalPremium
        };
      }
    }

    const sortedSentiments = breakevens.sort((a, b) => {
      switch (sortField) {
        case 'level':
          return (sortDirection === 'asc' ? a.level - b.level : b.level - a.level);
        case 'premium':
          return (sortDirection === 'asc' ? a.totalPremium - b.totalPremium : b.totalPremium - a.totalPremium);
        case 'distance':
          return (sortDirection === 'asc' ? Math.abs(a.distance) - Math.abs(b.distance) : Math.abs(b.distance) - Math.abs(a.distance));
        default:
          return 0;
      }
    });

    return { sentiments: sortedSentiments, signal };
  }, [trades, currentPrice, sortField, sortDirection, roundFigures]);

  const handleTradesClick = (breakeven: number) => {
    setSelectedBreakeven(breakeven);
    setIsModalOpen(true);
  };

  const selectedTrades = useMemo(() => {
    if (!selectedBreakeven) return [];
    const sentiment = sentiments.find(s => s.level === selectedBreakeven);
    return sentiment ? sentiment.trades : [];
  }, [selectedBreakeven, sentiments]);

  const copyHighDeltaBreakevens = async () => {
    const highDeltaTrades = trades.filter(trade => Math.abs(Number(trade.delta)) > COPY_DELTA_THRESHOLD);
    const breakevensMap = new Map<number, AggregatedSentiment>();

    highDeltaTrades.forEach(trade => {
      const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
      const midPrice = (bid + ask) / 2;
      const isBuy = trade.price >= midPrice;
      const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);
      const premium = trade.price * trade.quantity * 100;
      
      const existing = breakevensMap.get(trade.breakeven) || { bullishPremium: 0, bearishPremium: 0 };
      
      if (isBullish) {
        existing.bullishPremium += premium;
      } else {
        existing.bearishPremium += premium;
      }
      
      breakevensMap.set(trade.breakeven, existing);
    });

    const formattedBreakevens = Array.from(breakevensMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, sentiment]) => {
        const netSentiment = sentiment.bullishPremium > sentiment.bearishPremium ? 'bullish' : 'bearish';
        return `${level.toFixed(2)} ${netSentiment}`;
      })
      .join(', ');

    try {
      await navigator.clipboard.writeText(formattedBreakevens);
      setCopySuccess(prev => ({ ...prev, high: true }));
      setTimeout(() => setCopySuccess(prev => ({ ...prev, high: false })), 2000);
    } catch (err) {
      console.error('Failed to copy breakevens:', err);
    }
  };

  const copyMidDeltaBreakevens = async () => {
    const midDeltaTrades = trades.filter(trade => {
      const absDelta = Math.abs(Number(trade.delta));
      return absDelta >= MID_DELTA_RANGE.min && absDelta <= MID_DELTA_RANGE.max;
    });
    
    const breakevensMap = new Map<number, AggregatedSentiment>();

    midDeltaTrades.forEach(trade => {
      const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
      const midPrice = (bid + ask) / 2;
      const isBuy = trade.price >= midPrice;
      const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);
      const premium = trade.price * trade.quantity * 100;
      
      const existing = breakevensMap.get(trade.breakeven) || { bullishPremium: 0, bearishPremium: 0 };
      
      if (isBullish) {
        existing.bullishPremium += premium;
      } else {
        existing.bearishPremium += premium;
      }
      
      breakevensMap.set(trade.breakeven, existing);
    });

    const formattedBreakevens = Array.from(breakevensMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, sentiment]) => {
        const netSentiment = sentiment.bullishPremium > sentiment.bearishPremium ? 'bullish' : 'bearish';
        return `${level.toFixed(2)} ${netSentiment}`;
      })
      .join(', ');

    try {
      await navigator.clipboard.writeText(formattedBreakevens);
      setCopySuccess(prev => ({ ...prev, mid: true }));
      setTimeout(() => setCopySuccess(prev => ({ ...prev, mid: false })), 2000);
    } catch (err) {
      console.error('Failed to copy breakevens:', err);
    }
  };

  if (sentiments.length === 0) {
    return (
      <div className="bg-slate-900 rounded-lg p-4 h-[500px] w-full flex items-center justify-center">
        <p className="text-gray-400">No high delta trades available</p>
      </div>
    );
  }

  const maxSentimentPremium = Math.max(...sentiments.map(s => Math.abs(s.totalPremium)), 1);
  const formatLevel = (value: number) => roundFigures ? value.toFixed(0) : value.toFixed(2);
  const formatPremium = (value: number) => {
    const absValue = Math.abs(value);

    if (absValue >= 1_000_000) return `$${(absValue / 1_000_000).toFixed(1)}M`;
    if (absValue >= 1_000) return `$${(absValue / 1_000).toFixed(1)}K`;
    return `$${absValue.toFixed(0)}`;
  };

  return (
    <>
      <div className="bg-slate-900 rounded-lg p-4 w-full">
        <div className="sticky top-0 bg-slate-900 pb-4 z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              High Delta Levels (&gt;{DELTA_THRESHOLD})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={copyMidDeltaBreakevens}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  copySuccess.mid
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {copySuccess.mid ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copySuccess.mid ? 'Copied!' : `Copy Mid-Δ (${MID_DELTA_RANGE.min}-${MID_DELTA_RANGE.max})`}</span>
              </button>
              
              <button
                onClick={copyHighDeltaBreakevens}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  copySuccess.high
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {copySuccess.high ? <CopyCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copySuccess.high ? 'Copied!' : `Copy High-Δ (>${COPY_DELTA_THRESHOLD})`}</span>
              </button>
            </div>
          </div>

          {signal && (
            <div className={`mb-4 p-4 rounded-lg border ${
              signal.action === 'BUY' ? 
                'bg-green-500/10 border-green-500' : 
                'bg-red-500/10 border-red-500'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`text-2xl font-bold ${
                  signal.action === 'BUY' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {signal.action}
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Target className="h-4 w-4" />
                  <span>{signal.points.toFixed(1)} points</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">Entry</div>
                  <div className="font-mono font-bold text-white">
                    ${roundFigures ? signal.entry.toFixed(0) : signal.entry.toFixed(2)}
                    {futuresSpread > 0 && (
                      <div className="text-blue-400 text-xs mt-1">
                        [${roundFigures ? (signal.entry + futuresSpread).toFixed(0) : (signal.entry + futuresSpread).toFixed(2)}]
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Target</div>
                  <div className="font-mono font-bold text-white">
                    ${roundFigures ? signal.target.toFixed(0) : signal.target.toFixed(2)}
                    {futuresSpread > 0 && (
                      <div className="text-blue-400 text-xs mt-1">
                        [${roundFigures ? (signal.target + futuresSpread).toFixed(0) : (signal.target + futuresSpread).toFixed(2)}]
                      </div>
                    )}
                  </div>
                </div>
                {signal.nextTarget && (
                  <div>
                    <div className="text-gray-400">Next Target</div>
                    <div className="font-mono font-bold text-white">
                      ${roundFigures ? signal.nextTarget.toFixed(0) : signal.nextTarget.toFixed(2)}
                      {futuresSpread > 0 && (
                        <div className="text-blue-400 text-xs mt-1">
                          [${roundFigures ? (signal.nextTarget + futuresSpread).toFixed(0) : (signal.nextTarget + futuresSpread).toFixed(2)}]
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => toggleSort('distance')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                sortField === 'distance' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'
              }`}
            >
              <span>Distance</span>
              <ArrowUpDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => toggleSort('level')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                sortField === 'level' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'
              }`}
            >
              <span>Breakeven</span>
              <ArrowUpDown className="h-4 w-4" />
            </button>
            <button
              onClick={() => toggleSort('premium')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                sortField === 'premium' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'
              }`}
            >
              <span>Premium</span>
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>
          
          <div className="bg-slate-800 p-3 rounded-lg border border-yellow-500/30 mb-4">
            <div className="text-yellow-400 font-mono text-lg font-bold">
              Current Price: ${roundFigures ? currentPrice.toFixed(0) : currentPrice.toFixed(2)}
              {futuresSpread > 0 && (
                <span className="text-blue-400 text-lg ml-3">
                  [Futures: ${roundFigures ? (currentPrice + futuresSpread).toFixed(0) : (currentPrice + futuresSpread).toFixed(2)}]
                </span>
              )}
            </div>
          </div>
        </div>

        <SentimentHistogram trades={trades} currentPrice={currentPrice} futuresSpread={futuresSpread} roundFigures={roundFigures} />

        <TradeContextTable trades={trades} roundFigures={roundFigures} />

        <div className="mt-4 hidden overflow-hidden rounded-lg border border-slate-700 bg-slate-900 lg:block">
          <div
            className="grid items-center gap-3 border-b border-slate-700 bg-slate-950/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: '56px minmax(150px, 1.1fr) minmax(145px, 0.9fr) minmax(120px, 0.8fr) minmax(180px, 1fr) 92px' }}
          >
            <div>Rank</div>
            <div>Level</div>
            <div>Trigger</div>
            <div>Distance</div>
            <div className="text-right">Premium</div>
            <div className="text-right">Trades</div>
          </div>

          <div className="divide-y divide-slate-800">
            {sentiments.map((sentiment, index) => {
              const isBullish = sentiment.direction === 'above';
              const distanceLabel = sentiment.distance < 0
                ? `${Math.abs(sentiment.distance).toFixed(2)} below`
                : `${sentiment.distance.toFixed(2)} above`;
              const premiumWidth = (Math.abs(sentiment.totalPremium) / maxSentimentPremium) * 100;

              return (
                <div
                  key={`${sentiment.level}-${sentiment.direction}-${index}`}
                  className="grid min-h-[68px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-800/70"
                  style={{ gridTemplateColumns: '56px minmax(150px, 1.1fr) minmax(145px, 0.9fr) minmax(120px, 0.8fr) minmax(180px, 1fr) 92px' }}
                >
                  <div className="font-mono text-xs font-semibold text-slate-500">
                    #{index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-xl font-bold text-white">
                        ${formatLevel(sentiment.level)}
                      </span>
                      {futuresSpread > 0 && (
                        <span className="font-mono text-sm font-semibold text-blue-300">
                          ES ${formatLevel(sentiment.level + futuresSpread)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Breakeven level
                    </div>
                  </div>

                  <div>
                    <div className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-semibold ${
                      isBullish
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-red-500/15 text-red-300'
                    }`}>
                      {isBullish ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                      <span>{isBullish ? 'Close Above' : 'Close Below'}</span>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 text-sm font-medium ${
                    sentiment.distance < 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {sentiment.distance < 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    <span>{distanceLabel}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-end">
                      <span className="font-mono text-lg font-bold text-green-300">
                        {formatPremium(sentiment.totalPremium)}
                      </span>
                    </div>
                    <div className="flex h-1.5 justify-end rounded-full bg-slate-950/70">
                      <div
                        className={`h-full rounded-full ${isBullish ? 'bg-green-400' : 'bg-red-400'}`}
                        style={{ width: `${premiumWidth}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      onClick={() => handleTradesClick(sentiment.level)}
                      className="rounded-md px-2 py-1 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/10 hover:text-blue-200"
                    >
                      {sentiment.trades.length} trade{sentiment.trades.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:hidden">
          {sentiments.map((sentiment, index) => (
            <div
              key={`mobile-${sentiment.level}-${index}`}
              className="rounded-lg border border-slate-700 bg-slate-800 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-lg font-bold text-white">${formatLevel(sentiment.level)}</div>
                  {futuresSpread > 0 && (
                    <div className="font-mono text-sm text-blue-300">ES ${formatLevel(sentiment.level + futuresSpread)}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-green-300">{formatPremium(sentiment.totalPremium)}</div>
                  <button
                    onClick={() => handleTradesClick(sentiment.level)}
                    className="text-sm text-blue-300"
                  >
                    {sentiment.trades.length} trade{sentiment.trades.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className={sentiment.direction === 'above' ? 'text-green-300' : 'text-red-300'}>
                  {sentiment.direction === 'above' ? 'Close Above' : 'Close Below'}
                </span>
                <span className={sentiment.distance < 0 ? 'text-green-300' : 'text-red-300'}>
                  {sentiment.distance < 0 ? `${Math.abs(sentiment.distance).toFixed(2)} below` : `${sentiment.distance.toFixed(2)} above`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedBreakeven !== null && (
        <TradesModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedBreakeven(null);
          }}
          trades={selectedTrades}
          breakeven={selectedBreakeven}
        />
      )}
    </>
  );
};

export default SentimentAnalysis;
