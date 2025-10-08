import React, { useState, useEffect } from 'react';
import { StockChart } from './components/StockChart';
import { fetchSPXData } from './services/stockApi';
import { getWebSocketService } from './services/websocketApi';
import { getAuthService } from './services/capitalAuth';
import { fetchCapitalHistoricalData } from './services/capitalHistoricalApi';
import { fetchFuturesSpread, FuturesSpreadData } from './services/futuresApi';
import { getFuturesWebSocketService, FuturesRealtimeData } from './services/futuresWebSocket';
import { parseOptionsData } from './services/optionsParser';
import type { ChartData } from './types/chart';
import { LineChart, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import OptionsTable from './components/OptionsTable';
import OptionsSummary from './components/OptionsSummary';
import OptionsInput from './components/OptionsInput';
import SentimentAnalysis from './components/SentimentAnalysis';
import DateFilter from './components/DateFilter';
import CapitalSettings from './components/CapitalSettings';
import ProcessOptionsWidget from './components/ProcessOptionsWidget';
import { isToday, extractDate } from './utils/dateUtils';

const App: React.FC = () => {
  const [stockData, setStockData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [showTodayOnly, setShowTodayOnly] = useState(false);
  const [roundFigures, setRoundFigures] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [useRealtime, setUseRealtime] = useState(true);
  const [credentialsSet, setCredentialsSet] = useState(false);
  const [futuresSpread, setFuturesSpread] = useState<FuturesSpreadData | FuturesRealtimeData | null>(null);
  const [futuresConnected, setFuturesConnected] = useState(false);
  const [futuresUpdateFlash, setFuturesUpdateFlash] = useState(false);
  const [optionsData, setOptionsData] = useState<{
    trades: any[];
    summary: {
      totalCallVolume: number;
      totalPutVolume: number;
      averageCallPrice: number;
      averagePutPrice: number;
      averageCallBreakeven: number;
      averagePutBreakeven: number;
    };
  }>({
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

  const handleProcessOptionsData = (data: string) => {
    try {
      const parsedData = parseOptionsData(data);
      setOptionsData(parsedData);
      setError('✅ Options data processed successfully!');
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
      console.log('[App] Loading futures spread...');
      const spread = await fetchFuturesSpread();
      console.log('[App] Futures spread loaded:', spread);
      setFuturesSpread(spread);
      // setFuturesError('');
    } catch (error) {
      console.error('[App] Failed to load futures spread:', error);
      // setFuturesError(error instanceof Error ? error.message : 'Failed to load spread');
    }
  };

  const handleMarketSelection = (spotEpic: string, futuresEpic: string) => {
    console.log('[App] Markets selected:', { spotEpic, futuresEpic });
    
    if (useRealtime) {
      // Reconnect WebSocket with new EPICs
      const futuresWS = getFuturesWebSocketService();
      futuresWS.disconnect();
      
      setTimeout(() => {
        futuresWS.connect(
          (data) => {
            setFuturesSpread(data);
            // setFuturesError('');
            // Flash animation on update
            setFuturesUpdateFlash(true);
            setTimeout(() => setFuturesUpdateFlash(false), 300);
          },
          (connected) => {
            setFuturesConnected(connected);
          },
          spotEpic,
          futuresEpic
        );
      }, 100);
    } else {
      // Reload via REST API
      loadFuturesSpread();
    }
  };

  // Check if credentials are already saved on mount
  useEffect(() => {
    const authService = getAuthService();
    if (authService.hasConfig()) {
      setCredentialsSet(true);
    }
    
    // Set default futures EPIC if not already set
    if (!localStorage.getItem('market_futures_epic')) {
      localStorage.setItem('market_futures_epic', 'ESZ2025');
    }
    if (!localStorage.getItem('market_spot_epic')) {
      localStorage.setItem('market_spot_epic', 'US500');
    }
  }, []);

  // Connect to futures WebSocket when credentials are set
  useEffect(() => {
    if (credentialsSet && useRealtime) {
      // First, load initial data via REST API
      loadFuturesSpread();
      
      // Then connect to WebSocket for real-time updates
      const futuresWS = getFuturesWebSocketService();
      
      const spotEpic = localStorage.getItem('market_spot_epic') || 'US500';
      const futuresEpic = localStorage.getItem('market_futures_epic') || 'ESZ2025';
      
      console.log('[App] Connecting to futures WebSocket...');
      
      futuresWS.connect(
        (data) => {
          setFuturesSpread(data);
          // setFuturesError('');
          // Flash animation on update
          setFuturesUpdateFlash(true);
          setTimeout(() => setFuturesUpdateFlash(false), 300);
        },
        (connected) => {
          setFuturesConnected(connected);
        },
        spotEpic,
        futuresEpic
      );

      return () => {
        console.log('[App] Disconnecting futures WebSocket');
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
          setError('Loading historical data (3 days)...');
          
          let historicalData: ChartData[] = [];
          
          try {
            // Try to fetch 3 days of historical data with timeout
            const fetchPromise = fetchCapitalHistoricalData(3);
            const timeoutPromise = new Promise<ChartData[]>((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 30000) // 30 second timeout
            );
            
            historicalData = await Promise.race([fetchPromise, timeoutPromise]);
            
            console.log(`✅ Historical data loaded: ${historicalData.length} candles`);
            console.log(`Date range: ${new Date(historicalData[0].time * 1000).toLocaleString()} to ${new Date(historicalData[historicalData.length - 1].time * 1000).toLocaleString()}`);
            
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
            <h1 className="text-3xl font-bold text-white">S&P 500 Live Chart</h1>
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
            <CapitalSettings onCredentialsSet={handleCredentialsSet} />
            <DateFilter
              dates={tradeDates}
              selectedDate={selectedDate}
              showTodayOnly={showTodayOnly}
              roundFigures={roundFigures}
              onDateChange={setSelectedDate}
              onTodayFilterChange={setShowTodayOnly}
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

        <div className="space-y-6">
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
                <StockChart 
                  data={stockData} 
                  symbol="SPX" 
                  trades={filteredTrades}
                  futuresSpread={futuresSpread?.spread || 0}
                  roundFigures={roundFigures}
                />
              )
            )}
          </div>

          <div className="w-full">
            <SentimentAnalysis 
              trades={filteredTrades} 
              currentPrice={currentPrice}
              futuresSpread={futuresSpread?.spread || 0}
              roundFigures={roundFigures}
            />
          </div>
        </div>

        <div className="text-sm text-gray-400 text-center">
          {useRealtime && stockData.length > 0 && (
            <span className="mr-4">
              📊 Showing {stockData.length} candles {stockData.length > 500 ? '(3 days historical + live)' : '(live data)'}
            </span>
          )}
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