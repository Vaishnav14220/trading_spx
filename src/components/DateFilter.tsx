import React from 'react';
import { CalendarDays, Calendar, Clock } from 'lucide-react';

interface DateFilterProps {
  dates: string[];
  selectedDate: string;
  showTodayOnly: boolean;
  roundFigures: boolean;
  onDateChange: (date: string) => void;
  onTodayFilterChange: (showTodayOnly: boolean) => void;
  onRoundFiguresChange: (roundFigures: boolean) => void;
}

const DateFilter: React.FC<DateFilterProps> = ({ 
  dates, 
  selectedDate, 
  showTodayOnly,
  roundFigures,
  onDateChange, 
  onTodayFilterChange,
  onRoundFiguresChange
}) => {
  return (
    <div className="flex items-center gap-6">
      <label className="flex items-center gap-2 text-gray-300 hover:text-gray-200 cursor-pointer">
        <input
          type="checkbox"
          checked={showTodayOnly}
          onChange={(e) => onTodayFilterChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
        />
        <Clock className="h-4 w-4" />
        <span>Today Only</span>
      </label>
      
      <label className="flex items-center gap-2 text-gray-300 hover:text-gray-200 cursor-pointer">
        <input
          type="checkbox"
          checked={roundFigures}
          onChange={(e) => onRoundFiguresChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
        />
        <CalendarDays className="h-4 w-4" />
        <span>Round Figures</span>
      </label>

      {!showTodayOnly && dates.length > 0 && (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-600 transition-colors"
          >
            <option value="all">All Dates</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default DateFilter;