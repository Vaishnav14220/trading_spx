import React from 'react';
import { OptionTrade } from '../types/options';

const DELTA_THRESHOLD = 0.64;

interface OptionsTableProps {
  trades: OptionTrade[];
}

export const OptionsTable: React.FC<OptionsTableProps> = ({ trades }) => {
  const filteredTrades = trades.filter(trade => Math.abs(parseFloat(trade.delta)) > DELTA_THRESHOLD);

  return (
    <div className="overflow-x-auto bg-slate-900 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-4">
        High Impact Trades (|Δ| &gt; {DELTA_THRESHOLD})
      </h3>
      {/* Rest of the table implementation */}
    </div>
  );
}

export default OptionsTable;