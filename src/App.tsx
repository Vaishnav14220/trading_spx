import React, { useState, useEffect } from 'react';
import { StockChart } from './components/StockChart';
import { fetchSPXData } from './services/stockApi';
import { parseOptionsData } from './services/optionsParser';
import type { ChartData } from './types/chart';
import { LineChart, RefreshCw, Trash2 } from 'lucide-react';
import OptionsTable from './components/OptionsTable';
import OptionsSummary from './components/OptionsSummary';
import OptionsInput from './components/OptionsInput';
import SentimentAnalysis from './components/SentimentAnalysis';
import DateFilter from './components/DateFilter';
import { isToday, extractDate } from './utils/dateUtils';

const App: React.FC = () => {
  const [stockData, setStockData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [showTodayOnly, setShowTodayOnly] = useState(false);
  const [optionsData, setOptionsData] = useState({
    trades: [],
    summary: {
      totalCallVolume: 0,
      totalPutVolume: 0,
      averageCallPrice: 0,
      averagePutPrice: 0,
      averageCallBreakeven: 0,
      averagePutBreakeven: 0,
    },
  });

  // Extract unique dates from trades
  const tradeDates = React.useMemo(() => {
    const dates = optionsData.trades.map(trade => extractDate(trade.timestamp));
    return [...new Set(dates)].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [optionsData.trades]);

  // Filter trades based on selected date and today filter
  const filteredTrades = React.useMemo(() => {
    if (showTodayOnly) {
      return optionsData.trades.filter(trade => isToday(trade.timestamp));
    }
    
    if (selectedDate === 'all') return optionsData.trades;
    
    return optionsData.trades.filter(trade => {
      const tradeDate = extractDate(trade.timestamp);
      return tradeDate === selectedDate;
    });
  }, [optionsData.trades, selectedDate, showTodayOnly]);

  const handleOptionsSubmit = (data: string) => {
    const parsed = parseOptionsData(data);
    setOptionsData(parsed);
    setSelectedDate('all');
    setShowTodayOnly(false);
  };

  const handleClearTrades = () => {
    setOptionsData({
      trades: [],
      summary: {
        totalCallVolume: 0,
        totalPutVolume: 0,
        averageCallPrice: 0,
        averagePutPrice: 0,
        averageCallBreakeven: 0,
        averagePutBreakeven: 0,
      },
    });
    setSelectedDate('all');
    setShowTodayOnly(false);
  };

  const loadSPXData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchSPXData();
      setStockData(data);
      if (data.length > 0) {
        setCurrentPrice(data[data.length - 1].close);
      }
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch SPX data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSPXData();
    const interval = setInterval(loadSPXData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-800 p-4 md:p-8">
      <div className="max-w-[1920px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LineChart className="h-8 w-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-white">S&P 500 Live Chart</h1>
          </div>
          <div className="flex items-center gap-4">
            <DateFilter
              dates={tradeDates}
              selectedDate={selectedDate}
              showTodayOnly={showTodayOnly}
              onDateChange={setSelectedDate}
              onTodayFilterChange={setShowTodayOnly}
            />
            <button
              onClick={loadSPXData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleClearTrades}
            className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            <Trash2 className="h-5 w-5" />
            <span className="font-semibold">Clear All Trades</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <SentimentAnalysis trades={filteredTrades} currentPrice={currentPrice} />
          </div>
          <div className="lg:col-span-7">
            {loading && !stockData.length ? (
              <div className="flex items-center justify-center h-96 bg-slate-900 rounded-lg">
                <div className="text-white">Loading chart data...</div>
              </div>
            ) : (
              stockData.length > 0 && (
                <StockChart data={stockData} symbol="SPX" trades={filteredTrades} />
              )
            )}
          </div>
        </div>

        <div className="text-sm text-gray-400 text-center">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Process Options Data</h2>
            <OptionsInput onSubmit={handleOptionsSubmit} />
          </div>
          
          <div className="space-y-6">
            <OptionsSummary summary={optionsData.summary} />
            <OptionsTable trades={filteredTrades} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;