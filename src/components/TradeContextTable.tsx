import React, { useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { OptionTrade } from '../types/options';
import { formatCompactTimeLocal } from '../utils/chartTime';

const DELTA_THRESHOLD = 0.64;

interface TradeContextTableProps {
  trades: OptionTrade[];
  roundFigures?: boolean;
}

interface TradeContextRow {
  trade: OptionTrade;
  timeLabel: string;
  direction: 'bullish' | 'bearish';
  premium: number;
  spotAtTrade: number | null;
  breakeven: number;
  gap: number | null;
  gapPercent: number | null;
}

function formatMoney(value: number): string {
  return `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatCompactMoney(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) return `$${(absValue / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `$${(absValue / 1_000).toFixed(1)}K`;
  return `$${absValue.toFixed(0)}`;
}

function formatPrice(value: number, roundFigures?: boolean): string {
  return roundFigures ? value.toFixed(0) : value.toFixed(2);
}

function formatSignedPoints(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function parseTradeDate(timestamp: string): Date | null {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getTradeDirection(trade: OptionTrade): 'bullish' | 'bearish' {
  const [bid, ask] = trade.bidAsk.split('x').map(part => parseFloat(part));
  const midPrice = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : trade.price;
  const isBuy = trade.price >= midPrice;
  const isBullish = (trade.type === 'C' && isBuy) || (trade.type === 'P' && !isBuy);

  return isBullish ? 'bullish' : 'bearish';
}

const TradeContextTable: React.FC<TradeContextTableProps> = ({ trades, roundFigures = false }) => {
  const rows = useMemo<TradeContextRow[]>(() => {
    return trades
      .filter(trade => Math.abs(Number(trade.delta)) > DELTA_THRESHOLD)
      .map(trade => {
        const tradeDate = parseTradeDate(trade.timestamp);
        const spotAtTrade = Number.isFinite(trade.underlyingPrice) && trade.underlyingPrice > 0
          ? trade.underlyingPrice
          : null;
        const breakeven = roundFigures ? Math.round(trade.breakeven) : trade.breakeven;
        const gap = spotAtTrade === null ? null : breakeven - spotAtTrade;
        const gapPercent = spotAtTrade === null || gap === null ? null : (gap / spotAtTrade) * 100;

        return {
          trade,
          timeLabel: tradeDate ? formatCompactTimeLocal(tradeDate) : trade.timestamp,
          direction: getTradeDirection(trade),
          premium: trade.price * trade.quantity * 100,
          spotAtTrade,
          breakeven,
          gap,
          gapPercent,
        };
      })
      .sort((a, b) => {
        const aTime = parseTradeDate(a.trade.timestamp)?.getTime() ?? 0;
        const bTime = parseTradeDate(b.trade.timestamp)?.getTime() ?? 0;
        return bTime - aTime;
      });
  }, [trades, roundFigures]);

  const summary = useMemo(() => {
    const bullishPremium = rows
      .filter(row => row.direction === 'bullish')
      .reduce((sum, row) => sum + row.premium, 0);
    const bearishPremium = rows
      .filter(row => row.direction === 'bearish')
      .reduce((sum, row) => sum + row.premium, 0);
    const totalPremium = bullishPremium + bearishPremium;
    const netPremium = bullishPremium - bearishPremium;
    const weightedGapTotal = rows.reduce((sum, row) => sum + (row.gap === null ? 0 : row.gap * row.premium), 0);
    const weightedAbsGapTotal = rows.reduce((sum, row) => sum + (row.gap === null ? 0 : Math.abs(row.gap) * row.premium), 0);
    const rowsWithGapPremium = rows.reduce((sum, row) => sum + (row.gap === null ? 0 : row.premium), 0);
    const bullishPercent = totalPremium > 0 ? (bullishPremium / totalPremium) * 100 : 0;
    const bias = bullishPercent > 55 ? 'Bullish' : bullishPercent < 45 ? 'Bearish' : 'Balanced';

    return {
      bullishPremium,
      bearishPremium,
      totalPremium,
      netPremium,
      weightedAverageGap: rowsWithGapPremium > 0 ? weightedGapTotal / rowsWithGapPremium : 0,
      weightedAverageAbsGap: rowsWithGapPremium > 0 ? weightedAbsGapTotal / rowsWithGapPremium : 0,
      bullishPercent,
      bias,
    };
  }, [rows]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 bg-slate-950/40 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Trade Context</h3>
            <div className="mt-1 text-xs text-slate-400">
              Spot at trade vs breakeven for high-delta flow
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Bias</div>
              <div className={`font-mono text-sm font-bold ${
                summary.bias === 'Bullish' ? 'text-green-300' : summary.bias === 'Bearish' ? 'text-red-300' : 'text-blue-300'
              }`}>
                {summary.bias} {summary.bullishPercent.toFixed(0)}%
              </div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
              <div className="font-mono text-sm font-bold text-white">{formatCompactMoney(summary.totalPremium)}</div>
            </div>
            <div className="rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Bullish</div>
              <div className="font-mono text-sm font-bold text-green-300">{formatCompactMoney(summary.bullishPremium)}</div>
            </div>
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Bearish</div>
              <div className="font-mono text-sm font-bold text-red-300">{formatCompactMoney(summary.bearishPremium)}</div>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Avg Gap</div>
              <div className="font-mono text-sm font-bold text-slate-100">
                {formatSignedPoints(summary.weightedAverageGap)}
                <span className="ml-1 text-xs text-slate-500">abs {summary.weightedAverageAbsGap.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-700 px-4 py-2 text-left">Time</th>
              <th className="border-b border-slate-700 px-3 py-2 text-left">Flow</th>
              <th className="border-b border-slate-700 px-3 py-2 text-right">Spot</th>
              <th className="border-b border-slate-700 px-3 py-2 text-right">BE</th>
              <th className="border-b border-slate-700 px-3 py-2 text-right">BE - Spot</th>
              <th className="border-b border-slate-700 px-3 py-2 text-right">Move %</th>
              <th className="border-b border-slate-700 px-3 py-2 text-right">Premium</th>
              <th className="border-b border-slate-700 px-4 py-2 text-right">Contract</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.trade.timestamp}-${row.trade.contract}-${index}`} className="hover:bg-slate-800/70">
                <td className="border-b border-slate-800 px-4 py-2 font-mono text-slate-300">{row.timeLabel}</td>
                <td className="border-b border-slate-800 px-3 py-2">
                  <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                    row.direction === 'bullish'
                      ? 'bg-green-500/15 text-green-300'
                      : 'bg-red-500/15 text-red-300'
                  }`}>
                    {row.direction === 'bullish' ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                    {row.direction}
                  </div>
                </td>
                <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-200">
                  {row.spotAtTrade === null ? 'N/A' : `$${formatPrice(row.spotAtTrade, roundFigures)}`}
                </td>
                <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-white">
                  ${formatPrice(row.breakeven, roundFigures)}
                </td>
                <td className={`border-b border-slate-800 px-3 py-2 text-right font-mono ${
                  row.gap === null ? 'text-slate-500' : row.gap >= 0 ? 'text-green-300' : 'text-red-300'
                }`}>
                  {formatSignedPoints(row.gap)}
                </td>
                <td className="border-b border-slate-800 px-3 py-2 text-right font-mono text-slate-300">
                  {row.gapPercent === null ? 'N/A' : `${row.gapPercent >= 0 ? '+' : ''}${row.gapPercent.toFixed(2)}%`}
                </td>
                <td className="border-b border-slate-800 px-3 py-2 text-right font-mono font-semibold text-green-300">
                  {formatMoney(row.premium)}
                </td>
                <td className="max-w-[260px] truncate border-b border-slate-800 px-4 py-2 text-right font-mono text-xs text-slate-400" title={row.trade.contract}>
                  {row.trade.contract}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradeContextTable;
