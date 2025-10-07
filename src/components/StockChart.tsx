import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, ISeriesApi, LineStyle } from 'lightweight-charts';
import { StockChartProps } from '../types/chart';
import { LineChart, BarChart2, Maximize2, Minimize2, ArrowUp, ArrowDown } from 'lucide-react';
import { OptionTrade } from '../types/options';

const DELTA_THRESHOLD = 0.64;

interface ExtendedStockChartProps extends StockChartProps {
  trades?: OptionTrade[];
}

export const StockChart: React.FC<ExtendedStockChartProps> = ({ 
  data, 
  symbol, 
  chartType = 'candlestick', 
  trades = [] 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const [currentType, setCurrentType] = useState(chartType);
  const [isMaximized, setIsMaximized] = useState(false);
  const breakevenLinesRef = useRef<ISeriesApi<"Line">[]>([]);

  const toggleChartType = () => {
    const newType = currentType === 'candlestick' ? 'line' : 'candlestick';
    setCurrentType(newType);
    
    if (chartRef.current && seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
      const series = createChartSeries(chartRef.current, newType);
      seriesRef.current = series;
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    if (chartRef.current && chartContainerRef.current) {
      const width = chartContainerRef.current.clientWidth;
      const height = isMaximized ? 400 : window.innerHeight - 100;
      chartRef.current.applyOptions({ width, height });
      chartRef.current.timeScale().fitContent();
    }
  };

  const createChartSeries = (chart: any, type: 'candlestick' | 'line') => {
    const series = type === 'candlestick' 
      ? chart.addCandlestickSeries({
          upColor: '#22C55E',
          downColor: '#EF4444',
          borderVisible: false,
          wickUpColor: '#22C55E',
          wickDownColor: '#EF4444',
        })
      : chart.addLineSeries({
          color: '#60A5FA',
          lineWidth: 2,
        });

    series.setData(data.map(d => ({
      ...d,
      value: type === 'line' ? d.close : undefined
    })));

    return series;
  };

  const updateBreakevenLines = (chart: any) => {
    breakevenLinesRef.current.forEach(line => {
      if (line) {
        chart.removeSeries(line);
      }
    });
    breakevenLinesRef.current = [];

    if (!trades || trades.length === 0) return;

    const highDeltaTrades = trades.filter(t => Math.abs(parseFloat(t.delta)) > DELTA_THRESHOLD);
    const breakevenGroups = new Map<number, { 
      trades: OptionTrade[], 
      totalPremium: number,
      direction: 'above' | 'below'
    }>();
    
    highDeltaTrades.forEach(trade => {
      const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
      const midPrice = (bid + ask) / 2;
      const isBuy = trade.price >= midPrice;
      const direction = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy) ? 'above' : 'below';
      
      const existing = breakevenGroups.get(trade.breakeven);
      const premium = trade.price * trade.quantity * 100;
      
      if (existing) {
        existing.trades.push(trade);
        existing.totalPremium += premium;
      } else {
        breakevenGroups.set(trade.breakeven, {
          trades: [trade],
          totalPremium: premium,
          direction
        });
      }
    });

    breakevenGroups.forEach(({ trades: levelTrades, totalPremium, direction }, level) => {
      const line = chart.addLineSeries({
        color: direction === 'above' ? '#22C55E' : '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `${direction === 'above' ? '▲' : '▼'} $${level.toFixed(2)} ($${Math.abs(totalPremium / 1_000_000).toFixed(1)}M)`,
      });

      line.setData(data.map(d => ({
        time: d.time,
        value: level
      })));

      breakevenLinesRef.current.push(line);
    });
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1E293B' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#60A5FA',
          style: LineStyle.Dashed,
        },
        horzLine: {
          width: 1,
          color: '#60A5FA',
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;
    const series = createChartSeries(chart, currentType);
    seriesRef.current = series;
    updateBreakevenLines(chart);

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        const width = chartContainerRef.current.clientWidth;
        chart.applyOptions({ width });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    seriesRef.current.setData(data.map(d => ({
      ...d,
      value: currentType === 'line' ? d.close : undefined
    })));

    updateBreakevenLines(chartRef.current);
  }, [data, trades, currentType]);

  return (
    <div className={`w-full bg-slate-900 rounded-lg p-4 ${isMaximized ? 'fixed inset-0 z-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">{symbol} Price Chart (1-min)</h2>
          {data.length > 0 && (
            <div className="text-3xl font-bold text-yellow-400">
              ${data[data.length - 1].close.toFixed(2)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleChartType}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            {currentType === 'candlestick' ? (
              <>
                <LineChart className="h-4 w-4" />
                <span className="text-sm">Switch to Line</span>
              </>
            ) : (
              <>
                <BarChart2 className="h-4 w-4" />
                <span className="text-sm">Switch to Candlestick</span>
              </>
            )}
          </button>
          <button
            onClick={toggleMaximize}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <div className="relative">
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  );
};

export default StockChart;