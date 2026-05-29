import type { TickMarkType, Time } from 'lightweight-charts';

const fallbackLocale = 'en-US';
const TICK_MARK_TYPE = {
  Year: 0 as TickMarkType,
  Month: 1 as TickMarkType,
  DayOfMonth: 2 as TickMarkType,
  TimeWithSeconds: 4 as TickMarkType,
};
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocale(locale?: string): string {
  if (locale) return locale;
  return typeof navigator !== 'undefined' ? navigator.language : fallbackLocale;
}

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

function toDate(time: Time): Date | null {
  if (typeof time === 'number') {
    return new Date(time * 1000);
  }

  if (typeof time === 'string') {
    const date = new Date(time);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if ('year' in time && 'month' in time && 'day' in time) {
    return new Date(time.year, time.month - 1, time.day);
  }

  return null;
}

export function formatChartTickLocal(time: Time, tickMarkType: TickMarkType, locale?: string): string {
  const date = toDate(time);

  if (!date) return '';

  const resolvedLocale = getLocale(locale);

  if (tickMarkType === TICK_MARK_TYPE.Year) {
    return getFormatter(resolvedLocale, { year: 'numeric' }).format(date);
  }

  if (tickMarkType === TICK_MARK_TYPE.Month) {
    return getFormatter(resolvedLocale, { month: 'short' }).format(date);
  }

  if (tickMarkType === TICK_MARK_TYPE.DayOfMonth) {
    return getFormatter(resolvedLocale, { month: 'short', day: '2-digit' }).format(date);
  }

  return getFormatter(resolvedLocale, {
    hour: '2-digit',
    minute: '2-digit',
    second: tickMarkType === TICK_MARK_TYPE.TimeWithSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date);
}

export function formatChartTimeLocal(time: Time): string {
  const date = toDate(time);

  if (!date) return '';

  return getFormatter(getLocale(), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatCompactTimeLocal(date: Date): string {
  return getFormatter(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
