import { TickMarkType, Time } from 'lightweight-charts';

const fallbackLocale = 'en-US';

function getLocale(locale?: string): string {
  if (locale) return locale;
  return typeof navigator !== 'undefined' ? navigator.language : fallbackLocale;
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

  if (tickMarkType === TickMarkType.Year) {
    return new Intl.DateTimeFormat(resolvedLocale, { year: 'numeric' }).format(date);
  }

  if (tickMarkType === TickMarkType.Month) {
    return new Intl.DateTimeFormat(resolvedLocale, { month: 'short' }).format(date);
  }

  if (tickMarkType === TickMarkType.DayOfMonth) {
    return new Intl.DateTimeFormat(resolvedLocale, { month: 'short', day: '2-digit' }).format(date);
  }

  return new Intl.DateTimeFormat(resolvedLocale, {
    hour: '2-digit',
    minute: '2-digit',
    second: tickMarkType === TickMarkType.TimeWithSeconds ? '2-digit' : undefined,
    hour12: false,
  }).format(date);
}

export function formatChartTimeLocal(time: Time): string {
  const date = toDate(time);

  if (!date) return '';

  return new Intl.DateTimeFormat(getLocale(), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatCompactTimeLocal(date: Date): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
