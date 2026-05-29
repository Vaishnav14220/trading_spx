import React from 'react';
import { CalendarDays, Calendar, Clock, X } from 'lucide-react';
import { formatDateLabel } from '../utils/dateUtils';

interface DateFilterProps {
  dates: string[];
  selectedDate: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  showTodayOnly: boolean;
  roundFigures: boolean;
  onDateChange: (date: string) => void;
  onDateRangeChange: (start: string, end: string) => void;
  onTodayFilterChange: (showTodayOnly: boolean) => void;
  onRoundFiguresChange: (roundFigures: boolean) => void;
}

const DateFilter: React.FC<DateFilterProps> = ({ 
  dates, 
  selectedDate, 
  dateRangeStart,
  dateRangeEnd,
  showTodayOnly,
  roundFigures,
  onDateChange, 
  onDateRangeChange,
  onTodayFilterChange,
  onRoundFiguresChange
}) => {
  const hasDateRange = dateRangeStart || dateRangeEnd;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
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

      <div className={`flex flex-wrap items-center justify-end gap-2 ${showTodayOnly ? 'opacity-50' : ''}`}>
        {dates.length > 0 && (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <select
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              disabled={showTodayOnly || Boolean(hasDateRange)}
              className="bg-slate-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-600 transition-colors disabled:cursor-not-allowed disabled:hover:bg-slate-700"
            >
              <option value="all">All Dates</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatDateLabel(date)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={dateRangeStart}
            onChange={(e) => onDateRangeChange(e.target.value, dateRangeEnd)}
            disabled={showTodayOnly}
            aria-label="Start date"
            className="bg-slate-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-600 transition-colors disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="date"
            value={dateRangeEnd}
            onChange={(e) => onDateRangeChange(dateRangeStart, e.target.value)}
            disabled={showTodayOnly}
            aria-label="End date"
            className="bg-slate-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-slate-600 transition-colors disabled:cursor-not-allowed disabled:hover:bg-slate-700"
          />
          {hasDateRange && !showTodayOnly && (
            <button
              type="button"
              onClick={() => onDateRangeChange('', '')}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600 hover:text-white"
              aria-label="Clear date range"
              title="Clear date range"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DateFilter;
