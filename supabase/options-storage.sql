create extension if not exists pgcrypto;

create table if not exists public.option_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'tos-paste',
  raw_row_count integer not null default 0,
  parsed_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0
);

create table if not exists public.option_trades (
  id bigint generated always as identity primary key,
  import_batch_id uuid references public.option_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  trade_ts timestamptz not null,
  trade_date date,
  timestamp_text text not null,
  is_time_only boolean not null default false,
  contract text not null,
  quantity integer not null,
  price numeric(12, 4) not null,
  exchange text,
  bid_ask text,
  delta numeric(8, 4),
  iv text,
  underlying_price numeric(12, 4),
  option_type text not null check (option_type in ('C', 'P')),
  strike numeric(12, 2) not null,
  breakeven numeric(12, 4) not null,
  abs_delta numeric(8, 4) not null,
  fingerprint text not null,
  occurrence_index integer not null,
  payload jsonb not null default '{}'::jsonb,
  constraint option_trades_fingerprint_occurrence_unique unique (fingerprint, occurrence_index)
);

create index if not exists option_trades_trade_ts_idx on public.option_trades (trade_ts desc);
create index if not exists option_trades_trade_date_idx on public.option_trades (trade_date);
create index if not exists option_trades_option_type_idx on public.option_trades (option_type);
create index if not exists option_trades_abs_delta_idx on public.option_trades (abs_delta);
create index if not exists option_trades_breakeven_idx on public.option_trades (breakeven);

alter table public.option_import_batches enable row level security;
alter table public.option_trades enable row level security;

revoke all on public.option_import_batches from anon, authenticated;
revoke all on public.option_trades from anon, authenticated;
