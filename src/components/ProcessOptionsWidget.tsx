import React, { useState } from 'react';
import { Clipboard, Trash2, FileText } from 'lucide-react';

interface ProcessOptionsWidgetProps {
  onProcessData: (data: string) => void;
  onClearAll: () => void;
}

const ProcessOptionsWidget: React.FC<ProcessOptionsWidgetProps> = ({ 
  onProcessData, 
  onClearAll 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputData, setInputData] = useState('');

  const handlePasteFromClipboard = async () => {
    try {
      setIsProcessing(true);
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        onProcessData(text);
        setError('');
      } else {
        setError('Clipboard is empty');
      }
    } catch (err) {
      setError('Failed to read from clipboard');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualInput = () => {
    if (inputData.trim()) {
      onProcessData(inputData);
      setInputData('');
      setShowInput(false);
      setError('');
    } else {
      setError('Please enter options data');
    }
  };

  const handleClearAll = () => {
    onClearAll();
    setInputData('');
    setShowInput(false);
    setError('');
  };

  const [error, setError] = useState('');

  return (
    <div className="flex items-center gap-2">
      {/* Process Options Data Button */}
      <button
        onClick={() => setShowInput(!showInput)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        <FileText className="h-4 w-4" />
        Process Options Data
      </button>

      {/* Paste from Clipboard Button */}
      <button
        onClick={handlePasteFromClipboard}
        disabled={isProcessing}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        <Clipboard className="h-4 w-4" />
        {isProcessing ? 'Processing...' : 'Paste from Clipboard'}
      </button>

      {/* Clear All Button */}
      <button
        onClick={handleClearAll}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Clear All
      </button>

      {/* Input Modal */}
      {showInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Process Options Data</h3>
              <button
                onClick={() => setShowInput(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Paste your options data here:
                </label>
                <textarea
                  value={inputData}
                  onChange={(e) => setInputData(e.target.value)}
                  placeholder="Paste your options data here..."
                  className="w-full h-48 px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              
              {error && (
                <div className="mb-4 text-red-400 text-sm">{error}</div>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={handlePasteFromClipboard}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                >
                  <Clipboard className="h-4 w-4" />
                  {isProcessing ? 'Processing...' : 'Paste from Clipboard'}
                </button>
                
                <button
                  onClick={handleManualInput}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Process Data
                </button>
                
                <button
                  onClick={() => setShowInput(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessOptionsWidget;
