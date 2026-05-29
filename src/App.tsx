import React, { Suspense, useEffect, useRef, useState } from 'react';
import { fetchSPXData } from './services/stockApi';
import { getWebSocketService } from './services/websocketApi';
import { getAuthService } from './services/capitalAuth';
import { fetchCapitalHistoricalData } from './services/capitalHistoricalApi';
import { fetchFuturesSpread, FuturesSpreadData } from './services/futuresApi';
import { getFuturesWebSocketService, FuturesRealtimeData } from './services/futuresWebSocket';
import { parseOptionsData } from './services/optionsParser';
import { appendStoredOptionsTrades, clearStoredOptionsTrades, loadStoredOptionsTrades } from './services/optionsStorage';
import type { ChartData } from './types/chart';
import type { ParsedOptionData } from './types/options';
import { BarChart3, LineChart, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import OptionsTable from './components/OptionsTable';
import OptionsSummary from './components/OptionsSummary';
import OptionsInput from './components/OptionsInput';
import SentimentAnalysis from './components/SentimentAnalysis';
import DateFilter from './components/DateFilter';
import CapitalSettings from './components/CapitalSettings';
import ProcessOptionsWidget from './components/ProcessOptionsWidget';
import { extractDateKey, formatLocalDateKey } from './utils/dateUtils';
import { DEFAULT_SPOT_EPIC, getStoredFuturesEpic } from './utils/marketDefaults';

const HISTORICAL_DAYS = 5;
const HISTORICAL_FETCH_TIMEOUT_MS = 60000;
const DEBUG_APP = import.meta.env.DEV && import.meta.env.VITE_DEBUG_MARKET_DATA === 'true';
const EMPTY_OPTIONS_DATA: ParsedOptionData = {
  trades: [],
  summary: {
    totalCallVolume: 0,
    totalPutVolume: 0,
    averageCallPrice: 0,
    averagePutPrice: 0,
    averageCallBreakeven: 0,
    averagePutBreakeven: 0,
  },
};
const StockChart = React.lazy(() => import('./components/StockChart').then(module => ({ default: module.StockChart })));
const FlowChart = React.lazy(() => import('./components/FlowChart'));
const AnalyticsPage = React.lazy(() => import('./components/AnalyticsPage'));

const ChartFallback = () => (
  <div className="flex h-96 items-center justify-center rounded-lg bg-slate-900 text-sm text-slate-400">
    Loading chart...
  </div>
);

const App: React.FC = () => {
  const [stockData, setStockData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [showTodayOnly, setShowTodayOnly] = useState(false);
  const [roundFigures, setRoundFigures] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [useRealtime, setUseRealtime] = useState(true);
  const [credentialsSet, setCredentialsSet] = useState(false);
  const [futuresSpread, setFuturesSpread] = useState<FuturesSpreadData | FuturesRealtimeData | null>(null);
  const [futuresConnected, setFuturesConnected] = useState(false);
  const [futuresUpdateFlash, setFuturesUpdateFlash] = useState(false);
  const futuresFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optionsData, setOptionsData] = useState<ParsedOptionData>(EMPTY_OPTIONS_DATA);
  const [optionsStorageStatus, setOptionsStorageStatus] = useState('');
  const [activePage, setActivePage] = useState<'chart' | 'analytics'>(() => (
    window.location.hash === '#analytics' ? 'analytics' : 'chart'
  ));

  // Extract unique dates from trades
  const tradeDates = React.useMemo(() => {
    const dates = optionsData.trades.map(trade => extractDateKey(trade.timestamp));
    return [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  }, [optionsData.trades]);

  // Filter trades based on selected date and today filter
  const filteredTrades = React.useMemo(() => {
    if (showTodayOnly) {
      const todayKey = formatLocalDateKey(new Date());
      return optionsData.trades.filter(trade => extractDateKey(trade.timestamp) === todayKey);
    }

    if (dateRangeStart || dateRangeEnd) {
      const rangeStart = dateRangeStart && dateRangeEnd && dateRangeStart > dateRangeEnd ? dateRangeEnd : dateRangeStart;
      const rangeEnd = dateRangeStart && dateRangeEnd && dateRangeStart > dateRangeEnd ? dateRangeStart : dateRangeEnd;

      return optionsData.trades.filter(trade => {
        const tradeDate = extractDateKey(trade.timestamp);
        return (!rangeStart || tradeDate >= rangeStart) && (!rangeEnd || tradeDate <= rangeEnd);
      });
    }
    
    if (selectedDate === 'all') return optionsData.trades;
    
    return optionsData.trades.filter(trade => {
      const tradeDate = extractDateKey(trade.timestamp);
      return tradeDate === selectedDate;
    });
  }, [dateRangeEnd, dateRangeStart, optionsData.trades, selectedDate, showTodayOnly]);
  const deferredCurrentPrice = React.useDeferredValue(currentPrice);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setDateRangeStart('');
    setDateRangeEnd('');
    if (date !== 'all') {
      setShowTodayOnly(false);
    }
  };

  const handleDateRangeChange = (start: string, end: string) => {
    setDateRangeStart(start);
    setDateRangeEnd(end);
    if (start || end) {
      setSelectedDate('all');
      setShowTodayOnly(false);
    }
  };

  const handleTodayFilterChange = (todayOnly: boolean) => {
    setShowTodayOnly(todayOnly);
    if (todayOnly) {
      setSelectedDate('all');
      setDateRangeStart('');
      setDateRangeEnd('');
    }
  };

  const handlePageChange = (page: 'chart' | 'analytics') => {
    setActivePage(page);
    const nextHash = page === 'analytics' ? '#analytics' : '#chart';
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
  };

  const processAndStoreOptionsData = async (data: string) => {
    const parsed = parseOptionsData(data);

    if (parsed.trades.length === 0) {
      setError('No valid options trades found in the pasted data.');
      return;
    }

    try {
      setOptionsStorageStatus('Saving options trades...');
      const saved = await appendStoredOptionsTrades(parsed.trades);
      setOptionsData({ trades: saved.trades, summary: saved.summary });
      setSelectedDate('all');
      setDateRangeStart('');
      setDateRangeEnd('');
      setShowTodayOnly(false);
      setOptionsStorageStatus(`Saved ${saved.insertedCount} new trades, skipped ${saved.duplicateCount} duplicates. Total stored: ${saved.totalStored}.`);
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      setOptionsData(parsed);
      setSelectedDate('all');
      setDateRangeStart('');
      setDateRangeEnd('');
      setShowTodayOnly(false);
      setOptionsStorageStatus(`Processed locally. Database save failed: ${message}`);
      setError('');
    }
  };

  const handleOptionsSubmit = async (data: string) => {
    if (!data.trim()) {
      await handleClearTrades();
      return;
    }

    await processAndStoreOptionsData(data);
  };

  const handleClearTrades = async () => {
    if (!window.confirm('Clear all saved option trades from the app and Supabase?')) {
      return;
    }

    try {
      const cleared = await clearStoredOptionsTrades();
      setOptionsData(cleared);
      setOptionsStorageStatus('Cleared all saved option trades.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      setOptionsData(EMPTY_OPTIONS_DATA);
      setOptionsStorageStatus(`Cleared local trades. Database clear failed: ${message}`);
    }

    setSelectedDate('all');
    setDateRangeStart('');
    setDateRangeEnd('');
    setShowTodayOnly(false);
  };

  const handleProcessOptionsData = async (data: string) => {
    try {
      await processAndStoreOptionsData(data);
    } catch (err) {
      setError('❌ Failed to process options data. Please check the format.');
    }
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

  const toggleDataSource = () => {
    setUseRealtime(!useRealtime);
  };

  const handleCredentialsSet = () => {
    setCredentialsSet(true);
    setError('');
  };

  const loadFuturesSpread = async () => {
    if (!credentialsSet) return;
    
    try {
      if (DEBUG_APP) console.log('[App] Loading futures spread...');
      const spread = await fetchFuturesSpread();
      if (DEBUG_APP) console.log('[App] Futures spread loaded:', spread);
      setFuturesSpread(spread);
      // setFuturesError('');
    } catch (error) {
      console.error('[App] Failed to load futures spread:', error);
      // setFuturesError(error instanceof Error ? error.message : 'Failed to load spread');
    }
  };

  // Check if credentials are already saved on mount
  useEffect(() => {
    const authService = getAuthService();
    if (authService.hasConfig()) {
      setCredentialsSet(true);
    }
    
    // Set default futures EPIC if not already set
    getStoredFuturesEpic();
    if (!localStorage.getItem('market_spot_epic')) {
      localStorage.setItem('market_spot_epic', DEFAULT_SPOT_EPIC);
    }
  }, []);

  useEffect(() => {
    const syncPageFromHash = () => {
      setActivePage(window.location.hash === '#analytics' ? 'analytics' : 'chart');
    };

    window.addEventListener('hashchange', syncPageFromHash);
    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    loadStoredOptionsTrades()
      .then(storedOptionsData => {
        if (isCancelled) return;
        setOptionsData(storedOptionsData);
        if (storedOptionsData.trades.length > 0) {
          setOptionsStorageStatus(`Loaded ${storedOptionsData.trades.length} saved option trades.`);
        }
      })
      .catch(err => {
        if (isCancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown database error';
        setOptionsStorageStatus(`Options database unavailable. New pastes will still process locally. ${message}`);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Connect to futures WebSocket when credentials are set
  useEffect(() => {
    if (credentialsSet && useRealtime) {
      // First, load initial data via REST API
      loadFuturesSpread();
      
      // Then connect to WebSocket for real-time updates
      const futuresWS = getFuturesWebSocketService();
      
      const spotEpic = localStorage.getItem('market_spot_epic') || DEFAULT_SPOT_EPIC;
      const futuresEpic = getStoredFuturesEpic();
      
      if (DEBUG_APP) console.log('[App] Connecting to futures WebSocket...');
      
      futuresWS.connect(
        (data) => {
          setFuturesSpread(data);
          // setFuturesError('');
          // Flash animation on update
          setFuturesUpdateFlash(true);
          if (futuresFlashTimerRef.current) {
            clearTimeout(futuresFlashTimerRef.current);
          }
          futuresFlashTimerRef.current = setTimeout(() => {
            setFuturesUpdateFlash(false);
            futuresFlashTimerRef.current = null;
          }, 300);
        },
        (connected) => {
          setFuturesConnected(connected);
        },
        spotEpic,
        futuresEpic
      );

      return () => {
        if (DEBUG_APP) console.log('[App] Disconnecting futures WebSocket');
        if (futuresFlashTimerRef.current) {
          clearTimeout(futuresFlashTimerRef.current);
          futuresFlashTimerRef.current = null;
        }
        futuresWS.disconnect();
      };
    } else if (credentialsSet && !useRealtime) {
      // Fallback to REST API polling if not using realtime
      loadFuturesSpread();
      const interval = setInterval(loadFuturesSpread, 30000);
      return () => clearInterval(interval);
    }
  }, [credentialsSet, useRealtime]);

  useEffect(() => {
    if (useRealtime && credentialsSet) {
      // Load historical data first, then connect to WebSocket for real-time updates
      let wsService: ReturnType<typeof getWebSocketService> | null = null;
      
      const initializeRealtime = async () => {
        try {
          setLoading(true);
          setError(`Loading historical data (${HISTORICAL_DAYS} days)...`);
          
          let historicalData: ChartData[] = [];
          
          try {
            // Fetch historical data with a timeout so live data can still start if history is unavailable.
            const fetchPromise = fetchCapitalHistoricalData(HISTORICAL_DAYS);
            const timeoutPromise = new Promise<ChartData[]>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), HISTORICAL_FETCH_TIMEOUT_MS)
            );
            
            historicalData = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (DEBUG_APP) {
              console.log(`Historical data loaded: ${historicalData.length} candles`);
              console.log(`Date range: ${new Date(historicalData[0].time * 1000).toLocaleString()} to ${new Date(historicalData[historicalData.length - 1].time * 1000).toLocaleString()}`);
            }
            
            // Display historical data immediately
            setStockData(historicalData);
            if (historicalData.length > 0) {
              setCurrentPrice(historicalData[historicalData.length - 1].close);
            }
            setLastUpdate(new Date());
            setError(`✅ Loaded ${historicalData.length} candles. Connecting to live data...`);
            
            // Clear success message after 2 seconds
            setTimeout(() => setError(''), 2000);
          } catch (histError) {
            console.warn('⚠️ Failed to load historical data, starting with live data only:', histError);
            setError('Starting with live data only (historical data unavailable)');
            setTimeout(() => setError(''), 3000);
          }
          
          setLoading(false);
          
          // Now connect WebSocket for real-time updates
          wsService = getWebSocketService();
          
          const handlePriceUpdate = (data: ChartData[]) => {
            setStockData(data);
            if (data.length > 0) {
              setCurrentPrice(data[data.length - 1].close);
            }
            setLastUpdate(new Date());
            setIsConnected(true);
            setError('');
          };

          const handleError = (errorMsg: string) => {
            setError(errorMsg);
            setIsConnected(false);
          };

          // Pass historical data to WebSocket service (empty array if failed)
          await wsService.connect(handlePriceUpdate, handleError, historicalData.length > 0 ? historicalData : undefined);
          
        } catch (error) {
          console.error('Failed to initialize real-time data:', error);
          setError(error instanceof Error ? error.message : 'Failed to connect to real-time data');
          setLoading(false);
          setIsConnected(false);
        }
      };

      initializeRealtime();

      return () => {
        if (wsService) {
          wsService.disconnect();
          setIsConnected(false);
        }
      };
    } else if (!useRealtime) {
      // Use REST API polling
      loadSPXData();
      const interval = setInterval(loadSPXData, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [useRealtime, credentialsSet]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: '#0f1419' }}>
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Market Data Widget */}
        {credentialsSet && futuresSpread && (
          <div className={`bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-4 border border-slate-700 shadow-lg transition-all duration-300 ${futuresUpdateFlash ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Spot</div>
                  <div className="text-2xl font-bold text-white font-mono">
                    ${futuresSpread.spotPrice.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">{futuresSpread.spotEpic}</div>
                </div>
                
                <div className="h-12 w-px bg-slate-700"></div>
                
                <div>
                  <div className="text-xs text-gray-400 mb-1">Futures</div>
                  <div className="text-2xl font-bold text-blue-400 font-mono">
                    ${futuresSpread.futuresPrice.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 font-mono">{futuresSpread.futuresEpic}</div>
                </div>
                
                <div className="h-12 w-px bg-slate-700"></div>
                
                <div>
                  <div className="text-xs text-gray-400 mb-1">Spread (Futures - Spot)</div>
                  <div className={`text-2xl font-bold font-mono ${futuresSpread.spread >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {futuresSpread.spread >= 0 ? '+' : ''}{futuresSpread.spread.toFixed(2)} pts
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    ({futuresSpread.spreadPercent >= 0 ? '+' : ''}{futuresSpread.spreadPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {useRealtime && (
                  <div className="flex items-center gap-2">
                    {futuresConnected ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-400">LIVE</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-yellow-400">CONNECTING</span>
                      </>
                    )}
                  </div>
                )}
                <div className="text-right">
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span>Last Updated</span>
                    {futuresUpdateFlash && (
                      <span className="text-blue-400">●</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-300 font-mono">
                    {futuresSpread.lastUpdate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LineChart className="h-8 w-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-white">
              {activePage === 'analytics' ? 'SPX Flow Analytics' : 'S&P 500 Live Chart'}
            </h1>
            {useRealtime && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {isConnected ? (
                  <>
                    <Wifi className="h-4 w-4" />
                    <span className="text-sm font-medium">Real-time Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4" />
                    <span className="text-sm font-medium">Connecting...</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
              <button
                type="button"
                onClick={() => handlePageChange('chart')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activePage === 'chart'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <LineChart className="h-4 w-4" />
                Chart
              </button>
              <button
                type="button"
                onClick={() => handlePageChange('analytics')}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activePage === 'analytics'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </button>
            </div>
            <CapitalSettings onCredentialsSet={handleCredentialsSet} />
            <DateFilter
              dates={tradeDates}
              selectedDate={selectedDate}
              dateRangeStart={dateRangeStart}
              dateRangeEnd={dateRangeEnd}
              showTodayOnly={showTodayOnly}
              roundFigures={roundFigures}
              onDateChange={handleDateChange}
              onDateRangeChange={handleDateRangeChange}
              onTodayFilterChange={handleTodayFilterChange}
              onRoundFiguresChange={setRoundFigures}
            />
            <button
              onClick={toggleDataSource}
              disabled={!credentialsSet && useRealtime}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                useRealtime 
                  ? 'bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed' 
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
            >
              {useRealtime ? (
                <>
                  <Wifi className="h-4 w-4" />
                  Real-time Mode
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4" />
                  Historical Mode
                </>
              )}
            </button>
            {!useRealtime && (
              <button
                onClick={loadSPXData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Updating...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className={`p-4 rounded-lg ${
            error.startsWith('✅') 
              ? 'bg-green-500/10 border border-green-500 text-green-400'
              : error.startsWith('⚠️') || error.includes('unavailable')
              ? 'bg-yellow-500/10 border border-yellow-500 text-yellow-400'
              : 'bg-red-500/10 border border-red-500 text-red-500'
          }`}>
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <ProcessOptionsWidget 
            onProcessData={handleProcessOptionsData}
            onClearAll={handleClearTrades}
          />
        </div>

        {optionsStorageStatus && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
            {optionsStorageStatus}
          </div>
        )}

        {activePage === 'analytics' ? (
          <Suspense fallback={<ChartFallback />}>
            <AnalyticsPage
              trades={filteredTrades}
              allTrades={optionsData.trades}
              stockData={stockData}
              currentPrice={deferredCurrentPrice}
              roundFigures={roundFigures}
            />
          </Suspense>
        ) : (
          <div className="space-y-6">
            {filteredTrades.length > 0 && (
              <Suspense fallback={<ChartFallback />}>
                <FlowChart trades={filteredTrades} />
              </Suspense>
            )}

            <div className="w-full">
              {loading && !stockData.length ? (
                <div className="flex flex-col items-center justify-center h-96 rounded-lg" style={{ background: '#131722' }}>
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                  </div>
                  <div className="text-white mt-4 text-lg font-medium">Loading historical data...</div>
                  <div className="text-gray-400 mt-2 text-sm">This may take a few moments</div>
                </div>
              ) : (
                stockData.length > 0 && (
                  <Suspense fallback={<ChartFallback />}>
                    <StockChart
                      data={stockData}
                      symbol="SPX"
                      trades={filteredTrades}
                      futuresSpread={futuresSpread?.spread || 0}
                      roundFigures={roundFigures}
                      historyDays={HISTORICAL_DAYS}
                    />
                  </Suspense>
                )
              )}
            </div>

            <div className="w-full">
              <SentimentAnalysis
                trades={filteredTrades}
                currentPrice={deferredCurrentPrice}
                futuresSpread={futuresSpread?.spread || 0}
                roundFigures={roundFigures}
              />
            </div>
          </div>
        )}

        <div className="text-sm text-gray-400 text-center">
          {useRealtime && stockData.length > 0 && (
            <span className="mr-4">
              📊 Showing {stockData.length} candles {stockData.length > 500 ? `(${HISTORICAL_DAYS} days historical + live)` : '(live data)'}
            </span>
          )}
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>

        {activePage === 'chart' && (
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
        )}
      </div>
    </div>
  );
};

export default App;
