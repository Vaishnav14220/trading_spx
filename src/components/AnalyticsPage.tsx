import React from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import { Activity, BarChart3, Layers, Target, TrendingUp } from 'lucide-react';
import type { ChartData } from '../types/chart';
import type { OptionTrade } from '../types/options';
import { extractDateKey, formatDateLabel } from '../utils/dateUtils';

type Bias = 'bullish' | 'bearish' | 'mixed';
type IntentBucket = 'OTM Sold Flow' | 'ATM Mixed Flow' | 'ITM Bought Flow';

interface AnalyticsPageProps {
  trades: OptionTrade[];
  allTrades: OptionTrade[];
  stockData: ChartData[];
  currentPrice: number;
  roundFigures: boolean;
}

interface IntentTrade {
  trade: OptionTrade;
  timeMs: number;
  premium: number;
  absDelta: number;
  bucket: IntentBucket;
  bias: Bias;
  signedPremium: number;
  spotAtTrade: number | null;
  breakevenDistance: number | null;
}

interface BucketSummary {
  bucket: IntentBucket;
  trades: number;
  bullishPremium: number;
  bearishPremium: number;
  totalPremium: number;
  netPremium: number;
}

const BUCKETS: IntentBucket[] = ['OTM Sold Flow', 'ATM Mixed Flow', 'ITM Bought Flow'];
const CHART_TEXT = '#cbd5e1';
const GRID_LINE = 'rgba(148, 163, 184, 0.12)';
const GREEN = '#22c55e';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const CYAN = '#14b8a6';

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

function formatMoney(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000) return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `${sign}$${(absValue / 1_000).toFixed(1)}K`;
  return `${sign}$${absValue.toFixed(0)}`;
}

function formatPrice(value: number, roundFigures: boolean): string {
  return roundFigures ? value.toFixed(0) : value.toFixed(2);
}

function parseTradeTimeMs(timestamp: string): number | null {
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getPremium(trade: OptionTrade): number {
  return trade.price * trade.quantity * 100;
}

function getAbsDelta(trade: OptionTrade): number {
  const parsedDelta = Math.abs(Number.parseFloat(String(trade.delta)));
  if (Number.isFinite(parsedDelta) && parsedDelta > 0) return parsedDelta;
  return Number.isFinite(trade.absDelta) ? Math.abs(trade.absDelta) : 0;
}

function classifyIntent(trade: OptionTrade): Pick<IntentTrade, 'bucket' | 'bias' | 'signedPremium'> {
  const premium = getPremium(trade);
  const absDelta = getAbsDelta(trade);

  if (absDelta < 0.4) {
    const bias: Bias = trade.type === 'P' ? 'bullish' : 'bearish';
    return {
      bucket: 'OTM Sold Flow',
      bias,
      signedPremium: bias === 'bullish' ? premium : -premium,
    };
  }

  if (absDelta > 0.6) {
    const bias: Bias = trade.type === 'C' ? 'bullish' : 'bearish';
    return {
      bucket: 'ITM Bought Flow',
      bias,
      signedPremium: bias === 'bullish' ? premium : -premium,
    };
  }

  const bias: Bias = trade.type === 'C' ? 'bullish' : 'bearish';
  return {
    bucket: 'ATM Mixed Flow',
    bias,
    signedPremium: (bias === 'bullish' ? premium : -premium) * 0.35,
  };
}

function toIntentTrades(trades: OptionTrade[]): IntentTrade[] {
  return trades
    .map(trade => {
      const timeMs = parseTradeTimeMs(trade.timestamp);
      if (timeMs === null) return null;

      const intent = classifyIntent(trade);
      const premium = getPremium(trade);
      const spotAtTrade = Number.isFinite(trade.underlyingPrice) && trade.underlyingPrice > 0
        ? trade.underlyingPrice
        : null;

      return {
        trade,
        timeMs,
        premium,
        absDelta: getAbsDelta(trade),
        bucket: intent.bucket,
        bias: intent.bias,
        signedPremium: intent.signedPremium,
        spotAtTrade,
        breakevenDistance: spotAtTrade === null ? null : trade.breakeven - spotAtTrade,
      };
    })
    .filter((trade): trade is IntentTrade => trade !== null)
    .sort((a, b) => a.timeMs - b.timeMs);
}

function createBucketSummaries(intentTrades: IntentTrade[]): BucketSummary[] {
  const summaries = new Map<IntentBucket, BucketSummary>();

  BUCKETS.forEach(bucket => {
    summaries.set(bucket, {
      bucket,
      trades: 0,
      bullishPremium: 0,
      bearishPremium: 0,
      totalPremium: 0,
      netPremium: 0,
    });
  });

  intentTrades.forEach(intent => {
    const summary = summaries.get(intent.bucket);
    if (!summary) return;

    summary.trades += 1;
    summary.totalPremium += intent.premium;
    if (intent.signedPremium >= 0) {
      summary.bullishPremium += Math.abs(intent.signedPremium);
    } else {
      summary.bearishPremium += Math.abs(intent.signedPremium);
    }
    summary.netPremium = summary.bullishPremium - summary.bearishPremium;
  });

  return BUCKETS.map(bucket => summaries.get(bucket)!);
}

function formatTimeBucket(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildFlowTimeline(intentTrades: IntentTrade[]) {
  const bucketMs = 5 * 60 * 1000;
  const buckets = new Map<number, { bullish: number; bearish: number; net: number }>();

  intentTrades.forEach(intent => {
    const bucketTime = Math.floor(intent.timeMs / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketTime) ?? { bullish: 0, bearish: 0, net: 0 };
    if (intent.signedPremium >= 0) {
      bucket.bullish += Math.abs(intent.signedPremium);
    } else {
      bucket.bearish += Math.abs(intent.signedPremium);
    }
    bucket.net += intent.signedPremium;
    buckets.set(bucketTime, bucket);
  });

  let cvd = 0;
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timeMs, bucket]) => {
      cvd += bucket.net;
      return {
        timeMs,
        label: formatTimeBucket(timeMs),
        bullish: bucket.bullish,
        bearish: -bucket.bearish,
        net: bucket.net,
        cvd,
      };
    });
}

function findCloseAtOrAfter(stockData: ChartData[], targetMs: number): number | null {
  if (stockData.length === 0) return null;

  let left = 0;
  let right = stockData.length - 1;
  let matchIndex = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const timeMs = stockData[mid].time * 1000;

    if (timeMs >= targetMs) {
      matchIndex = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return matchIndex >= 0 ? stockData[matchIndex].close : null;
}

function buildOutcomeStats(intentTrades: IntentTrade[], stockData: ChartData[]) {
  const horizons = [
    { label: '15m', ms: 15 * 60 * 1000 },
    { label: '30m', ms: 30 * 60 * 1000 },
    { label: '60m', ms: 60 * 60 * 1000 },
  ];

  return horizons.map(horizon => {
    const outcomes = intentTrades
      .map(intent => {
        const spot = intent.spotAtTrade ?? findCloseAtOrAfter(stockData, intent.timeMs);
        const futureClose = findCloseAtOrAfter(stockData, intent.timeMs + horizon.ms);

        if (spot === null || futureClose === null || intent.bias === 'mixed') return null;

        const directionalMove = intent.bias === 'bullish'
          ? futureClose - spot
          : spot - futureClose;

        return {
          directionalMove,
          premium: intent.premium,
          won: directionalMove > 0,
        };
      })
      .filter((outcome): outcome is { directionalMove: number; premium: number; won: boolean } => outcome !== null);

    const totalPremium = outcomes.reduce((sum, outcome) => sum + outcome.premium, 0);
    const weightedMove = outcomes.reduce((sum, outcome) => sum + outcome.directionalMove * outcome.premium, 0);
    const wins = outcomes.filter(outcome => outcome.won).length;

    return {
      label: horizon.label,
      sampleSize: outcomes.length,
      winRate: outcomes.length > 0 ? (wins / outcomes.length) * 100 : 0,
      avgMove: outcomes.length > 0
        ? outcomes.reduce((sum, outcome) => sum + outcome.directionalMove, 0) / outcomes.length
        : 0,
      weightedMove: totalPremium > 0 ? weightedMove / totalPremium : 0,
    };
  });
}

function buildBreakevenRows(intentTrades: IntentTrade[], roundFigures: boolean) {
  const levels = new Map<number, {
    level: number;
    trades: number;
    totalPremium: number;
    bullishPremium: number;
    bearishPremium: number;
    weightedDistance: number;
    distancePremium: number;
  }>();

  intentTrades.forEach(intent => {
    const level = roundFigures ? Math.round(intent.trade.breakeven) : Number(intent.trade.breakeven.toFixed(2));
    const row = levels.get(level) ?? {
      level,
      trades: 0,
      totalPremium: 0,
      bullishPremium: 0,
      bearishPremium: 0,
      weightedDistance: 0,
      distancePremium: 0,
    };

    row.trades += 1;
    row.totalPremium += intent.premium;
    if (intent.signedPremium >= 0) {
      row.bullishPremium += Math.abs(intent.signedPremium);
    } else {
      row.bearishPremium += Math.abs(intent.signedPremium);
    }

    if (intent.breakevenDistance !== null) {
      row.weightedDistance += intent.breakevenDistance * intent.premium;
      row.distancePremium += intent.premium;
    }

    levels.set(level, row);
  });

  return Array.from(levels.values())
    .map(row => ({
      ...row,
      netPremium: row.bullishPremium - row.bearishPremium,
      avgDistance: row.distancePremium > 0 ? row.weightedDistance / row.distancePremium : null,
    }))
    .sort((a, b) => b.totalPremium - a.totalPremium);
}

function buildHeatmap(intentTrades: IntentTrade[]) {
  const dates = Array.from(new Set(intentTrades.map(intent => extractDateKey(intent.trade.timestamp)))).sort();
  const hours = Array.from({ length: 24 }, (_, hour) => `${hour.toString().padStart(2, '0')}:00`);
  const cells = new Map<string, number>();

  intentTrades.forEach(intent => {
    const date = extractDateKey(intent.trade.timestamp);
    const hour = new Date(intent.timeMs).getHours();
    const key = `${date}|${hour}`;
    cells.set(key, (cells.get(key) ?? 0) + intent.signedPremium);
  });

  const values = dates.flatMap((date, dateIndex) =>
    hours.map((_, hourIndex) => [
      hourIndex,
      dateIndex,
      Math.round(cells.get(`${date}|${hourIndex}`) ?? 0),
    ])
  );

  return { dates, hours, values };
}

interface EChartPanelProps {
  option: EChartsOption;
  height?: number;
}

const EChartPanel: React.FC<EChartPanelProps> = ({ option, height = 320 }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<ECharts | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  tone?: 'green' | 'red' | 'blue' | 'slate';
}> = ({ label, value, detail, tone = 'slate' }) => {
  const colorClass = tone === 'green'
    ? 'text-green-300'
    : tone === 'red'
    ? 'text-red-300'
    : tone === 'blue'
    ? 'text-blue-300'
    : 'text-white';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
    <div className="mb-4 flex items-center gap-2">
      <div className="text-blue-400">{icon}</div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
    {children}
  </section>
);

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  trades,
  allTrades,
  stockData,
  currentPrice,
  roundFigures,
}) => {
  const intentTrades = React.useMemo(() => toIntentTrades(trades), [trades]);
  const bucketSummaries = React.useMemo(() => createBucketSummaries(intentTrades), [intentTrades]);
  const timeline = React.useMemo(() => buildFlowTimeline(intentTrades), [intentTrades]);
  const outcomeStats = React.useMemo(() => buildOutcomeStats(intentTrades, stockData), [intentTrades, stockData]);
  const breakevenRows = React.useMemo(() => buildBreakevenRows(intentTrades, roundFigures), [intentTrades, roundFigures]);
  const heatmap = React.useMemo(() => buildHeatmap(intentTrades), [intentTrades]);

  const overview = React.useMemo(() => {
    const totalPremium = intentTrades.reduce((sum, intent) => sum + intent.premium, 0);
    const netPremium = intentTrades.reduce((sum, intent) => sum + intent.signedPremium, 0);
    const bullishPremium = intentTrades.reduce((sum, intent) => sum + Math.max(0, intent.signedPremium), 0);
    const bearishPremium = intentTrades.reduce((sum, intent) => sum + Math.max(0, -intent.signedPremium), 0);
    const directionalTotal = bullishPremium + bearishPremium;
    const averageDistance = intentTrades.reduce((sum, intent) => sum + (intent.breakevenDistance ?? 0), 0) /
      Math.max(1, intentTrades.filter(intent => intent.breakevenDistance !== null).length);

    return {
      totalPremium,
      netPremium,
      bullishShare: directionalTotal > 0 ? (bullishPremium / directionalTotal) * 100 : 0,
      averageDistance,
      uniqueStoredTrades: allTrades.length,
      filteredTrades: trades.length,
      bias: netPremium > 0 ? 'bullish' : netPremium < 0 ? 'bearish' : 'balanced',
    };
  }, [allTrades.length, intentTrades, trades.length]);

  const flowOption = React.useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    color: [GREEN, RED, BLUE],
    tooltip: {
      trigger: 'axis',
      valueFormatter: value => formatMoney(Number(value)),
    },
    legend: {
      top: 0,
      textStyle: { color: CHART_TEXT },
    },
    grid: { left: 58, right: 28, top: 48, bottom: 42 },
    xAxis: {
      type: 'category',
      data: timeline.map(point => point.label),
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: { color: CHART_TEXT, formatter: value => formatMoney(Number(value)) },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
    ],
    series: [
      {
        name: 'Bullish Flow',
        type: 'bar',
        stack: 'flow',
        data: timeline.map(point => Math.round(point.bullish)),
        barMaxWidth: 14,
      },
      {
        name: 'Bearish Flow',
        type: 'bar',
        stack: 'flow',
        data: timeline.map(point => Math.round(point.bearish)),
        barMaxWidth: 14,
      },
      {
        name: 'Intent CVD',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3 },
        data: timeline.map(point => Math.round(point.cvd)),
      },
    ],
  }), [timeline]);

  const bucketOption = React.useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    color: [GREEN, RED],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: value => formatMoney(Number(value)),
    },
    legend: {
      top: 0,
      textStyle: { color: CHART_TEXT },
    },
    grid: { left: 108, right: 24, top: 44, bottom: 28 },
    xAxis: {
      type: 'value',
      axisLabel: { color: CHART_TEXT, formatter: value => formatMoney(Number(value)) },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: {
      type: 'category',
      data: bucketSummaries.map(summary => summary.bucket),
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        name: 'Bullish',
        type: 'bar',
        stack: 'premium',
        data: bucketSummaries.map(summary => Math.round(summary.bullishPremium)),
      },
      {
        name: 'Bearish',
        type: 'bar',
        stack: 'premium',
        data: bucketSummaries.map(summary => -Math.round(summary.bearishPremium)),
      },
    ],
  }), [bucketSummaries]);

  const outcomeOption = React.useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    color: [CYAN, BLUE],
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      textStyle: { color: CHART_TEXT },
    },
    grid: { left: 52, right: 32, top: 46, bottom: 36 },
    xAxis: {
      type: 'category',
      data: outcomeStats.map(stat => stat.label),
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Win %',
        min: 0,
        max: 100,
        axisLabel: { color: CHART_TEXT, formatter: '{value}%' },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      {
        type: 'value',
        name: 'Pts',
        axisLabel: { color: CHART_TEXT },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Win Rate',
        type: 'bar',
        data: outcomeStats.map(stat => Number(stat.winRate.toFixed(1))),
        barMaxWidth: 34,
      },
      {
        name: 'Premium Weighted Move',
        type: 'line',
        yAxisIndex: 1,
        data: outcomeStats.map(stat => Number(stat.weightedMove.toFixed(2))),
        symbolSize: 8,
        lineStyle: { width: 3 },
      },
    ],
  }), [outcomeStats]);

  const breakevenOption = React.useMemo<EChartsOption>(() => {
    const rows = breakevenRows.slice(0, 12).reverse();

    return {
      backgroundColor: 'transparent',
      color: [GREEN, RED],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: value => formatMoney(Number(value)),
      },
      grid: { left: 76, right: 24, top: 24, bottom: 26 },
      xAxis: {
        type: 'value',
        axisLabel: { color: CHART_TEXT, formatter: value => formatMoney(Number(value)) },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      yAxis: {
        type: 'category',
        data: rows.map(row => `$${formatPrice(row.level, roundFigures)}`),
        axisLabel: { color: CHART_TEXT },
        axisLine: { lineStyle: { color: GRID_LINE } },
      },
      series: [
        {
          name: 'Net Premium',
          type: 'bar',
          data: rows.map(row => ({
            value: Math.round(row.netPremium),
            itemStyle: { color: row.netPremium >= 0 ? GREEN : RED },
          })),
          barMaxWidth: 18,
        },
      ],
    };
  }, [breakevenRows, roundFigures]);

  const heatmapOption = React.useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: params => {
        const item = Array.isArray(params) ? params[0] : params;
        const rawValue = 'value' in item ? item.value : null;
        const value = Array.isArray(rawValue) ? Number(rawValue[2]) : 0;
        return `Net intent: ${formatMoney(value)}`;
      },
    },
    grid: { left: 86, right: 30, top: 24, bottom: 42 },
    xAxis: {
      type: 'category',
      data: heatmap.hours,
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: heatmap.dates.map(formatDateLabel),
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
      splitArea: { show: true },
    },
    visualMap: {
      min: -Math.max(1, ...heatmap.values.map(value => Math.abs(Number(value[2])))),
      max: Math.max(1, ...heatmap.values.map(value => Math.abs(Number(value[2])))),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: { color: CHART_TEXT },
      inRange: { color: [RED, '#1e293b', GREEN] },
    },
    series: [{
      type: 'heatmap',
      data: heatmap.values,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.4)',
        },
      },
    }],
  }), [heatmap]);

  const outcomeRows = React.useMemo(() => {
    return intentTrades
      .slice()
      .reverse()
      .slice(0, 80)
      .map(intent => {
        const spot = intent.spotAtTrade ?? findCloseAtOrAfter(stockData, intent.timeMs);
        const after30 = findCloseAtOrAfter(stockData, intent.timeMs + 30 * 60 * 1000);
        const directionalMove = spot === null || after30 === null
          ? null
          : intent.bias === 'bullish'
          ? after30 - spot
          : spot - after30;

        return {
          ...intent,
          spot,
          after30,
          directionalMove,
          timeLabel: new Date(intent.timeMs).toLocaleString(undefined, {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        };
      });
  }, [intentTrades, stockData]);

  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-10 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-slate-500" />
        <h2 className="mt-4 text-xl font-semibold text-white">No trades in this filter</h2>
        <p className="mt-2 text-sm text-slate-400">Change the date filter or paste options trades to build analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Filtered Trades"
          value={overview.filteredTrades.toLocaleString()}
          detail={`${overview.uniqueStoredTrades.toLocaleString()} stored total`}
          tone="blue"
        />
        <MetricCard
          label="Total Premium"
          value={formatMoney(overview.totalPremium)}
          detail="contract premium x 100"
        />
        <MetricCard
          label="Intent CVD"
          value={formatMoney(overview.netPremium)}
          detail={`${overview.bias} aggregate flow`}
          tone={overview.netPremium >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          label="Bullish Share"
          value={`${overview.bullishShare.toFixed(0)}%`}
          detail="directional premium share"
          tone={overview.bullishShare >= 50 ? 'green' : 'red'}
        />
        <MetricCard
          label="Avg BE Gap"
          value={`${overview.averageDistance >= 0 ? '+' : ''}${overview.averageDistance.toFixed(2)}`}
          detail={`current SPX $${formatPrice(currentPrice, roundFigures)}`}
        />
      </div>

      <Section title="Flow Score Timeline" icon={<Activity className="h-5 w-5" />}>
        <EChartPanel option={flowOption} height={360} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Delta Bucket Sentiment" icon={<Layers className="h-5 w-5" />}>
          <EChartPanel option={bucketOption} height={300} />
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {bucketSummaries.map(summary => (
              <div key={summary.bucket} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-semibold text-white">{summary.bucket}</div>
                <div className={`mt-1 font-mono text-lg font-bold ${summary.netPremium >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {formatMoney(summary.netPremium)}
                </div>
                <div className="mt-1 text-xs text-slate-500">{summary.trades.toLocaleString()} trades</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Outcome Windows" icon={<TrendingUp className="h-5 w-5" />}>
          <EChartPanel option={outcomeOption} height={300} />
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {outcomeStats.map(stat => (
              <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div className="text-sm font-semibold text-white">{stat.label}</div>
                <div className="mt-1 font-mono text-lg font-bold text-blue-300">{stat.winRate.toFixed(0)}%</div>
                <div className="mt-1 text-xs text-slate-500">
                  {stat.sampleSize} samples, {stat.weightedMove >= 0 ? '+' : ''}{stat.weightedMove.toFixed(2)} pts weighted
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Section title="Breakeven Strength" icon={<Target className="h-5 w-5" />}>
          <EChartPanel option={breakevenOption} height={360} />
        </Section>

        <Section title="Time-of-Day Intent Heatmap" icon={<BarChart3 className="h-5 w-5" />}>
          <EChartPanel option={heatmapOption} height={360} />
        </Section>
      </div>

      <Section title="Top Breakeven Levels" icon={<Target className="h-5 w-5" />}>
        <div className="overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2 text-left">Level</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Trades</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Total Premium</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Net Intent</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Avg BE - Spot</th>
              </tr>
            </thead>
            <tbody>
              {breakevenRows.slice(0, 20).map(row => (
                <tr key={row.level} className="hover:bg-slate-900">
                  <td className="border-b border-slate-800 px-3 py-2 font-mono text-white">${formatPrice(row.level, roundFigures)}</td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">{row.trades}</td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-200">{formatMoney(row.totalPremium)}</td>
                  <td className={`border-b border-slate-800 px-3 py-2 text-right font-mono ${row.netPremium >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {formatMoney(row.netPremium)}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">
                    {row.avgDistance === null ? 'N/A' : `${row.avgDistance >= 0 ? '+' : ''}${row.avgDistance.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Trade Outcome Table" icon={<Activity className="h-5 w-5" />}>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2 text-left">Time</th>
                <th className="border-b border-slate-800 px-3 py-2 text-left">Intent</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Spot</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">30m Close</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Directional Move</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">BE</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Premium</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Contract</th>
              </tr>
            </thead>
            <tbody>
              {outcomeRows.map((row, index) => (
                <tr key={`${row.trade.timestamp}-${row.trade.contract}-${index}`} className="hover:bg-slate-900">
                  <td className="border-b border-slate-800 px-3 py-2 font-mono text-slate-300">{row.timeLabel}</td>
                  <td className="border-b border-slate-800 px-3 py-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      row.bias === 'bullish' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
                    }`}>
                      {row.bias}
                    </span>
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">
                    {row.spot === null ? 'N/A' : `$${formatPrice(row.spot, roundFigures)}`}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">
                    {row.after30 === null ? 'N/A' : `$${formatPrice(row.after30, roundFigures)}`}
                  </td>
                  <td className={`border-b border-slate-800 px-3 py-2 text-right font-mono ${
                    row.directionalMove === null ? 'text-slate-500' : row.directionalMove >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {row.directionalMove === null ? 'N/A' : `${row.directionalMove >= 0 ? '+' : ''}${row.directionalMove.toFixed(2)}`}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-white">
                    ${formatPrice(row.trade.breakeven, roundFigures)}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-200">{formatMoney(row.premium)}</td>
                  <td className="max-w-[260px] truncate border-b border-slate-800 px-3 py-2 text-right font-mono text-xs text-slate-500" title={row.trade.contract}>
                    {row.trade.contract}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

export default AnalyticsPage;
