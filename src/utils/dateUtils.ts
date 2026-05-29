const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;

  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCompactDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

function parseTradeDate(timestamp: string): Date | null {
  const trimmed = timestamp.trim();
  const monthNameMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);

  if (monthNameMatch) {
    const parsed = new Date(`${monthNameMatch[1]} ${monthNameMatch[2]} ${monthNameMatch[3]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseTimestamp(timestamp: string): { timestamp: string; isTimeOnly: boolean } {
  // Check if timestamp includes a date in various formats:
  // - "Mar 14 2024 10:30:25" (long format)
  // - "10/9/25 22:58:21" (MM/DD/YY HH:MM:SS)
  // - "10-9-25 22:58:21" (MM-DD-YY HH:MM:SS)
  
  // Check for date with slashes or dashes (e.g., "10/9/25" or "10-9-25")
  if (timestamp.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
    return { timestamp, isTimeOnly: false };
  }
  
  // Check for long format date (e.g., "Mar 14 2024")
  if (timestamp.match(/[A-Za-z]+ \d+,? \d{4}/)) {
    return { timestamp, isTimeOnly: false };
  }
  
  // If timestamp is just time (e.g., "10:30:25" or "03:26:54"), add today's date
  const today = new Date();
  const formattedDate = formatCompactDate(today);
  
  return { timestamp: `${formattedDate} ${timestamp}`, isTimeOnly: true };
}

export function isToday(timestamp: string): boolean {
  return extractDateKey(timestamp) === formatLocalDateKey(new Date());
}

export function extractDateKey(timestamp: string): string {
  const parsed = parseTradeDate(timestamp);
  return formatLocalDateKey(parsed ?? new Date());
}

export function extractDate(timestamp: string): string {
  return formatDateLabel(extractDateKey(timestamp));
}
