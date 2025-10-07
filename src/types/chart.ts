export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface StockChartProps {
  data: ChartData[];
  symbol: string;
  chartType?: 'candlestick' | 'line';
}