import type { OptionTrade, ParsedOptionData } from '../types/options';
import { createParsedOptionData } from './optionsParser';

const OPTIONS_TRADES_ENDPOINT = '/.netlify/functions/options-trades';

interface StoredTradesResponse {
  trades: OptionTrade[];
}

interface ImportTradesResponse extends StoredTradesResponse {
  parsedCount: number;
  insertedCount: number;
  duplicateCount: number;
  totalStored: number;
}

const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const withLocalTimestampFields = (trade: OptionTrade) => {
  const parsedDate = new Date(trade.timestamp);

  return {
    ...trade,
    timestampIso: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
    tradeDate: Number.isNaN(parsedDate.getTime()) ? null : toLocalDateKey(parsedDate),
  };
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Options storage request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
};

export async function loadStoredOptionsTrades(): Promise<ParsedOptionData> {
  const response = await fetch(OPTIONS_TRADES_ENDPOINT);
  const data = await readJson<StoredTradesResponse>(response);
  return createParsedOptionData(data.trades);
}

export async function appendStoredOptionsTrades(trades: OptionTrade[]): Promise<ImportTradesResponse & ParsedOptionData> {
  const response = await fetch(OPTIONS_TRADES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trades: trades.map(withLocalTimestampFields),
    }),
  });

  const data = await readJson<ImportTradesResponse>(response);
  const parsed = createParsedOptionData(data.trades);

  return {
    ...data,
    ...parsed,
  };
}

export async function clearStoredOptionsTrades(): Promise<ParsedOptionData> {
  const response = await fetch(OPTIONS_TRADES_ENDPOINT, {
    method: 'DELETE',
  });

  await readJson<{ ok: boolean }>(response);
  return createParsedOptionData([]);
}
