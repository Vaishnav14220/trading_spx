import React, { useEffect, useRef, useState } from 'react';
import { createChart, ISeriesApi, LineStyle, IChartApi } from 'lightweight-charts';
import { StockChartProps } from '../types/chart';
import { LineChart, BarChart2, Maximize2, Minimize2, TrendingUp, Activity } from 'lucide-react';
import { OptionTrade } from '../types/options';

const DELTA_THRESHOLD = 0.64;

interface ExtendedStockChartProps extends StockChartProps {
  trades?: OptionTrade[];
  futuresSpread?: number;
  roundFigures?: boolean;
}

export const StockChart: React.FC<ExtendedStockChartProps> = ({ 
  data, 
  symbol, 
  chartType = 'candlestick', 
  trades = [],
  futuresSpread = 0,
  roundFigures = false
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastPriceLineRef = useRef<any>(null);
  const [currentType, setCurrentType] = useState(chartType);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const breakevenLinesRef = useRef<ISeriesApi<"Line">[]>([]);

  const toggleChartType = () => {
    const newType = currentType === 'candlestick' ? 'line' : 'candlestick';
    setCurrentType(newType);
    
    if (chartRef.current && seriesRef.current) {
      // Clear the price line ref since we're removing the series
      lastPriceLineRef.current = null;
      
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
      const series = createChartSeries(chartRef.current, newType);
      seriesRef.current = series;
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    setTimeout(() => {
      if (chartRef.current && chartContainerRef.current) {
        const width = chartContainerRef.current.clientWidth;
        const height = !isMaximized ? window.innerHeight - 100 : 550;
        chartRef.current.applyOptions({ width, height });
        // Don't auto-fit on maximize - keep current view
        // chartRef.current.timeScale().fitContent();
      }
    }, 50);
  };

  const createChartSeries = (chart: IChartApi, type: 'candlestick' | 'line') => {
    const series = type === 'candlestick' 
      ? chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
        })
      : chart.addLineSeries({
          color: '#2962FF',
          lineWidth: 2,
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          lineType: 2,
        });

    series.setData(data.map(d => ({
      ...d,
      value: type === 'line' ? d.close : undefined
    })));

    return series;
  };

  const createVolumeSeries = (chart: IChartApi) => {
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Generate synthetic volume data based on price movement
    const volumeData = data.map((d, i) => {
      const prevClose = i > 0 ? data[i - 1].close : d.open;
      const volatility = Math.abs(d.high - d.low);
      const volume = Math.random() * 100000 + volatility * 10000;
      const color = d.close >= prevClose ? '#26a69a80' : '#ef535080';
      
      return {
        time: d.time,
        value: volume,
        color: color,
      };
    });

    volumeSeries.setData(volumeData);
    return volumeSeries;
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
      
      // Round breakeven if roundFigures is enabled
      const breakevenLevel = roundFigures ? Math.round(trade.breakeven) : trade.breakeven;
      
      const existing = breakevenGroups.get(breakevenLevel);
      const premium = trade.price * trade.quantity * 100;
      
      if (existing) {
        existing.trades.push(trade);
        existing.totalPremium += premium;
      } else {
        breakevenGroups.set(breakevenLevel, {
          trades: [trade],
          totalPremium: premium,
          direction
        });
      }
    });

    breakevenGroups.forEach(({ trades, totalPremium, direction }, level) => {
      const displayLevel = roundFigures ? level.toFixed(0) : level.toFixed(2);
      const futuresLevel = roundFigures ? (level + futuresSpread).toFixed(0) : (level + futuresSpread).toFixed(2);
      const futuresAdjustedPrice = futuresSpread > 0 ? ` [$${futuresLevel}]` : '';
      const line = chart.addLineSeries({
        color: direction === 'above' ? '#22C55E' : '#EF4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `${direction === 'above' ? '▲' : '▼'} $${displayLevel}${futuresAdjustedPrice} ($${Math.abs(totalPremium / 1_000_000).toFixed(1)}M)`,
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
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { 
          color: '#1e222d',
          style: LineStyle.Solid,
        },
        horzLines: { 
          color: '#1e222d',
          style: LineStyle.Solid,
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: 550,
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#758696',
          style: LineStyle.LargeDashed,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          width: 1,
          color: '#758696',
          style: LineStyle.LargeDashed,
          labelBackgroundColor: '#2962FF',
        },
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
        visible: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#2B2B43',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 50, // Keep candles away from right edge (25% space)
        barSpacing: 6,
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: false,
      },
      watermark: {
        visible: true,
        fontSize: 48,
        horzAlign: 'center',
        vertAlign: 'center',
        color: 'rgba(255, 255, 255, 0.03)',
        text: symbol,
      },
    });

    chartRef.current = chart;
    const series = createChartSeries(chart, currentType);
    seriesRef.current = series;
    
    if (showVolume) {
      volumeSeriesRef.current = createVolumeSeries(chart);
    }
    
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
      lastPriceLineRef.current = null;
      chart.remove();
    };
  }, [showVolume]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    seriesRef.current.setData(data.map(d => ({
      ...d,
      value: currentType === 'line' ? d.close : undefined
    })));

    // Update volume series
    if (volumeSeriesRef.current && showVolume && data.length > 0) {
      const volumeData = data.map((d, i) => {
        const prevClose = i > 0 ? data[i - 1].close : d.open;
        const volatility = Math.abs(d.high - d.low);
        const volume = Math.random() * 100000 + volatility * 10000;
        const color = d.close >= prevClose ? '#26a69a80' : '#ef535080';
        
        return {
          time: d.time,
          value: volume,
          color: color,
        };
      });
      volumeSeriesRef.current.setData(volumeData);
    }

    // Update price line - remove old one first
    if (data.length > 0 && seriesRef.current) {
      // Remove previous price line if it exists
      if (lastPriceLineRef.current) {
        try {
          seriesRef.current.removePriceLine(lastPriceLineRef.current);
        } catch (e) {
          // Price line might not exist
        }
      }
      
      // Create new price line
      try {
        lastPriceLineRef.current = seriesRef.current.createPriceLine({
          price: data[data.length - 1].close,
          color: '#2962FF',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Last',
        });
      } catch (e) {
        console.error('Failed to create price line:', e);
      }
    }

    updateBreakevenLines(chartRef.current);
    
    // Don't auto-scroll - let user control the view
    // chartRef.current.timeScale().fitContent();
  }, [data, trades, currentType, showVolume, futuresSpread, roundFigures]);

  // Don't auto-scroll when new data arrives - keep the current view stable
  // useEffect(() => {
  //   if (chartRef.current && data.length > 0) {
  //     chartRef.current.timeScale().fitContent();
  //   }
  // }, [data]);

  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const prevPrice = data.length > 1 ? data[data.length - 2].close : currentPrice;
  const priceChange = currentPrice - prevPrice;
  const priceChangePercent = prevPrice !== 0 ? (priceChange / prevPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <div className={`w-full rounded-lg overflow-hidden ${isMaximized ? 'fixed inset-0 z-50 p-4' : ''}`}
         style={{ background: '#131722' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">{symbol}</h2>
              <span className="text-xs text-gray-400 px-2 py-1 bg-gray-800 rounded">3D • 1min</span>
            </div>
            {data.length > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <div className="text-2xl font-bold text-white">
                  ${currentPrice.toFixed(2)}
                </div>
                {priceChange !== 0 && (
                  <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingUp className="h-4 w-4 rotate-180" />}
                    <span>{isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleChartType}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              currentType === 'candlestick' 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            title="Toggle chart type"
          >
            {currentType === 'candlestick' ? (
              <BarChart2 className="h-4 w-4" />
            ) : (
              <LineChart className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
              showVolume 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            title="Toggle volume"
          >
            <Activity className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMaximize}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
            title="Toggle fullscreen"
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      <div className="relative" style={{ background: '#131722' }}>
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  );
};

export default StockChart;