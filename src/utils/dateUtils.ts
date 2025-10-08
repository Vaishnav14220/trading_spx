export function parseTimestamp(timestamp: string): { timestamp: string; isTimeOnly: boolean } {
  // If timestamp already includes a date (e.g., "Mar 14 2024 10:30:25")
  if (timestamp.match(/[A-Za-z]+ \d+ \d{4}/)) {
    return { timestamp, isTimeOnly: false };
  }
  
  // If timestamp is just time (e.g., "10:30:25"), add today's date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  return { timestamp: `${formattedDate} ${timestamp}`, isTimeOnly: true };
}

export function isToday(timestamp: string): boolean {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  return timestamp.startsWith(today);
}

export function extractDate(timestamp: string): string {
  // Extract date part from timestamp (e.g., "Mar 14 2024" from "Mar 14 2024 10:30:25")
  const match = timestamp.match(/([A-Za-z]+ \d+ \d{4})/);
  if (match) {
    return match[1];
  }
  
  // If no date found, return today's date
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}