import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickData, HistogramData, ISeriesApi, LineData, LineStyle, IChartApi, SeriesMarker, UTCTimestamp } from 'lightweight-charts';
import { ChartData, StockChartProps } from '../types/chart';
import { LineChart, BarChart2, Maximize2, Minimize2, TrendingUp, Activity, ArrowUpDown, Tag, Tags } from 'lucide-react';
import { OptionTrade } from '../types/options';
import { formatChartTickLocal, formatChartTimeLocal, formatCompactTimeLocal } from '../utils/chartTime';

const DELTA_THRESHOLD = 0.64;
const MARKER_TIME_TOLERANCE_SECONDS = 30 * 60;
const MAX_LEVEL_LABELS = Number.MAX_SAFE_INTEGER;
const MIN_LEVEL_LABEL_GAP = 0;

const toChartTime = (time: number): UTCTimestamp => time as UTCTimestamp;

type OverlayMode = 'levels' | 'trades' | 'both';

interface TradeMarkerGroup {
  time: number;
  direction: 'bullish' | 'bearish';
  premium: number;
  quantity: number;
  trades: number;
  breakevens: Map<number, { premium: number; trades: number }>;
}

const toCandlestickData = (chartData: ChartData[]): CandlestickData[] =>
  chartData.map(d => ({
    time: toChartTime(d.time),
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));

const toLineData = (chartData: ChartData[]): LineData[] =>
  chartData.map(d => ({
    time: toChartTime(d.time),
    value: d.close,
  }));

const toCandlestickPoint = (d: ChartData): CandlestickData => ({
  time: toChartTime(d.time),
  open: d.open,
  high: d.high,
  low: d.low,
  close: d.close,
});

const toLinePoint = (d: ChartData): LineData => ({
  time: toChartTime(d.time),
  value: d.close,
});

const toVolumeData = (chartData: ChartData[]): HistogramData[] =>
  chartData.map((d, i) => {
    const prevClose = i > 0 ? chartData[i - 1].close : d.open;
    const volatility = Math.abs(d.high - d.low);
    const body = Math.abs(d.close - d.open);
    const volume = Math.max(1, Math.round((volatility + body) * 10000 + (i % 13) * 250));

    return {
      time: toChartTime(d.time),
      value: volume,
      color: d.close >= prevClose ? '#26a69a80' : '#ef535080',
    };
  });

interface SeriesDataState {
  type: 'candlestick' | 'line';
  length: number;
  firstTime: number;
  lastTime: number;
}

const applySeriesData = (
  series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
  type: 'candlestick' | 'line',
  chartData: ChartData[],
  dataStateRef: React.MutableRefObject<SeriesDataState | null>
) => {
  if (chartData.length === 0) {
    if (type === 'candlestick') {
      (series as ISeriesApi<"Candlestick">).setData([]);
    } else {
      (series as ISeriesApi<"Line">).setData([]);
    }
    dataStateRef.current = null;
    return;
  }

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const previous = dataStateRef.current;
  const canPatchLastBar = previous &&
    previous.type === type &&
    previous.length === chartData.length &&
    previous.firstTime === first.time &&
    previous.lastTime === last.time;

  if (type === 'candlestick') {
    if (canPatchLastBar) {
      (series as ISeriesApi<"Candlestick">).update(toCandlestickPoint(last));
    } else {
      (series as ISeriesApi<"Candlestick">).setData(toCandlestickData(chartData));
    }
  } else {
    if (canPatchLastBar) {
      (series as ISeriesApi<"Line">).update(toLinePoint(last));
    } else {
      (series as ISeriesApi<"Line">).setData(toLineData(chartData));
    }
  }

  dataStateRef.current = {
    type,
    length: chartData.length,
    firstTime: first.time,
    lastTime: last.time,
  };
};

const formatCompactPremium = (premium: number): string => {
  if (premium >= 1_000_000) {
    return `$${(premium / 1_000_000).toFixed(1)}M`;
  }

  if (premium >= 1_000) {
    return `$${(premium / 1_000).toFixed(1)}K`;
  }

  return `$${premium.toFixed(0)}`;
};

const formatBreakevenLevel = (level: number, roundFigures: boolean): string =>
  roundFigures ? level.toFixed(0) : level.toFixed(2);

const formatEsBreakevenLevel = (level: number, futuresSpread: number, roundFigures: boolean): string =>
  formatBreakevenLevel(level + futuresSpread, roundFigures);

const getTradeDirection = (trade: OptionTrade): 'bullish' | 'bearish' => {
  const [bid, ask] = trade.bidAsk.split('x').map(p => parseFloat(p));
  const midPrice = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : trade.price;
  const isBuy = trade.price >= midPrice;
  const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);

  return isBullish ? 'bullish' : 'bearish';
};

const parseTradeTime = (timestamp: string): number | null => {
  const parsedTime = new Date(timestamp).getTime();

  if (!Number.isFinite(parsedTime)) {
    return null;
  }

  return Math.floor(parsedTime / 1000);
};

const formatTradeTimeLabel = (timestamp: string): string => {
  const parsedTime = new Date(timestamp);

  if (!Number.isFinite(parsedTime.getTime())) {
    return '';
  }

  return formatCompactTimeLocal(parsedTime);
};

const findNearestChartTime = (timestamp: number, chartData: ChartData[]): number | null => {
  if (chartData.length === 0) {
    return null;
  }

  let low = 0;
  let high = chartData.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (chartData[mid].time < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidates = [chartData[low], chartData[low - 1]].filter(Boolean);
  const nearest = candidates.reduce<ChartData | null>((best, current) => {
    if (!best) return current;
    return Math.abs(current.time - timestamp) < Math.abs(best.time - timestamp) ? current : best;
  }, null);

  if (!nearest || Math.abs(nearest.time - timestamp) > MARKER_TIME_TOLERANCE_SECONDS) {
    return null;
  }

  return nearest.time;
};

const getLocalDayReferenceClose = (chartData: ChartData[]): number => {
  if (chartData.length === 0) {
    return 0;
  }

  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;

  for (let index = chartData.length - 1; index >= 0; index -= 1) {
    if (chartData[index].time < localMidnight) {
      return chartData[index].close;
    }
  }

  return chartData[0].close;
};

interface ExtendedStockChartProps extends StockChartProps {
  trades?: OptionTrade[];
  futuresSpread?: number;
  roundFigures?: boolean;
  historyDays?: number;
}

export const StockChart: React.FC<ExtendedStockChartProps> = ({ 
  data, 
  symbol, 
  chartType = 'candlestick', 
  trades = [],
  futuresSpread = 0,
  roundFigures = false,
  historyDays = 5
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastPriceLineRef = useRef<any>(null);
  const seriesDataStateRef = useRef<SeriesDataState | null>(null);
  const [currentType, setCurrentType] = useState(chartType);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showEsLabels, setShowEsLabels] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('levels');
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
      seriesDataStateRef.current = null;
      applySeriesData(series, newType, data, seriesDataStateRef);
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
    if (type === 'candlestick') {
      const series = chart.addCandlestickSeries({
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
      });
      return series;
    }

    const series = chart.addLineSeries({
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

    volumeSeries.setData(toVolumeData(data));
    return volumeSeries;
  };

  const clearBreakevenLines = (chart: IChartApi) => {
    const lines = breakevenLinesRef.current;
    breakevenLinesRef.current = [];

    lines.forEach(line => {
      if (line) {
        try {
          chart.removeSeries(line);
        } catch (error) {
          console.warn('[StockChart] Ignored stale breakeven line during cleanup:', error);
        }
      }
    });
  };

  const updateTradeMarkers = (
    series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null
  ) => {
    if (!series) return;

    if ((overlayMode !== 'trades' && overlayMode !== 'both') || !trades || trades.length === 0 || data.length === 0) {
      series.setMarkers([]);
      return;
    }

    const markerGroups = new Map<string, TradeMarkerGroup>();

    trades
      .filter(t => Math.abs(parseFloat(t.delta)) > DELTA_THRESHOLD)
      .forEach(trade => {
        const parsedTradeTime = parseTradeTime(trade.timestamp);

        if (!parsedTradeTime) {
          return;
        }

        const markerTime = findNearestChartTime(parsedTradeTime, data);

        if (!markerTime) {
          return;
        }

        const direction = getTradeDirection(trade);
        const key = `${markerTime}-${direction}`;
        const existing = markerGroups.get(key);
        const premium = trade.price * trade.quantity * 100;
        const breakevenLevel = roundFigures ? Math.round(trade.breakeven) : trade.breakeven;

        if (existing) {
          existing.premium += premium;
          existing.quantity += trade.quantity;
          existing.trades += 1;
          const existingBreakeven = existing.breakevens.get(breakevenLevel);

          if (existingBreakeven) {
            existingBreakeven.premium += premium;
            existingBreakeven.trades += 1;
          } else {
            existing.breakevens.set(breakevenLevel, { premium, trades: 1 });
          }
        } else {
          markerGroups.set(key, {
            time: markerTime,
            direction,
            premium,
            quantity: trade.quantity,
            trades: 1,
            breakevens: new Map([[breakevenLevel, { premium, trades: 1 }]]),
          });
        }
      });

    const markers: SeriesMarker<UTCTimestamp>[] = Array.from(markerGroups.values())
      .sort((a, b) => a.time - b.time || (a.direction === 'bullish' ? -1 : 1))
      .map(group => {
        const breakevenEntries = Array.from(group.breakevens.entries())
          .sort((a, b) => b[1].premium - a[1].premium);
        const [dominantBreakeven] = breakevenEntries[0];
        const extraBreakevens = breakevenEntries.length > 1 ? ` +${breakevenEntries.length - 1}` : '';
        const esBreakevenText = showEsLabels
          ? ` / ES ${formatEsBreakevenLevel(dominantBreakeven, futuresSpread, roundFigures)}`
          : '';

        return {
          time: toChartTime(group.time),
          position: group.direction === 'bullish' ? 'belowBar' : 'aboveBar',
          shape: group.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
          color: group.direction === 'bullish' ? '#22C55E' : '#EF4444',
          size: group.premium >= 1_000_000 ? 1.6 : 1.2,
          text: `BE ${formatBreakevenLevel(dominantBreakeven, roundFigures)}${esBreakevenText}${extraBreakevens} ${formatCompactPremium(group.premium)}`,
        };
      });

    series.setMarkers(markers);
  };

  const updateBreakevenLines = (chart: any) => {
    clearBreakevenLines(chart);

    if ((overlayMode !== 'levels' && overlayMode !== 'both') || !trades || trades.length === 0 || data.length === 0) return;

    const highDeltaTrades = trades.filter(t => Math.abs(parseFloat(t.delta)) > DELTA_THRESHOLD);
    const breakevenGroups = new Map<number, { 
      trades: OptionTrade[], 
      totalPremium: number,
      direction: 'above' | 'below',
      latestTimestamp: string
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
      const existingTime = existing ? parseTradeTime(existing.latestTimestamp) : null;
      const tradeTime = parseTradeTime(trade.timestamp);
      
      if (existing) {
        existing.trades.push(trade);
        existing.totalPremium += premium;
        if (tradeTime !== null && (existingTime === null || tradeTime > existingTime)) {
          existing.latestTimestamp = trade.timestamp;
        }
      } else {
        breakevenGroups.set(breakevenLevel, {
          trades: [trade],
          totalPremium: premium,
          direction,
          latestTimestamp: trade.timestamp
        });
      }
    });

    const breakevenEntries = Array.from(breakevenGroups.entries()).map(([level, group]) => ({
      level,
      ...group,
    }));

    const labeledLevels = new Set<number>();
    [...breakevenEntries]
      .sort((a, b) => b.totalPremium - a.totalPremium)
      .forEach(entry => {
        if (labeledLevels.size >= MAX_LEVEL_LABELS) {
          return;
        }

        const hasNearbyLabel = Array.from(labeledLevels).some(
          labeledLevel => Math.abs(labeledLevel - entry.level) < MIN_LEVEL_LABEL_GAP
        );

        if (!hasNearbyLabel) {
          labeledLevels.add(entry.level);
        }
      });

    // Calculate min and max premiums for scaling line width
    const premiums = breakevenEntries.map(g => g.totalPremium);
    const minPremium = Math.min(...premiums);
    const maxPremium = Math.max(...premiums);
    
    breakevenEntries.forEach(({ level, totalPremium, direction, latestTimestamp }) => {
      const shouldShowLabel = showLabels && labeledLevels.has(level);
      const displayLevel = roundFigures ? level.toFixed(0) : level.toFixed(2);
      const esAdjustedPrice = showEsLabels
        ? ` [ES ${formatEsBreakevenLevel(level, futuresSpread, roundFigures)}]`
        : '';
      const tradeTimeLabel = formatTradeTimeLabel(latestTimestamp);
      const tradeTimeText = tradeTimeLabel ? ` @ ${tradeTimeLabel}` : '';
      const compactLineTitle = shouldShowLabel
        ? `${direction === 'above' ? '▲' : '▼'} ${displayLevel}${esAdjustedPrice}${tradeTimeText} ${formatCompactPremium(totalPremium)}`
        : '';
      // Calculate line width based on premium (1-6 pixels)
      const minWidth = 1;
      const maxWidth = 6;
      let lineWidth = minWidth;
      
      if (maxPremium > minPremium) {
        // Normalize premium to 0-1 range, then scale to width range
        const normalizedPremium = (totalPremium - minPremium) / (maxPremium - minPremium);
        lineWidth = minWidth + (normalizedPremium * (maxWidth - minWidth));
      } else {
        // If all premiums are the same, use middle width
        lineWidth = (minWidth + maxWidth) / 2;
      }

      const lineColor = direction === 'above'
        ? shouldShowLabel ? '#22C55E' : 'rgba(34, 197, 94, 0.45)'
        : shouldShowLabel ? '#EF4444' : 'rgba(239, 68, 68, 0.45)';
      const displayLineWidth = shouldShowLabel
        ? Math.max(2, Math.round(lineWidth))
        : Math.max(1, Math.min(2, Math.round(lineWidth / 2)));
      
      // Only show title/label if showLabels is true
      const lineTitle = showLabels 
        ? `${direction === 'above' ? '▲' : '▼'} $${displayLevel}${esAdjustedPrice}${tradeTimeText} ($${Math.abs(totalPremium / 1_000_000).toFixed(1)}M)`
        : '';
      
      const line = chart.addLineSeries({
        color: lineColor,
        lineWidth: displayLineWidth,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: shouldShowLabel,
        priceLineVisible: false,
        title: lineTitle || compactLineTitle,
      });

      line.setData([
        { time: toChartTime(data[0].time), value: level },
        { time: toChartTime(data[data.length - 1].time), value: level },
      ]);

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
      localization: {
        locale: navigator.language,
        timeFormatter: formatChartTimeLocal,
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
        tickMarkFormatter: formatChartTickLocal,
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
    applySeriesData(series, currentType, data, seriesDataStateRef);

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
      breakevenLinesRef.current = [];
      volumeSeriesRef.current = null;
      seriesRef.current = null;
      seriesDataStateRef.current = null;
      chart.remove();
    };
  }, [symbol]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    applySeriesData(seriesRef.current, currentType, data, seriesDataStateRef);

    if (volumeSeriesRef.current && showVolume && data.length > 0) {
      volumeSeriesRef.current.setData(toVolumeData(data));
    }

    if (data.length > 0 && seriesRef.current) {
      try {
        if (lastPriceLineRef.current) {
          lastPriceLineRef.current.applyOptions({ price: data[data.length - 1].close });
        } else {
          lastPriceLineRef.current = seriesRef.current.createPriceLine({
            price: data[data.length - 1].close,
            color: '#2962FF',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Last',
          });
        }
      } catch (e) {
        console.error('Failed to create price line:', e);
      }
    }
    
    // Don't auto-scroll - let user control the view
    // chartRef.current.timeScale().fitContent();
  }, [data, currentType, showVolume]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (showVolume && !volumeSeriesRef.current) {
      volumeSeriesRef.current = createVolumeSeries(chartRef.current);
      return;
    }

    if (!showVolume && volumeSeriesRef.current) {
      try {
        chartRef.current.removeSeries(volumeSeriesRef.current);
      } catch {
        // Ignore stale series handles after chart teardown.
      }
      volumeSeriesRef.current = null;
    }
  }, [showVolume]);

  const firstDataTime = data[0]?.time ?? 0;
  const lastDataTime = data[data.length - 1]?.time ?? 0;

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    updateBreakevenLines(chartRef.current);
    updateTradeMarkers(seriesRef.current);
  }, [trades, currentType, futuresSpread, roundFigures, showLabels, showEsLabels, overlayMode, firstDataTime, lastDataTime]);

  // Don't auto-scroll when new data arrives - keep the current view stable
  // useEffect(() => {
  //   if (chartRef.current && data.length > 0) {
  //     chartRef.current.timeScale().fitContent();
  //   }
  // }, [data]);

  const currentPrice = data.length > 0 ? data[data.length - 1].close : 0;
  const referencePrice = getLocalDayReferenceClose(data);
  const priceChange = currentPrice - referencePrice;
  const priceChangePercent = referencePrice !== 0 ? (priceChange / referencePrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <div className={`w-full rounded-lg overflow-hidden ${isMaximized ? 'fixed inset-0 z-50 p-4' : ''}`}
         style={{ background: '#131722' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">{symbol}</h2>
              <span className="text-xs text-gray-400 px-2 py-1 bg-gray-800 rounded">{historyDays}D - 1min</span>
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
          <div className="flex overflow-hidden rounded-md border border-gray-700 bg-gray-900" title="Chart overlay mode">
            <button
              onClick={() => setOverlayMode('levels')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                overlayMode === 'levels'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Tags className="h-4 w-4" />
              Levels
            </button>
            <button
              onClick={() => setOverlayMode('trades')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                overlayMode === 'trades'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <ArrowUpDown className="h-4 w-4" />
              Trades
            </button>
            <button
              onClick={() => setOverlayMode('both')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                overlayMode === 'both'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Tag className="h-4 w-4" />
              Both
            </button>
          </div>
          {(overlayMode === 'levels' || overlayMode === 'both') && (
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                showLabels
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              title="Toggle level labels"
            >
              {showLabels ? (
                <Tags className="h-4 w-4" />
              ) : (
                <Tag className="h-4 w-4" />
              )}
            </button>
          )}
          {(overlayMode === 'levels' || overlayMode === 'trades' || overlayMode === 'both') && (
            <button
              onClick={() => setShowEsLabels(!showEsLabels)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                showEsLabels
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              title="Show ES-adjusted breakevens in labels"
            >
              <Tag className="h-4 w-4" />
              ES
            </button>
          )}
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
