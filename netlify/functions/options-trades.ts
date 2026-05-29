import type { Handler } from '@netlify/functions';
import { createHash } from 'node:crypto';

type OptionType = 'C' | 'P';

interface IncomingTrade {
  timestamp: string;
  timestampIso?: string | null;
  tradeDate?: string | null;
  contract: string;
  quantity: number;
  price: number;
  exchange: string;
  bidAsk: string;
  delta: string | number;
  iv: string;
  underlyingPrice: number;
  type: OptionType;
  strike: number;
  breakeven: number;
  absDelta: number;
  isTimeOnly?: boolean;
}

interface TradeRow {
  import_batch_id?: string;
  trade_ts: string;
  trade_date: string | null;
  timestamp_text: string;
  is_time_only: boolean;
  contract: string;
  quantity: number;
  price: number;
  exchange: string | null;
  bid_ask: string | null;
  delta: number | null;
  iv: string | null;
  underlying_price: number | null;
  option_type: OptionType;
  strike: number;
  breakeven: number;
  abs_delta: number;
  fingerprint: string;
  occurrence_index: number;
  payload: IncomingTrade;
}

interface ImportBatch {
  id: string;
}

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const getEnv = (key: string): string | undefined => {
  if (typeof Netlify !== 'undefined') {
    return Netlify.env.get(key);
  }

  return process.env[key];
};

declare const Netlify:
  | {
      env: {
        get: (key: string) => string | undefined;
      };
    }
  | undefined;

const normalizeText = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');

const normalizeUpper = (value: unknown): string => normalizeText(value).toUpperCase();

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const numberKey = (value: unknown, decimals: number): string => {
  const parsed = toFiniteNumber(value);
  return parsed === null ? '' : parsed.toFixed(decimals);
};

const parseTradeDate = (timestampIso: string | null | undefined): string | null => {
  if (!timestampIso) return null;
  const date = new Date(timestampIso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const parseTradeTimestamp = (trade: IncomingTrade): string | null => {
  if (trade.timestampIso) {
    const parsedIso = new Date(trade.timestampIso);
    if (!Number.isNaN(parsedIso.getTime())) {
      return parsedIso.toISOString();
    }
  }

  const parsedTimestamp = new Date(trade.timestamp);
  return Number.isNaN(parsedTimestamp.getTime()) ? null : parsedTimestamp.toISOString();
};

const buildFingerprint = (trade: IncomingTrade): string => {
  const canonical = [
    normalizeText(trade.timestampIso || trade.timestamp),
    normalizeUpper(trade.contract),
    Math.trunc(Number(trade.quantity) || 0).toString(),
    numberKey(trade.price, 4),
    normalizeUpper(trade.exchange),
    normalizeText(trade.bidAsk),
    numberKey(trade.delta, 4),
    normalizeText(trade.iv),
    numberKey(trade.underlyingPrice, 4),
    normalizeUpper(trade.type),
    numberKey(trade.strike, 2),
    numberKey(trade.breakeven, 4),
    numberKey(trade.absDelta, 4),
  ].join('|');

  return createHash('sha256').update(canonical).digest('hex');
};

const toTradeRows = (trades: IncomingTrade[], importBatchId?: string): TradeRow[] => {
  const occurrenceCounts = new Map<string, number>();

  return trades.flatMap(trade => {
    const tradeTs = parseTradeTimestamp(trade);
    const parsedTradeDate = trade.tradeDate || parseTradeDate(tradeTs);
    const optionType = normalizeUpper(trade.type) === 'P' ? 'P' : 'C';
    const price = toFiniteNumber(trade.price);
    const strike = toFiniteNumber(trade.strike);
    const breakeven = toFiniteNumber(trade.breakeven);
    const absDelta = toFiniteNumber(trade.absDelta);
    const quantity = Math.trunc(Number(trade.quantity) || 0);

    if (!tradeTs || !trade.timestamp || !trade.contract || !quantity || price === null || strike === null || breakeven === null || absDelta === null) {
      return [];
    }

    const fingerprint = buildFingerprint(trade);
    const occurrenceIndex = (occurrenceCounts.get(fingerprint) ?? 0) + 1;
    occurrenceCounts.set(fingerprint, occurrenceIndex);

    return [{
      import_batch_id: importBatchId,
      trade_ts: tradeTs,
      trade_date: parsedTradeDate,
      timestamp_text: trade.timestamp,
      is_time_only: trade.isTimeOnly === true,
      contract: normalizeText(trade.contract),
      quantity,
      price,
      exchange: normalizeText(trade.exchange) || null,
      bid_ask: normalizeText(trade.bidAsk) || null,
      delta: toFiniteNumber(trade.delta),
      iv: normalizeText(trade.iv) || null,
      underlying_price: toFiniteNumber(trade.underlyingPrice),
      option_type: optionType,
      strike,
      breakeven,
      abs_delta: absDelta,
      fingerprint,
      occurrence_index: occurrenceIndex,
      payload: trade,
    }];
  });
};

const toClientTrade = (row: Record<string, unknown>): IncomingTrade => ({
  timestamp: String(row.timestamp_text ?? ''),
  contract: String(row.contract ?? ''),
  quantity: Number(row.quantity ?? 0),
  price: Number(row.price ?? 0),
  exchange: String(row.exchange ?? ''),
  bidAsk: String(row.bid_ask ?? ''),
  delta: String(row.delta ?? '0'),
  iv: String(row.iv ?? '0'),
  underlyingPrice: Number(row.underlying_price ?? 0),
  type: row.option_type === 'P' ? 'P' : 'C',
  strike: Number(row.strike ?? 0),
  breakeven: Number(row.breakeven ?? 0),
  absDelta: Number(row.abs_delta ?? 0),
  isTimeOnly: row.is_time_only === true,
});

const createSupabaseClient = () => {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY Netlify environment variable');
  }

  const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1`;

  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        apikey: supabaseKey,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = typeof data?.message === 'string' ? data.message : `Supabase request failed (${response.status})`;
      throw new Error(message);
    }

    return data as T;
  };

  return { request };
};

const fetchTrades = async () => {
  const { request } = createSupabaseClient();
  const rows = await request<Record<string, unknown>[]>(
    '/option_trades?select=timestamp_text,contract,quantity,price,exchange,bid_ask,delta,iv,underlying_price,option_type,strike,breakeven,abs_delta,is_time_only&order=trade_ts.asc&order=id.asc&limit=50000'
  );

  return rows.map(toClientTrade);
};

const createImportBatch = async (rawRowCount: number, parsedCount: number): Promise<string> => {
  const { request } = createSupabaseClient();
  const rows = await request<ImportBatch[]>('/option_import_batches?select=id', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{
      raw_row_count: rawRowCount,
      parsed_count: parsedCount,
    }]),
  });

  if (!rows[0]?.id) {
    throw new Error('Failed to create option import batch');
  }

  return rows[0].id;
};

const updateImportBatch = async (id: string, insertedCount: number, duplicateCount: number) => {
  const { request } = createSupabaseClient();
  await request(`/option_import_batches?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      inserted_count: insertedCount,
      duplicate_count: duplicateCount,
    }),
  });
};

const insertTrades = async (rows: TradeRow[]): Promise<number> => {
  const { request } = createSupabaseClient();
  let insertedCount = 0;
  const chunkSize = 500;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const inserted = await request<{ id: number }[]>('/option_trades?on_conflict=fingerprint,occurrence_index&select=id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(chunk),
    });

    insertedCount += Array.isArray(inserted) ? inserted.length : 0;
  }

  return insertedCount;
};

const clearTrades = async () => {
  const { request } = createSupabaseClient();
  await request('/option_trades?id=gte.0', {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
  await request('/option_import_batches?id=not.is.null', {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const trades = await fetchTrades();
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ trades }),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const incomingTrades = Array.isArray(body.trades) ? body.trades as IncomingTrade[] : [];
      const importBatchId = await createImportBatch(incomingTrades.length, incomingTrades.length);
      const rows = toTradeRows(incomingTrades, importBatchId);
      const insertedCount = await insertTrades(rows);
      const duplicateCount = Math.max(0, rows.length - insertedCount);
      await updateImportBatch(importBatchId, insertedCount, duplicateCount);
      const trades = await fetchTrades();

      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          parsedCount: rows.length,
          insertedCount,
          duplicateCount,
          totalStored: trades.length,
          trades,
        }),
      };
    }

    if (event.httpMethod === 'DELETE') {
      await clearTrades();
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ ok: true }),
      };
    }

    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('[options-trades]', error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Options storage error',
      }),
    };
  }
};
