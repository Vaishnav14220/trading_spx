import React from 'react';
import { CalendarDays, Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
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

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string): Date | null => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const getMonthLabel = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const getShortDateLabel = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

const buildMonthDays = (monthDate: Date): Array<string | null> => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Array<string | null> = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(toDateKey(new Date(year, month, day)));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

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
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);
  const latestTradeDate = dates[0] ?? '';
  const initialCalendarDate = parseDateKey(dateRangeStart || dateRangeEnd || latestTradeDate) ?? new Date();
  const [calendarMonth, setCalendarMonth] = React.useState(
    () => new Date(initialCalendarDate.getFullYear(), initialCalendarDate.getMonth(), 1)
  );

  const availableDates = React.useMemo(() => new Set(dates), [dates]);
  const monthDays = React.useMemo(() => buildMonthDays(calendarMonth), [calendarMonth]);

  React.useEffect(() => {
    if (!isCalendarOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCalendarOpen]);

  React.useEffect(() => {
    const selectedDateKey = dateRangeStart || dateRangeEnd || latestTradeDate;
    const selectedCalendarDate = selectedDateKey ? parseDateKey(selectedDateKey) : null;

    if (selectedCalendarDate) {
      setCalendarMonth(new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), 1));
    }
  }, [dateRangeEnd, dateRangeStart, latestTradeDate]);

  const rangeStart = dateRangeStart && dateRangeEnd && dateRangeStart > dateRangeEnd ? dateRangeEnd : dateRangeStart;
  const rangeEnd = dateRangeStart && dateRangeEnd && dateRangeStart > dateRangeEnd ? dateRangeStart : dateRangeEnd;
  const calendarLabel = rangeStart && rangeEnd
    ? rangeStart === rangeEnd
      ? getShortDateLabel(rangeStart)
      : `${getShortDateLabel(rangeStart)} - ${getShortDateLabel(rangeEnd)}`
    : rangeStart
    ? getShortDateLabel(rangeStart)
    : 'Date Range';

  const changeMonth = (offset: number) => {
    setCalendarMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
  };

  const handleCalendarDateClick = (dateKey: string) => {
    if (!dateRangeStart || dateRangeEnd) {
      onDateRangeChange(dateKey, '');
      return;
    }

    if (dateKey < dateRangeStart) {
      onDateRangeChange(dateKey, dateRangeStart);
    } else {
      onDateRangeChange(dateRangeStart, dateKey);
    }

    setIsCalendarOpen(false);
  };

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

        <div ref={calendarRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCalendarOpen(open => !open)}
            disabled={showTodayOnly}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              hasDateRange ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'
            } disabled:cursor-not-allowed disabled:bg-slate-700`}
          >
            <Calendar className="h-4 w-4" />
            <span className="min-w-24 text-left">{calendarLabel}</span>
          </button>

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

          {isCalendarOpen && !showTodayOnly && (
            <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-slate-800 hover:text-white"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-white">{getMonthLabel(calendarMonth)}</div>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-slate-800 hover:text-white"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
                {WEEK_DAYS.map((day, index) => (
                  <div key={`${day}-${index}`} className="py-1 font-semibold">
                    {day}
                  </div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {monthDays.map((dateKey, index) => {
                  if (!dateKey) {
                    return <div key={`empty-${index}`} className="h-9" />;
                  }

                  const dayNumber = Number(dateKey.slice(-2));
                  const isStart = dateKey === rangeStart;
                  const isEnd = dateKey === rangeEnd;
                  const isInRange = Boolean(rangeStart && rangeEnd && dateKey > rangeStart && dateKey < rangeEnd);
                  const hasTrades = availableDates.has(dateKey);

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => handleCalendarDateClick(dateKey)}
                      className={`relative flex h-9 items-center justify-center rounded-md text-sm transition-colors ${
                        isStart || isEnd
                          ? 'bg-blue-600 text-white'
                          : isInRange
                          ? 'bg-blue-500/20 text-blue-100'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {dayNumber}
                      {hasTrades && !(isStart || isEnd) && (
                        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-green-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DateFilter;
