import type { OptionTrade, ParsedOptionData } from '../types/options';
import { createParsedOptionData } from './optionsParser';

const OPTIONS_TRADES_ENDPOINT = '/.netlify/functions/options-trades';
const OPTIONS_TRADES_PAGE_SIZE = 1000;

interface StoredTradesResponse {
  trades: OptionTrade[];
  hasMore?: boolean;
  nextOffset?: number | null;
}

interface ImportTradesResponse {
  parsedCount: number;
  insertedCount: number;
  duplicateCount: number;
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
  const contentType = response.headers.get('content-type') ?? '';
  let data: ({ error?: string; errorMessage?: string; errorType?: string } & Record<string, unknown>) | null = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = null;
  }

  if (!contentType.includes('application/json')) {
    const looksLikeHtml = text.trimStart().startsWith('<');

    if (!response.ok && data) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : typeof data.errorMessage === 'string'
            ? `${typeof data.errorType === 'string' ? `${data.errorType}: ` : ''}${data.errorMessage}`
            : `Options storage request failed (${response.status})`;
      throw new Error(message);
    }

    throw new Error(
      looksLikeHtml
        ? 'Options storage endpoint returned the app page instead of the Netlify Function. Use the deployed Netlify site or run with netlify dev; plain Vite dev cannot save to Supabase.'
        : `Options storage returned ${contentType || 'an unknown content type'} instead of JSON.`
    );
  }

  if (!data) {
    throw new Error('Options storage returned invalid JSON.');
  }

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `Options storage request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
};

export async function loadStoredOptionsTrades(): Promise<ParsedOptionData> {
  const trades: OptionTrade[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(`${OPTIONS_TRADES_ENDPOINT}?limit=${OPTIONS_TRADES_PAGE_SIZE}&offset=${offset}`);
    const data = await readJson<StoredTradesResponse>(response);
    trades.push(...data.trades);

    if (!data.hasMore || data.nextOffset === null || data.nextOffset === undefined) {
      break;
    }

    offset = data.nextOffset;
  }

  return createParsedOptionData(trades);
}

export async function appendStoredOptionsTrades(trades: OptionTrade[]): Promise<ImportTradesResponse & { totalStored: number } & ParsedOptionData> {
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
  const parsed = await loadStoredOptionsTrades();

  return {
    ...data,
    totalStored: parsed.trades.length,
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
