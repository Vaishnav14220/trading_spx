import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { createChart, IChartApi } from 'lightweight-charts';
import { OptionTrade } from '../types/options';

interface IVHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  trades: OptionTrade[];
  contract: string;
}

const IVHistoryModal: React.FC<IVHistoryModalProps> = ({ isOpen, onClose, trades, contract }) => {
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);

  const filteredTrades = useMemo(() => {
    const tradeMap = new Map();
    
    trades
      .filter(trade => trade.contract === contract)
      .forEach(trade => {
        const timestamp = new Date(trade.timestamp).getTime();
        let uniqueTime = timestamp;
        while (tradeMap.has(uniqueTime)) {
          uniqueTime += 1000;
        }
        tradeMap.set(uniqueTime, {
          ...trade,
          uniqueTimestamp: uniqueTime,
        });
      });

    return Array.from(tradeMap.values())
      .sort((a, b) => a.uniqueTimestamp - b.uniqueTimestamp);
  }, [trades, contract]);

  React.useEffect(() => {
    if (!isOpen || !chartContainerRef.current || filteredTrades.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1E293B' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.3,
        },
      },
    });

    // IV Line Series
    const ivSeries = chart.addLineSeries({
      color: '#60A5FA',
      lineWidth: 2,
      title: 'IV %',
      priceFormat: {
        type: 'percent',
        precision: 2,
      },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#60A5FA',
      crosshairMarkerBackgroundColor: '#1E293B',
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: '#60A5FA',
      priceLineStyle: 2,
    });

    // Volume Series with reduced height
    const volumeSeries = chart.addHistogramSeries({
      color: '#34D399',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.85, // Move volume bars more to the bottom
        bottom: 0,
      },
      priceScale: {
        scaleMargins: {
          top: 0.85,
          bottom: 0,
        },
      },
    });

    // Format data
    const ivData = filteredTrades.map(trade => ({
      time: trade.uniqueTimestamp / 1000,
      value: parseFloat(trade.iv) / 100,
    }));

    // Scale down volume bars for better visibility
    const maxVolume = Math.max(...filteredTrades.map(t => t.quantity));
    const volumeScale = maxVolume > 1000 ? 0.1 : 0.3; // Adjust scale based on volume size

    const volumeData = filteredTrades.map(trade => ({
      time: trade.uniqueTimestamp / 1000,
      value: trade.quantity * volumeScale, // Scale down the volume bars
      color: trade.quantity > 100 ? 'rgba(52, 211, 153, 0.3)' : 'rgba(96, 165, 250, 0.3)', // More transparent
    }));

    // Set data
    ivSeries.setData(ivData);
    volumeSeries.setData(volumeData);

    // Customize appearance
    chart.applyOptions({
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#60A5FA',
          style: 2,
          labelBackgroundColor: '#1E293B',
        },
        horzLine: {
          width: 1,
          color: '#60A5FA',
          style: 2,
          labelBackgroundColor: '#1E293B',
        },
      },
    });

    // Fit content
    chart.timeScale().fitContent();

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [isOpen, filteredTrades]);

  if (!isOpen) return null;

  const latestTrade = filteredTrades[filteredTrades.length - 1];
  const totalVolume = filteredTrades.reduce((sum, trade) => sum + trade.quantity, 0);
  const averageIV = filteredTrades.reduce((sum, trade) => sum + parseFloat(trade.iv), 0) / filteredTrades.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-slate-900 rounded-lg w-[90vw] max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">
              {contract} IV History
            </h3>
            <div className="flex gap-4 text-sm text-gray-400">
              <span>Current IV: {latestTrade?.iv}%</span>
              <span>Average IV: {averageIV.toFixed(2)}%</span>
              <span>Total Volume: {totalVolume.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-400" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div ref={chartContainerRef} className="w-full" />
          
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="text-xs uppercase bg-slate-800">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">IV</th>
                  <th className="px-4 py-2">Quantity</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">Bid x Ask</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade, index) => (
                  <tr 
                    key={index}
                    className="border-b border-slate-700 hover:bg-slate-800"
                  >
                    <td className="px-4 py-2">{trade.timestamp}</td>
                    <td className="px-4 py-2">{trade.iv}%</td>
                    <td className="px-4 py-2">{trade.quantity}</td>
                    <td className="px-4 py-2">${trade.price}</td>
                    <td className="px-4 py-2">{trade.bidAsk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IVHistoryModal;