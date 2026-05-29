import React from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts, EChartsOption } from 'echarts';
import { ArrowUpDown, BarChart3 } from 'lucide-react';
import type { OptionTrade } from '../types/options';

interface PremiumLevelsPageProps {
  trades: OptionTrade[];
  currentPrice: number;
  roundFigures: boolean;
  futuresSpread?: number;
}

type SortKey = 'total' | 'calls' | 'puts' | 'level' | 'distance' | 'trades';
type SortDirection = 'asc' | 'desc';
type RowLimit = '25' | '50' | '100' | 'all';

interface PremiumLevelRow {
  level: number;
  callPremium: number;
  putPremium: number;
  totalPremium: number;
  netCallPremium: number;
  trades: number;
  calls: number;
  puts: number;
  quantity: number;
  distanceFromSpot: number;
}

const GREEN = '#22c55e';
const RED = '#ef4444';
const CHART_TEXT = '#cbd5e1';
const GRID_LINE = 'rgba(148, 163, 184, 0.12)';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'total', label: 'Total' },
  { key: 'calls', label: 'Calls' },
  { key: 'puts', label: 'Puts' },
  { key: 'level', label: 'Level' },
  { key: 'distance', label: 'Distance' },
  { key: 'trades', label: 'Trades' },
];

echarts.use([
  BarChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
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

function getPremium(trade: OptionTrade): number {
  return trade.price * trade.quantity * 100;
}

function buildPremiumRows(trades: OptionTrade[], currentPrice: number, roundFigures: boolean): PremiumLevelRow[] {
  const rows = new Map<number, PremiumLevelRow>();

  trades.forEach(trade => {
    const level = roundFigures ? Math.round(trade.breakeven) : Number(trade.breakeven.toFixed(2));
    const premium = getPremium(trade);
    const row = rows.get(level) ?? {
      level,
      callPremium: 0,
      putPremium: 0,
      totalPremium: 0,
      netCallPremium: 0,
      trades: 0,
      calls: 0,
      puts: 0,
      quantity: 0,
      distanceFromSpot: level - currentPrice,
    };

    if (trade.type === 'C') {
      row.callPremium += premium;
      row.calls += 1;
    } else {
      row.putPremium += premium;
      row.puts += 1;
    }

    row.totalPremium += premium;
    row.netCallPremium = row.callPremium - row.putPremium;
    row.trades += 1;
    row.quantity += trade.quantity;
    row.distanceFromSpot = level - currentPrice;
    rows.set(level, row);
  });

  return Array.from(rows.values());
}

function getSortValue(row: PremiumLevelRow, sortKey: SortKey): number {
  if (sortKey === 'calls') return row.callPremium;
  if (sortKey === 'puts') return row.putPremium;
  if (sortKey === 'level') return row.level;
  if (sortKey === 'distance') return Math.abs(row.distanceFromSpot);
  if (sortKey === 'trades') return row.trades;
  return row.totalPremium;
}

function sortRows(rows: PremiumLevelRow[], sortKey: SortKey, direction: SortDirection): PremiumLevelRow[] {
  const multiplier = direction === 'asc' ? 1 : -1;

  return rows.slice().sort((a, b) => {
    const diff = getSortValue(a, sortKey) - getSortValue(b, sortKey);
    if (diff !== 0) return diff * multiplier;
    return a.level - b.level;
  });
}

function limitRows(rows: PremiumLevelRow[], rowLimit: RowLimit): PremiumLevelRow[] {
  if (rowLimit === 'all') return rows;
  return rows.slice(0, Number(rowLimit));
}

interface EChartPanelProps {
  option: EChartsOption;
  height: number;
}

const EChartPanel: React.FC<EChartPanelProps> = ({ option, height }) => {
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

const PremiumLevelsPage: React.FC<PremiumLevelsPageProps> = ({
  trades,
  currentPrice,
  roundFigures,
  futuresSpread = 0,
}) => {
  const [sortKey, setSortKey] = React.useState<SortKey>('total');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');
  const [rowLimit, setRowLimit] = React.useState<RowLimit>('all');

  const premiumRows = React.useMemo(
    () => buildPremiumRows(trades, currentPrice, roundFigures),
    [currentPrice, roundFigures, trades]
  );
  const sortedRows = React.useMemo(
    () => sortRows(premiumRows, sortKey, sortDirection),
    [premiumRows, sortDirection, sortKey]
  );
  const displayedRows = React.useMemo(() => limitRows(sortedRows, rowLimit), [rowLimit, sortedRows]);

  const totals = React.useMemo(() => {
    const callPremium = premiumRows.reduce((sum, row) => sum + row.callPremium, 0);
    const putPremium = premiumRows.reduce((sum, row) => sum + row.putPremium, 0);
    const totalPremium = callPremium + putPremium;
    const nearestLevel = premiumRows.reduce<PremiumLevelRow | null>((nearest, row) => {
      if (!nearest) return row;
      return Math.abs(row.distanceFromSpot) < Math.abs(nearest.distanceFromSpot) ? row : nearest;
    }, null);

    return {
      callPremium,
      putPremium,
      totalPremium,
      levels: premiumRows.length,
      trades: trades.length,
      netCallPremium: callPremium - putPremium,
      callShare: totalPremium > 0 ? (callPremium / totalPremium) * 100 : 0,
      nearestLevel,
    };
  }, [premiumRows, trades.length]);

  const chartRows = React.useMemo(() => displayedRows.slice().reverse(), [displayedRows]);
  const chartHeight = Math.min(1600, Math.max(440, chartRows.length * 28 + 120));

  const chartOption = React.useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    color: [GREEN, RED],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const item = Array.isArray(params) ? params[0] : params;
        const row = chartRows[item.dataIndex];
        if (!row) return '';

        return [
          `$${formatPrice(row.level, roundFigures)}`,
          `Total: ${formatMoney(row.totalPremium)}`,
          `Calls: ${formatMoney(row.callPremium)}`,
          `Puts: ${formatMoney(row.putPremium)}`,
          `Trades: ${row.trades.toLocaleString()}`,
          `Distance: ${row.distanceFromSpot >= 0 ? '+' : ''}${row.distanceFromSpot.toFixed(2)} pts`,
        ].join('<br/>');
      },
    },
    legend: {
      top: 0,
      textStyle: { color: CHART_TEXT },
    },
    grid: { left: 82, right: 34, top: 46, bottom: 44 },
    xAxis: {
      type: 'value',
      axisLabel: { color: CHART_TEXT, formatter: value => formatMoney(Number(value)) },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    yAxis: {
      type: 'category',
      data: chartRows.map(row => `$${formatPrice(row.level, roundFigures)}`),
      axisLabel: { color: CHART_TEXT },
      axisLine: { lineStyle: { color: GRID_LINE } },
    },
    dataZoom: chartRows.length > 36
      ? [
          { type: 'inside', yAxisIndex: 0, filterMode: 'weakFilter' },
          { type: 'slider', yAxisIndex: 0, right: 2, width: 14, textStyle: { color: CHART_TEXT } },
        ]
      : undefined,
    series: [
      {
        name: 'Calls',
        type: 'bar',
        stack: 'premium',
        data: chartRows.map(row => Math.round(row.callPremium)),
        barMaxWidth: 18,
      },
      {
        name: 'Puts',
        type: 'bar',
        stack: 'premium',
        data: chartRows.map(row => Math.round(row.putPremium)),
        barMaxWidth: 18,
      },
    ],
  }), [chartRows, roundFigures]);

  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-10 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-slate-500" />
        <h2 className="mt-4 text-xl font-semibold text-white">No trades in this filter</h2>
        <p className="mt-2 text-sm text-slate-400">Change the date filter or paste options trades to build premium levels.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Premium</div>
          <div className="mt-2 font-mono text-2xl font-bold text-white">{formatMoney(totals.totalPremium)}</div>
          <div className="mt-1 text-sm text-slate-400">{totals.trades.toLocaleString()} trades</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Call Premium</div>
          <div className="mt-2 font-mono text-2xl font-bold text-green-300">{formatMoney(totals.callPremium)}</div>
          <div className="mt-1 text-sm text-slate-400">{totals.callShare.toFixed(0)}% of total</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Put Premium</div>
          <div className="mt-2 font-mono text-2xl font-bold text-red-300">{formatMoney(totals.putPremium)}</div>
          <div className="mt-1 text-sm text-slate-400">{(100 - totals.callShare).toFixed(0)}% of total</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Net Calls - Puts</div>
          <div className={`mt-2 font-mono text-2xl font-bold ${totals.netCallPremium >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {formatMoney(totals.netCallPremium)}
          </div>
          <div className="mt-1 text-sm text-slate-400">{totals.levels.toLocaleString()} levels</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Nearest Level</div>
          <div className="mt-2 font-mono text-2xl font-bold text-blue-300">
            {totals.nearestLevel ? `$${formatPrice(totals.nearestLevel.level, roundFigures)}` : 'N/A'}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            SPX ${formatPrice(currentPrice, roundFigures)}
            {futuresSpread > 0 && ` / ES $${formatPrice(currentPrice + futuresSpread, roundFigures)}`}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Premium By Breakeven Level</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortKey}
              onChange={event => setSortKey(event.target.value as SortKey)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortDirection === 'desc' ? 'High to Low' : 'Low to High'}
            </button>
            <select
              value={rowLimit}
              onChange={event => setRowLimit(event.target.value as RowLimit)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200"
            >
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        <EChartPanel option={chartOption} height={chartHeight} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Premium Levels Table</h2>
          <div className="text-sm text-slate-400">{displayedRows.length.toLocaleString()} of {premiumRows.length.toLocaleString()} levels</div>
        </div>
        <div className="max-h-[720px] overflow-auto rounded-lg border border-slate-800">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-800 px-3 py-2 text-left">Level</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Total</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Calls</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Puts</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Net C-P</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Trades</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">Qty</th>
                <th className="border-b border-slate-800 px-3 py-2 text-right">SPX Gap</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map(row => (
                <tr key={row.level} className="hover:bg-slate-900">
                  <td className="border-b border-slate-800 px-3 py-2">
                    <div className="font-mono font-semibold text-white">${formatPrice(row.level, roundFigures)}</div>
                    {futuresSpread > 0 && (
                      <div className="mt-0.5 text-xs text-blue-300">ES ${formatPrice(row.level + futuresSpread, roundFigures)}</div>
                    )}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono font-semibold text-slate-100">{formatMoney(row.totalPremium)}</td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-green-300">{formatMoney(row.callPremium)}</td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-red-300">{formatMoney(row.putPremium)}</td>
                  <td className={`border-b border-slate-800 px-3 py-2 text-right font-mono ${row.netCallPremium >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {formatMoney(row.netCallPremium)}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">
                    {row.trades.toLocaleString()}
                    <div className="text-xs text-slate-500">{row.calls}C / {row.puts}P</div>
                  </td>
                  <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">{row.quantity.toLocaleString()}</td>
                  <td className={`border-b border-slate-800 px-3 py-2 text-right font-mono ${row.distanceFromSpot >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {row.distanceFromSpot >= 0 ? '+' : ''}{row.distanceFromSpot.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default PremiumLevelsPage;
