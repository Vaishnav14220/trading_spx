import React, { useEffect, useMemo, useState } from 'react';
import { OptionTrade } from '../types/options';
import { ArrowUpCircle, ArrowDownCircle, ArrowUpDown, TrendingUp, TrendingDown, Target, Copy, CopyCheck } from 'lucide-react';
import TradesModal from './TradesModal';
import SentimentHistogram from './SentimentHistogram';
import TradeContextTable from './TradeContextTable';
import { buildScoredSentiment } from '../utils/sentimentScoring';
import {
  classifyTrade,
  COPY_DELTA_THRESHOLD,
  getBreakevenLevel,
  getTradePremium,
  HIGH_DELTA_THRESHOLD,
  MID_DELTA_RANGE,
} from '../utils/tradeClassification';

interface SentimentAnalysisProps {
  trades: OptionTrade[];
  currentPrice?: number;
  futuresSpread?: number;
  roundFigures?: boolean;
}

interface AggregatedSentiment {
  bullishPremium: number;
  bearishPremium: number;
}

type SortField = 'score' | 'level' | 'premium' | 'distance';
type SortDirection = 'asc' | 'desc';

const SentimentAnalysis: React.FC<SentimentAnalysisProps> = ({ trades, currentPrice = 0, futuresSpread = 0, roundFigures = false }) => {
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedBreakeven, setSelectedBreakeven] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState({ high: false, mid: false });
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => setIsDesktopLayout(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const { sentiments, signal } = useMemo(() => {
    const analysis = buildScoredSentiment({
      trades,
      currentPrice,
      roundFigures,
      highDeltaThreshold: HIGH_DELTA_THRESHOLD,
    });

    const sortedSentiments = [...analysis.sentiments].sort((a, b) => {
      switch (sortField) {
        case 'score':
          return (sortDirection === 'asc' ? a.score - b.score : b.score - a.score);
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

    return { sentiments: sortedSentiments, signal: analysis.signal };
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
      const classified = classifyTrade(trade);
      const premium = getTradePremium(trade);
      const level = getBreakevenLevel(trade, roundFigures);
      
      const existing = breakevensMap.get(level) || { bullishPremium: 0, bearishPremium: 0 };
      
      if (classified.bias === 'bullish') {
        existing.bullishPremium += premium;
      } else {
        existing.bearishPremium += premium;
      }
      
      breakevensMap.set(level, existing);
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
      const classified = classifyTrade(trade);
      const premium = getTradePremium(trade);
      const level = getBreakevenLevel(trade, roundFigures);
      
      const existing = breakevensMap.get(level) || { bullishPremium: 0, bearishPremium: 0 };
      
      if (classified.bias === 'bullish') {
        existing.bullishPremium += premium;
      } else {
        existing.bearishPremium += premium;
      }
      
      breakevensMap.set(level, existing);
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
              High Delta Levels (&gt;{HIGH_DELTA_THRESHOLD})
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
            <div className={`mb-4 rounded-lg border p-3 ${
              signal.action === 'BUY'
                ? 'border-green-500/60 bg-green-500/10'
                : signal.action === 'SELL'
                ? 'border-red-500/60 bg-red-500/10'
                : 'border-blue-500/60 bg-blue-500/10'
            }`}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-md px-3 py-1.5 text-xl font-bold ${
                    signal.action === 'BUY'
                      ? 'bg-green-500/20 text-green-300'
                      : signal.action === 'SELL'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {signal.action}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Model Confidence</div>
                    <div className="font-mono text-sm font-semibold text-white">
                      {(signal.confidence * 100).toFixed(0)}% {signal.bias}
                      <span className="ml-2 text-slate-500">score {(signal.score * 100).toFixed(0)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Target className="h-4 w-4" />
                  <span>{signal.points.toFixed(1)} points</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
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
                  <div className="text-gray-400">{signal.action === 'WATCH' ? 'Focus Level' : 'Target'}</div>
                  <div className="font-mono font-bold text-white">
                    {signal.target === undefined ? 'N/A' : `$${roundFigures ? signal.target.toFixed(0) : signal.target.toFixed(2)}`}
                    {signal.target !== undefined && futuresSpread > 0 && (
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
                <div>
                  <div className="text-gray-400">Support</div>
                  <div className="font-mono font-bold text-white">{formatPremium(signal.premium)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Bull {(signal.bullishScore * 100).toFixed(0)} / Bear {(signal.bearishScore * 100).toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {signal.reasons.slice(0, 4).map(reason => (
                  <span key={reason} className="rounded-md bg-slate-950/50 px-2 py-1 text-xs text-slate-300">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => toggleSort('score')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                sortField === 'score' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-gray-300'
              }`}
            >
              <span>Signal Score</span>
              <ArrowUpDown className="h-4 w-4" />
            </button>
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

        {isDesktopLayout && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          <div
            className="grid items-center gap-3 border-b border-slate-700 bg-slate-950/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            style={{ gridTemplateColumns: '56px minmax(150px, 1.1fr) minmax(145px, 0.9fr) minmax(120px, 0.8fr) minmax(180px, 1fr) 92px' }}
          >
            <div>Score</div>
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
                  <div className="font-mono text-xs font-semibold text-slate-300">
                    {(sentiment.score * 100).toFixed(0)}
                    <div className="text-[10px] text-slate-600">#{index + 1}</div>
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
                      {Math.round(sentiment.confidence * 100)}% directional
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
        )}
        {!isDesktopLayout && (
        <div className="mt-3 grid gap-3">
          {sentiments.map((sentiment, index) => (
            <div
              key={`mobile-${sentiment.level}-${index}`}
              className="rounded-lg border border-slate-700 bg-slate-800 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-lg font-bold text-white">${formatLevel(sentiment.level)}</div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">Score {(sentiment.score * 100).toFixed(0)}</div>
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
        )}
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
