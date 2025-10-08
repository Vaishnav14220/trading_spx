import React, { useState, useEffect } from 'react';
import { searchMarkets, getMarketDetails, Market } from '../services/marketSearch';
import { Search, X } from 'lucide-react';

interface MarketSelectorProps {
  onSelectMarket: (spotEpic: string, futuresEpic: string) => void;
  currentSpotEpic?: string;
  currentFuturesEpic?: string;
}

const MarketSelector: React.FC<MarketSelectorProps> = ({ 
  onSelectMarket,
  currentSpotEpic = 'US500',
  currentFuturesEpic = 'ESZ2025'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('US500');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(currentSpotEpic);
  const [selectedFutures, setSelectedFutures] = useState(currentFuturesEpic);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const results = await searchMarkets(searchTerm);
      setMarkets(results);
      
      if (results.length === 0) {
        setError('No markets found. Try searching for "US500", "SPX", or "S&P"');
      }
    } catch (err) {
      setError('Failed to search markets. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (selectedSpot && selectedFutures) {
      localStorage.setItem('market_spot_epic', selectedSpot);
      localStorage.setItem('market_futures_epic', selectedFutures);
      onSelectMarket(selectedSpot, selectedFutures);
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleSearch();
    }
  }, [isOpen]);

  const spotMarkets = markets.filter(m => !m.expiry || m.expiry === 'N/A' || m.expiry === '-');
  const futuresMarkets = markets.filter(m => m.expiry && m.expiry !== 'N/A' && m.expiry !== '-');

  return (
    <div>
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-2"
      >
        <Search className="w-4 h-4" />
        Select Markets
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Select US500 Markets</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search for markets (e.g., US500, SPX, S&P)"
                  className="flex-1 px-3 py-2 bg-slate-700 text-white rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>
              {error && (
                <div className="mt-2 text-yellow-400 text-sm">{error}</div>
              )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Spot Markets */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Spot Markets</h3>
                  <div className="space-y-2">
                    {spotMarkets.length === 0 && !loading && (
                      <div className="text-gray-400 text-sm">No spot markets found</div>
                    )}
                    {spotMarkets.map((market) => (
                      <div
                        key={market.epic}
                        onClick={() => setSelectedSpot(market.epic)}
                        className={`p-3 rounded cursor-pointer border ${
                          selectedSpot === market.epic
                            ? 'bg-blue-600 border-blue-400'
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                        }`}
                      >
                        <div className="font-semibold text-white text-sm">{market.epic}</div>
                        <div className="text-xs text-gray-300 mt-1">{market.instrumentName}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Bid: {market.bid.toFixed(2)} | Offer: {market.offer.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Futures Markets */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Futures Contracts</h3>
                  <div className="space-y-2">
                    {futuresMarkets.length === 0 && !loading && (
                      <div className="text-gray-400 text-sm">No futures contracts found</div>
                    )}
                    {futuresMarkets.map((market) => (
                      <div
                        key={market.epic}
                        onClick={() => setSelectedFutures(market.epic)}
                        className={`p-3 rounded cursor-pointer border ${
                          selectedFutures === market.epic
                            ? 'bg-green-600 border-green-400'
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                        }`}
                      >
                        <div className="font-semibold text-white text-sm">{market.epic}</div>
                        <div className="text-xs text-gray-300 mt-1">{market.instrumentName}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Expiry: {market.expiry}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Bid: {market.bid.toFixed(2)} | Offer: {market.offer.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                {selectedSpot && (
                  <span>Spot: <span className="text-blue-400 font-mono">{selectedSpot}</span></span>
                )}
                {selectedSpot && selectedFutures && <span className="mx-2">|</span>}
                {selectedFutures && (
                  <span>Futures: <span className="text-green-400 font-mono">{selectedFutures}</span></span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={!selectedSpot || !selectedFutures}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketSelector;

