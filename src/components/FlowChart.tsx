import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, HistogramData, Time } from 'lightweight-charts';
import { OptionTrade } from '../types/options';
import { Filter } from 'lucide-react';

interface FlowChartProps {
  trades: OptionTrade[];
}

interface AggregatedFlow {
  time: number;
  calls: number;
  puts: number;
  netFlow: number;
}

export const FlowChart: React.FC<FlowChartProps> = ({ trades }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const putSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const netSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  
  const [minDelta, setMinDelta] = useState<number>(0);
  const [maxDelta, setMaxDelta] = useState<number>(1);
  const [showCalls, setShowCalls] = useState<boolean>(true);
  const [showPuts, setShowPuts] = useState<boolean>(true);
  const [showNet, setShowNet] = useState<boolean>(true);

  // Aggregate trades by time intervals (1 minute)
  const aggregateFlowData = (trades: OptionTrade[], minDelta: number, maxDelta: number): AggregatedFlow[] => {
    // Filter trades by delta
    const filteredTrades = trades.filter(trade => {
      const absDelta = trade.absDelta;
      return absDelta >= minDelta && absDelta <= maxDelta;
    });

    // Group by time intervals (1 minute)
    const flowMap = new Map<number, { calls: number; puts: number }>();

    filteredTrades.forEach(trade => {
      // Parse timestamp to get time in seconds
      const tradeDate = new Date(trade.timestamp);
      const timeKey = Math.floor(tradeDate.getTime() / 1000 / 60) * 60; // Round to minute

      if (!flowMap.has(timeKey)) {
        flowMap.set(timeKey, { calls: 0, puts: 0 });
      }

      const flow = flowMap.get(timeKey)!;
      if (trade.type === 'C') {
        flow.calls += trade.quantity;
      } else {
        flow.puts += trade.quantity;
      }
    });

    // Convert to array and sort by time
    const flowData: AggregatedFlow[] = Array.from(flowMap.entries())
      .map(([time, { calls, puts }]) => ({
        time,
        calls,
        puts,
        netFlow: calls - puts
      }))
      .sort((a, b) => a.time - b.time);

    return flowData;
  };

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
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#2B2B43',
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

    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    });

    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    });

    callSeriesRef.current = callSeries;
    putSeriesRef.current = putSeries;
    netSeriesRef.current = netSeries;

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
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!callSeriesRef.current || !putSeriesRef.current || !netSeriesRef.current) return;

    const flowData = aggregateFlowData(trades, minDelta, maxDelta);

    if (flowData.length === 0) {
      callSeriesRef.current.setData([]);
      putSeriesRef.current.setData([]);
      netSeriesRef.current.setData([]);
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

    callSeriesRef.current.setData(callData);
    putSeriesRef.current.setData(putData);
    netSeriesRef.current.setData(netData);

    chartRef.current?.timeScale().fitContent();
  }, [trades, minDelta, maxDelta, showCalls, showPuts, showNet]);

  const deltaPresets = [
    { label: 'All', min: 0, max: 1 },
    { label: 'ATM (0.4-0.6)', min: 0.4, max: 0.6 },
    { label: 'ITM (>0.6)', min: 0.6, max: 1 },
    { label: 'OTM (<0.4)', min: 0, max: 0.4 },
    { label: 'Deep ITM (>0.8)', min: 0.8, max: 1 },
  ];

  return (
    <div className="bg-slate-900 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Filter className="h-6 w-6 text-blue-500" />
          Call/Put Flow Time Series
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">Total Trades:</span>
          <span className="text-white font-semibold">{trades.filter(t => t.absDelta >= minDelta && t.absDelta <= maxDelta).length}</span>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-800 rounded-lg">
        {/* Delta Range */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Delta Range (Absolute)</label>
            <span className="text-sm text-blue-400 font-mono">
              {minDelta.toFixed(2)} - {maxDelta.toFixed(2)}
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-12">Min:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={minDelta}
                onChange={(e) => setMinDelta(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-12">Max:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={maxDelta}
                onChange={(e) => setMaxDelta(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {deltaPresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setMinDelta(preset.min);
                  setMaxDelta(preset.max);
                }}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
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
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300">Display Options</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={showCalls}
                onChange={(e) => setShowCalls(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-sm text-gray-300 group-hover:text-white transition-colors">
                Show Calls
              </span>
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#26a69a' }}></span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={showPuts}
                onChange={(e) => setShowPuts(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-red-500 focus:ring-red-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-sm text-gray-300 group-hover:text-white transition-colors">
                Show Puts
              </span>
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#ef5350' }}></span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={showNet}
                onChange={(e) => setShowNet(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
              />
              <span className="flex-1 text-sm text-gray-300 group-hover:text-white transition-colors">
                Show Net Flow (Calls - Puts)
              </span>
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#2962FF' }}></span>
            </label>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div 
        ref={chartContainerRef} 
        className="w-full rounded-lg overflow-hidden border border-slate-700"
      />

      {/* Legend/Stats */}
      <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800 rounded-lg">
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">Total Calls</div>
          <div className="text-2xl font-bold text-green-400">
            {trades.filter(t => t.type === 'C' && t.absDelta >= minDelta && t.absDelta <= maxDelta)
              .reduce((sum, t) => sum + t.quantity, 0).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">Total Puts</div>
          <div className="text-2xl font-bold text-red-400">
            {trades.filter(t => t.type === 'P' && t.absDelta >= minDelta && t.absDelta <= maxDelta)
              .reduce((sum, t) => sum + t.quantity, 0).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">Net Flow</div>
          <div className={`text-2xl font-bold ${
            trades.filter(t => t.type === 'C' && t.absDelta >= minDelta && t.absDelta <= maxDelta).reduce((sum, t) => sum + t.quantity, 0) -
            trades.filter(t => t.type === 'P' && t.absDelta >= minDelta && t.absDelta <= maxDelta).reduce((sum, t) => sum + t.quantity, 0) >= 0
              ? 'text-green-400' 
              : 'text-red-400'
          }`}>
            {(
              trades.filter(t => t.type === 'C' && t.absDelta >= minDelta && t.absDelta <= maxDelta).reduce((sum, t) => sum + t.quantity, 0) -
              trades.filter(t => t.type === 'P' && t.absDelta >= minDelta && t.absDelta <= maxDelta).reduce((sum, t) => sum + t.quantity, 0)
            ).toLocaleString()}
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

