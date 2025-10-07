import React, { useState } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { OptionTrade } from '../types/options';
import IVHistoryModal from './IVHistoryModal';

interface TradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  trades: OptionTrade[];
  breakeven: number;
}

const TradesModal: React.FC<TradesModalProps> = ({ isOpen, onClose, trades, breakeven }) => {
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const [isIVModalOpen, setIsIVModalOpen] = useState(false);

  if (!isOpen) return null;

  const formatNumber = (value: number | string): string => {
    if (typeof value === 'string') return value;
    return value.toFixed(2);
  };

  const calculateMidPrice = (bidAsk: string): number => {
    const [bid, ask] = bidAsk.split('x').map(price => parseFloat(price));
    return (bid + ask) / 2;
  };

  const totalPremium = trades.reduce((sum, trade) => sum + (trade.price * trade.quantity * 100), 0);

  const handleIVClick = (contract: string) => {
    setSelectedContract(contract);
    setIsIVModalOpen(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-slate-900 rounded-lg w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h3 className="text-xl font-bold text-white">
              Trades at ${breakeven.toFixed(2)} Breakeven
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-6 w-6 text-gray-400" />
            </button>
          </div>
          
          <div className="p-4 overflow-y-auto flex-1">
            <div className="mb-4 bg-slate-800 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Premium:</span>
                <span className="text-xl font-bold font-mono text-green-400">
                  ${Math.abs(totalPremium).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left text-gray-300">
                <thead className="text-xs uppercase bg-slate-800">
                  <tr>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Contract</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Price</th>
                    <th className="px-4 py-2">Exchange</th>
                    <th className="px-4 py-2">Bid x Ask</th>
                    <th className="px-4 py-2">Mid Price</th>
                    <th className="px-4 py-2">Delta</th>
                    <th className="px-4 py-2">IV</th>
                    <th className="px-4 py-2">Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade, index) => (
                    <tr 
                      key={index}
                      className="border-b border-slate-700 hover:bg-slate-800"
                    >
                      <td className="px-4 py-2">{trade.timestamp}</td>
                      <td className="px-4 py-2">{trade.contract}</td>
                      <td className="px-4 py-2">{trade.quantity}</td>
                      <td className="px-4 py-2">${formatNumber(trade.price)}</td>
                      <td className="px-4 py-2">{trade.exchange}</td>
                      <td className="px-4 py-2">{trade.bidAsk}</td>
                      <td className="px-4 py-2">${formatNumber(calculateMidPrice(trade.bidAsk))}</td>
                      <td className="px-4 py-2">{trade.delta}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleIVClick(trade.contract)}
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {trade.iv}
                          <TrendingUp className="h-3 w-3" />
                        </button>
                      </td>
                      <td className="px-4 py-2 font-mono">
                        ${(trade.price * trade.quantity * 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedContract && (
        <IVHistoryModal
          isOpen={isIVModalOpen}
          onClose={() => {
            setIsIVModalOpen(false);
            setSelectedContract(null);
          }}
          trades={trades}
          contract={selectedContract}
        />
      )}
    </>
  );
};

export default TradesModal;