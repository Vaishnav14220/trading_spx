import React, { useState } from 'react';
import { ClipboardPaste, Trash2 } from 'lucide-react';

interface OptionsInputProps {
  onSubmit: (data: string) => void;
}

const OptionsInput: React.FC<OptionsInputProps> = ({ onSubmit }) => {
  const [optionsData, setOptionsData] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(optionsData);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setOptionsData(text);
      onSubmit(text);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const handleClear = () => {
    setOptionsData('');
    onSubmit('');
  };

  const placeholder = `22:51:26\t24 OCT 24 5895 C\t149\t.10\tCBOE\t.05x.10\t.01\t13.23%\t5797.42
22:48:54\t24 OCT 24 5890 C\t150\t.10\tCBOE\t.05x.15\t.01\t12.62%\t5797.42`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          <Trash2 className="h-5 w-5" />
          <span className="font-semibold">Clear Trades</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 mb-2">
        <button
          type="button"
          onClick={handlePaste}
          className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          <ClipboardPaste className="h-5 w-5" />
          <span className="font-semibold">Paste from Clipboard</span>
        </button>
        
        <p className="text-sm text-gray-400">
          Format: Time⇥Contract⇥Quantity⇥Price⇥Exchange⇥Bid/Ask⇥Delta⇥IV⇥Underlying⇥Condition
        </p>
      </div>
      
      <div className="flex gap-4">
        <textarea
          value={optionsData}
          onChange={(e) => setOptionsData(e.target.value)}
          placeholder={placeholder}
          rows={5}
          className="flex-1 px-3 py-2 bg-slate-800 text-white placeholder-gray-500 border border-slate-700 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        
        <button
          type="submit"
          className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 h-fit"
        >
          Process
        </button>
      </div>
    </form>
  );
};

export default OptionsInput;