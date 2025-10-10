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
  if (timestamp.match(/[A-Za-z]+ \d+ \d{4}/)) {
    return { timestamp, isTimeOnly: false };
  }
  
  // If timestamp is just time (e.g., "10:30:25" or "03:26:54"), add today's date
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