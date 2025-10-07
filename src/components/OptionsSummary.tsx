import React from 'react';
import { formatBreakeven, formatPrice, formatVolume } from '../services/optionsParser';

interface OptionsSummaryProps {
  summary: {
    totalCallVolume: number;
    totalPutVolume: number;
    averageCallPrice: number;
    averagePutPrice: number;
    averageCallBreakeven: number;
    averagePutBreakeven: number;
  };
}

export const OptionsSummary: React.FC<OptionsSummaryProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-900 rounded-lg">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Calls Summary</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Volume:</span>
            <span className="text-green-400 font-mono">{formatVolume(summary.totalCallVolume)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Price:</span>
            <span className="text-green-400 font-mono">${formatPrice(summary.averageCallPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Breakeven:</span>
            <span className="text-green-400 font-mono">${formatBreakeven(summary.averageCallBreakeven)}</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Puts Summary</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Volume:</span>
            <span className="text-red-400 font-mono">{formatVolume(summary.totalPutVolume)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Price:</span>
            <span className="text-red-400 font-mono">${formatPrice(summary.averagePutPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Breakeven:</span>
            <span className="text-red-400 font-mono">${formatBreakeven(summary.averagePutBreakeven)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionsSummary;