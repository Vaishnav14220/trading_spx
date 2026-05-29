import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, HistogramData, LineData, Time } from 'lightweight-charts';
import { OptionTrade } from '../types/options';
import { Filter } from 'lucide-react';
import { formatChartTickLocal, formatChartTimeLocal } from '../utils/chartTime';

interface FlowChartProps {
  trades: OptionTrade[];
}

interface AggregatedFlow {
  time: number;
  calls: number;
  puts: number;
  netFlow: number;
  intentPremium: number;
  cumulativeIntentPremium: number;
  tradeCount: number;
}

type DeltaIntent = 'sold' | 'mixed' | 'bought';

interface DeltaIntentBucket {
  label: string;
  range: string;
  min: number;
  max: number;
  intent: DeltaIntent;
}

const DELTA_INTENT_BUCKETS: DeltaIntentBucket[] = [
  { label: 'OTM Sold Flow', range: '< 0.40', min: 0, max: 0.4, intent: 'sold' },
  { label: 'ATM Mixed Flow', range: '0.40 - 0.60', min: 0.4, max: 0.6, intent: 'mixed' },
  { label: 'ITM Bought Flow', range: '> 0.60', min: 0.6, max: 1, intent: 'bought' },
];

const getDeltaIntent = (absDelta: number): DeltaIntent => {
  if (absDelta < 0.4) return 'sold';
  if (absDelta > 0.6) return 'bought';
  return 'mixed';
};

const getTradePremium = (trade: OptionTrade): number => trade.price * trade.quantity * 100;

const getIntentSignedPremium = (trade: OptionTrade): number => {
  const premium = getTradePremium(trade);
  const intent = getDeltaIntent(trade.absDelta);

  if (intent === 'sold') {
    return trade.type === 'P' ? premium : -premium;
  }

  if (intent === 'bought') {
    return trade.type === 'C' ? premium : -premium;
  }

  return trade.type === 'C' ? premium : -premium;
};

const formatPremium = (value: number): string => {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) return `$${(absValue / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `$${(absValue / 1_000).toFixed(1)}K`;
  return `$${absValue.toFixed(0)}`;
};

const getBucketRead = (
  bucket: DeltaIntentBucket,
  callPremium: number,
  putPremium: number,
  netPremium: number
): string => {
  if (callPremium === 0 && putPremium === 0) {
    return 'No flow in this delta bucket';
  }

  if (bucket.intent === 'sold') {
    if (putPremium > callPremium) return 'Bullish put selling dominates';
    if (callPremium > putPremium) return 'Bearish call selling dominates';
    return 'Sold call and put premium balanced';
  }

  if (bucket.intent === 'bought') {
    if (callPremium > putPremium) return 'Bullish call buying dominates';
    if (putPremium > callPremium) return 'Bearish put buying dominates';
    return 'Bought call and put premium balanced';
  }

  if (netPremium > 0) return 'Mixed ATM flow, calls dominate';
  if (netPremium < 0) return 'Mixed ATM flow, puts dominate';
  return 'Mixed ATM flow is balanced';
};

export const FlowChart: React.FC<FlowChartProps> = ({ trades }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const putSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const netSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const cvdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  const [minDelta, setMinDelta] = useState<number>(0);
  const [maxDelta, setMaxDelta] = useState<number>(1);
  const [showCalls, setShowCalls] = useState<boolean>(false);
  const [showPuts, setShowPuts] = useState<boolean>(false);
  const [showNet, setShowNet] = useState<boolean>(false);
  const [showCvd, setShowCvd] = useState<boolean>(true);

  const deltaIntentSummaries = useMemo(() => {
    return DELTA_INTENT_BUCKETS.map(bucket => {
      const bucketTrades = trades.filter(trade => {
        return getDeltaIntent(trade.absDelta) === bucket.intent;
      });

      const callPremium = bucketTrades
        .filter(trade => trade.type === 'C')
        .reduce((sum, trade) => sum + getTradePremium(trade), 0);
      const putPremium = bucketTrades
        .filter(trade => trade.type === 'P')
        .reduce((sum, trade) => sum + getTradePremium(trade), 0);

      let bullishPremium = 0;
      let bearishPremium = 0;

      if (bucket.intent === 'sold') {
        bullishPremium = putPremium;
        bearishPremium = callPremium;
      } else if (bucket.intent === 'bought') {
        bullishPremium = callPremium;
        bearishPremium = putPremium;
      }

      const netPremium = bucket.intent === 'mixed'
        ? callPremium - putPremium
        : bullishPremium - bearishPremium;
      const totalPremium = callPremium + putPremium;
      const biasLabel = bucket.intent === 'mixed'
        ? netPremium > 0 ? 'Call-heavy' : netPremium < 0 ? 'Put-heavy' : 'Balanced'
        : netPremium > 0 ? 'Bullish' : netPremium < 0 ? 'Bearish' : 'Balanced';

      return {
        ...bucket,
        tradeCount: bucketTrades.length,
        callPremium,
        putPremium,
        totalPremium,
        netPremium,
        biasLabel,
        read: getBucketRead(bucket, callPremium, putPremium, netPremium),
      };
    });
  }, [trades]);

  // Aggregate trades by time intervals (1 minute)
  const aggregateFlowData = (trades: OptionTrade[], minDelta: number, maxDelta: number): AggregatedFlow[] => {
    // Filter trades by delta
    const filteredTrades = trades.filter(trade => {
      const absDelta = trade.absDelta;
      return absDelta >= minDelta && absDelta <= maxDelta;
    });

    // Group by time intervals (1 minute)
    const flowMap = new Map<number, { calls: number; puts: number; intentPremium: number; tradeCount: number }>();

    filteredTrades.forEach(trade => {
      // Parse timestamp to get time in seconds
      const tradeDate = new Date(trade.timestamp);
      const timeKey = Math.floor(tradeDate.getTime() / 1000 / 60) * 60; // Round to minute

      if (!flowMap.has(timeKey)) {
        flowMap.set(timeKey, { calls: 0, puts: 0, intentPremium: 0, tradeCount: 0 });
      }

      const flow = flowMap.get(timeKey)!;
      if (trade.type === 'C') {
        flow.calls += trade.quantity;
      } else {
        flow.puts += trade.quantity;
      }
      flow.intentPremium += getIntentSignedPremium(trade);
      flow.tradeCount += 1;
    });

    // Convert to array and sort by time
    let cumulativeIntentPremium = 0;
    const flowData: AggregatedFlow[] = Array.from(flowMap.entries())
      .map(([time, { calls, puts, intentPremium, tradeCount }]) => ({
        time,
        calls,
        puts,
        netFlow: calls - puts,
        intentPremium,
        cumulativeIntentPremium: 0,
        tradeCount,
      }))
      .sort((a, b) => a.time - b.time)
      .map(flow => {
        cumulativeIntentPremium += flow.intentPremium;
        return {
          ...flow,
          cumulativeIntentPremium,
        };
      });

    return flowData;
  };

  const flowData = useMemo(
    () => aggregateFlowData(trades, minDelta, maxDelta),
    [trades, minDelta, maxDelta]
  );

  const selectedFlowSummary = useMemo(() => {
    const calls = flowData.reduce((sum, flow) => sum + flow.calls, 0);
    const puts = flowData.reduce((sum, flow) => sum + flow.puts, 0);
    const premiumCvd = flowData.reduce((sum, flow) => sum + flow.intentPremium, 0);
    const tradeCount = flowData.reduce((sum, flow) => sum + flow.tradeCount, 0);

    return {
      calls,
      puts,
      netFlow: calls - puts,
      premiumCvd,
      tradeCount,
    };
  }, [flowData]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1e2231' },
        horzLines: { color: '#1e2231' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      localization: {
        locale: navigator.language,
        timeFormatter: formatChartTimeLocal,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#2B2B43',
        tickMarkFormatter: formatChartTickLocal,
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
      },
    });

    chartRef.current = chart;

    // Create series
    const callSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      title: 'Calls',
      priceScaleId: 'left',
    });

    const putSeries = chart.addHistogramSeries({
      color: '#ef5350',
      priceFormat: {
        type: 'volume',
      },
      title: 'Puts',
      priceScaleId: 'left',
    });

    const netSeries = chart.addHistogramSeries({
      color: '#2962FF',
      priceFormat: {
        type: 'volume',
      },
      title: 'Net Flow (C-P)',
      priceScaleId: 'right',
    });

    const cvdSeries = chart.addLineSeries({
      color: '#22C55E',
      lineWidth: 2,
      priceFormat: {
        type: 'volume',
      },
      title: 'Intent CVD',
      priceScaleId: 'cvd',
      lastValueVisible: true,
      priceLineVisible: true,
    });

    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.25,
      },
    });

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.55,
        bottom: 0.1,
      },
    });

    chart.priceScale('cvd').applyOptions({
      scaleMargins: {
        top: 0.12,
        bottom: 0.45,
      },
    });

    callSeriesRef.current = callSeries;
    putSeriesRef.current = putSeries;
    netSeriesRef.current = netSeries;
    cvdSeriesRef.current = cvdSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      callSeriesRef.current = null;
      putSeriesRef.current = null;
      netSeriesRef.current = null;
      cvdSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (
      !callSeriesRef.current ||
      !putSeriesRef.current ||
      !netSeriesRef.current ||
      !cvdSeriesRef.current
    ) return;

    if (flowData.length === 0) {
      callSeriesRef.current.setData([]);
      putSeriesRef.current.setData([]);
      netSeriesRef.current.setData([]);
      cvdSeriesRef.current.setData([]);
      return;
    }

    const callData: HistogramData[] = flowData.map(d => ({
      time: d.time as Time,
      value: showCalls ? d.calls : 0,
      color: '#26a69a',
    }));

    const putData: HistogramData[] = flowData.map(d => ({
      time: d.time as Time,
      value: showPuts ? -d.puts : 0, // Negative to show below axis
      color: '#ef5350',
    }));

    const netData: HistogramData[] = flowData.map(d => ({
      time: d.time as Time,
      value: showNet ? d.netFlow : 0,
      color: d.netFlow >= 0 ? '#26a69a' : '#ef5350',
    }));

    const cvdData: LineData[] = showCvd
      ? flowData.map(d => ({
          time: d.time as Time,
          value: d.cumulativeIntentPremium,
        }))
      : [];
    const latestCvd = flowData[flowData.length - 1]?.cumulativeIntentPremium ?? 0;

    callSeriesRef.current.setData(callData);
    putSeriesRef.current.setData(putData);
    netSeriesRef.current.setData(netData);
    cvdSeriesRef.current.applyOptions({
      color: latestCvd >= 0 ? '#22C55E' : '#EF4444',
    });
    cvdSeriesRef.current.setData(cvdData);
  }, [flowData, showCalls, showPuts, showNet, showCvd]);

  useEffect(() => {
    if (flowData.length === 0) return;
    chartRef.current?.timeScale().fitContent();
  }, [flowData]);

  const deltaPresets = [
    { label: 'All', min: 0, max: 1 },
    { label: 'ATM (0.4-0.6)', min: 0.4, max: 0.6 },
    { label: 'ITM (>0.6)', min: 0.6, max: 1 },
    { label: 'OTM (<0.4)', min: 0, max: 0.4 },
    { label: 'Deep ITM (>0.8)', min: 0.8, max: 1 },
  ];

  return (
    <div className="bg-slate-900 rounded-lg p-3 space-y-3 md:p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Filter className="h-5 w-5 text-blue-500" />
          Call/Put Flow Time Series
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <div className={`rounded-md border px-2.5 py-1 font-mono font-bold ${
            selectedFlowSummary.premiumCvd >= 0
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}>
            CVD {selectedFlowSummary.premiumCvd >= 0 ? '+' : '-'}{formatPremium(selectedFlowSummary.premiumCvd)}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Trades:</span>
            <span className="text-white font-semibold">{selectedFlowSummary.tradeCount}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        {deltaIntentSummaries.map(summary => {
          const isBullish = summary.biasLabel === 'Bullish' || summary.biasLabel === 'Call-heavy';
          const isBearish = summary.biasLabel === 'Bearish' || summary.biasLabel === 'Put-heavy';
          const totalPremium = Math.max(summary.totalPremium, 1);
          const callWidth = (summary.callPremium / totalPremium) * 100;
          const putWidth = (summary.putPremium / totalPremium) * 100;

          return (
            <div
              key={summary.label}
              className="rounded-md border border-slate-700 bg-slate-800/80 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{summary.label}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    abs delta {summary.range} - {summary.intent}
                  </div>
                </div>
                <div className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                  isBullish
                    ? 'bg-green-500/15 text-green-300'
                    : isBearish
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-blue-500/15 text-blue-300'
                }`}>
                  {summary.biasLabel}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-500">Calls</div>
                  <div className="font-mono font-semibold text-green-300">{formatPremium(summary.callPremium)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Puts</div>
                  <div className="font-mono font-semibold text-red-300">{formatPremium(summary.putPremium)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Net</div>
                  <div className={`font-mono font-semibold ${
                    summary.netPremium > 0 ? 'text-green-300' : summary.netPremium < 0 ? 'text-red-300' : 'text-blue-300'
                  }`}>
                    {summary.netPremium >= 0 ? '+' : '-'}{formatPremium(summary.netPremium)}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-950">
                <div className="bg-green-400" style={{ width: `${callWidth}%` }} />
                <div className="bg-red-400" style={{ width: `${putWidth}%` }} />
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate text-slate-300">{summary.read}</span>
                <span className="shrink-0 font-mono text-slate-500">{summary.tradeCount} trades</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-3 rounded-md bg-slate-800 p-3 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Delta Range */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Delta Range (Absolute)</label>
            <span className="text-xs text-blue-400 font-mono">
              {minDelta.toFixed(2)} - {maxDelta.toFixed(2)}
            </span>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="w-8 text-xs text-gray-400">Min:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={minDelta}
                onChange={(e) => setMinDelta(parseFloat(e.target.value))}
                className="slider h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-8 text-xs text-gray-400">Max:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={maxDelta}
                onChange={(e) => setMaxDelta(parseFloat(e.target.value))}
                className="slider h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {deltaPresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setMinDelta(preset.min);
                  setMaxDelta(preset.max);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                  minDelta === preset.min && maxDelta === preset.max
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Display Options */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Display Options</label>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <label className="group flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showCalls}
                onChange={(e) => setShowCalls(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 text-green-500 focus:ring-green-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-xs text-gray-300 transition-colors group-hover:text-white">
                Show Raw Calls
              </span>
              <span className="h-3.5 w-3.5 rounded" style={{ backgroundColor: '#26a69a' }}></span>
            </label>

            <label className="group flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showPuts}
                onChange={(e) => setShowPuts(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 text-red-500 focus:ring-red-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-xs text-gray-300 transition-colors group-hover:text-white">
                Show Raw Puts
              </span>
              <span className="h-3.5 w-3.5 rounded" style={{ backgroundColor: '#ef5350' }}></span>
            </label>

            <label className="group flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showNet}
                onChange={(e) => setShowNet(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-xs text-gray-300 transition-colors group-hover:text-white">
                Show Raw Net Flow
              </span>
              <span className="h-3.5 w-3.5 rounded" style={{ backgroundColor: '#2962FF' }}></span>
            </label>

            <label className="group flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showCvd}
                onChange={(e) => setShowCvd(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 text-green-500 focus:ring-green-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-xs text-gray-300 transition-colors group-hover:text-white">
                Show Intent CVD
              </span>
              <span
                className="h-3.5 w-3.5 rounded"
                style={{ backgroundColor: selectedFlowSummary.premiumCvd >= 0 ? '#22C55E' : '#EF4444' }}
              ></span>
            </label>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div 
        ref={chartContainerRef} 
        className="w-full overflow-hidden rounded-md border border-slate-700"
      />

      {/* Legend/Stats */}
      <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-800 p-3 md:grid-cols-4">
        <div className="text-center">
          <div className="mb-0.5 text-[11px] text-gray-400">Total Calls</div>
          <div className="text-xl font-bold text-green-400">
            {selectedFlowSummary.calls.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-0.5 text-[11px] text-gray-400">Total Puts</div>
          <div className="text-xl font-bold text-red-400">
            {selectedFlowSummary.puts.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-0.5 text-[11px] text-gray-400">Net Flow</div>
          <div className={`text-xl font-bold ${
            selectedFlowSummary.netFlow >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {selectedFlowSummary.netFlow.toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-0.5 text-[11px] text-gray-400">Intent CVD</div>
          <div className={`text-xl font-bold ${
            selectedFlowSummary.premiumCvd >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {selectedFlowSummary.premiumCvd >= 0 ? '+' : '-'}{formatPremium(selectedFlowSummary.premiumCvd)}
          </div>
        </div>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default FlowChart;
