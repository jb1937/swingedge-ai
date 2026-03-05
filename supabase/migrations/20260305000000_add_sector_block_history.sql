-- Migration: add sector_block_history table
-- Records every time swingedge:skip_sectors changes so backtests can
-- (in future) replay historically accurate sector blocks.
--
-- source values:
--   'auto_apply'    — written by the daily-scan sector brief cron
--   'manual_add'    — user added a sector via the settings UI
--   'manual_remove' — user removed a sector via the settings UI

create table if not exists sector_block_history (
  id         uuid        primary key default gen_random_uuid(),
  changed_at timestamptz not null    default now(),
  sectors    text[]      not null,
  source     text        not null    check (source in ('auto_apply', 'manual_add', 'manual_remove'))
);

-- Index for time-range queries (future backtest sector replay)
create index if not exists sector_block_history_changed_at_idx
  on sector_block_history (changed_at desc);
