const QUARTERLY_FUTURES = [
  { month: 3, code: 'H' },
  { month: 6, code: 'M' },
  { month: 9, code: 'U' },
  { month: 12, code: 'Z' },
];

export const DEFAULT_SPOT_EPIC = 'US500';
export const STALE_DEFAULT_FUTURES_EPIC = 'ESZ2025';

export function getDefaultFuturesEpic(date = new Date()): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const contract = QUARTERLY_FUTURES.find(item => month <= item.month) ?? QUARTERLY_FUTURES[0];
  const contractYear = contract.month >= month ? year : year + 1;

  return `ES${contract.code}${contractYear}`;
}

export function getStoredFuturesEpic(): string {
  const storedEpic = localStorage.getItem('market_futures_epic');

  if (!storedEpic || storedEpic === STALE_DEFAULT_FUTURES_EPIC) {
    const defaultEpic = getDefaultFuturesEpic();
    localStorage.setItem('market_futures_epic', defaultEpic);
    return defaultEpic;
  }

  return storedEpic;
}
