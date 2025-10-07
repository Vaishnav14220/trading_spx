import React, { useState, useMemo } from 'react';
import { OptionTrade } from '../types/options';
import { ArrowUpCircle, ArrowDownCircle, ArrowUpDown, TrendingUp, TrendingDown, Target, Copy, CopyCheck } from 'lucide-react';
import TradesModal from './TradesModal';
import SentimentHistogram from './SentimentHistogram';

const DELTA_THRESHOLD = 0.64;
const COPY_DELTA_THRESHOLD = 0.64;
const MID_DELTA_RANGE = { min: 0.50, max: 0.60 };

interface SentimentAnalysisProps {
  trades: OptionTrade[];
  currentPrice?: number;
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

const SentimentAnalysis: React.FC<SentimentAnalysisProps> = ({ trades, currentPrice = 0 }) => {
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
      const distance = trade.breakeven - currentPrice;
      
      const existingSentiment = acc.find(s => s.level === trade.breakeven);
      const premium = trade.price * trade.quantity * 100;
      
      if (existingSentiment) {
        existingSentiment.totalPremium += premium;
        existingSentiment.trades.push(trade);
      } else {
        acc.push({
          level: trade.breakeven,
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
      const nextLevel = sortedByPremium.find(level => 
        nearestSignificant.direction === 'above' ? 
          level.level > nearestSignificant.level : 
          level.level < nearestSignificant.level
      );

      signal = {
        action: nearestSignificant.direction === 'above' ? 'BUY' : 'SELL',
        entry: currentPrice,
        target: nearestSignificant.level,
        nextTarget: nextLevel?.level,
        points: Math.abs(nearestSignificant.distance),
        premium: nearestSignificant.totalPremium
      };
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
  }, [trades, currentPrice, sortField, sortDirection]);

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
                    ${signal.entry.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Target</div>
                  <div className="font-mono font-bold text-white">
                    ${signal.target.toFixed(2)}
                  </div>
                </div>
                {signal.nextTarget && (
                  <div>
                    <div className="text-gray-400">Next Target</div>
                    <div className="font-mono font-bold text-white">
                      ${signal.nextTarget.toFixed(2)}
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
              Current Price: ${currentPrice.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {sentiments.map((sentiment, index) => (
            <div 
              key={index} 
              className="relative bg-slate-800 rounded-lg p-4 border border-slate-700"
            >
              <div 
                className="absolute top-0 bottom-0 left-0 opacity-10 transition-all duration-300"
                style={{
                  width: `${(Math.abs(sentiment.totalPremium) / Math.max(...sentiments.map(s => Math.abs(s.totalPremium)))) * 100}%`,
                  backgroundColor: sentiment.direction === 'above' ? '#22C55E' : '#EF4444'
                }}
              />
              
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="font-mono text-2xl font-bold text-white">
                        ${sentiment.level.toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-400">Breakeven</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                        sentiment.direction === 'above' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {sentiment.direction === 'above' ? (
                          <>
                            <ArrowUpCircle className="h-4 w-4" />
                            <span className="font-semibold">Close Above</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownCircle className="h-4 w-4" />
                            <span className="font-semibold">Close Below</span>
                          </>
                        )}
                      </div>
                      <div className={`flex items-center gap-2 text-sm ${
                        sentiment.distance < 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {sentiment.distance < 0 ? (
                          <>
                            <TrendingUp className="h-4 w-4" />
                            <span>{Math.abs(sentiment.distance).toFixed(2)} below</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-4 w-4" />
                            <span>{sentiment.distance.toFixed(2)} above</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-mono text-xl font-bold ${
                      sentiment.totalPremium > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      ${Math.abs(sentiment.totalPremium).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleTradesClick(sentiment.level)}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {sentiment.trades.length} trade{sentiment.trades.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <SentimentHistogram trades={trades} currentPrice={currentPrice} />
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