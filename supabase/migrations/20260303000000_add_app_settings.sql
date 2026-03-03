-- Migration: add app_settings table
-- Stores durable application settings (key/value pairs).
-- This replaces the Redis-based storage for settings that must survive overnight.

create table if not exists app_settings (
  key   text primary key,
  value text not null
);

-- Seed the auto-trade toggle default (off = safe default)
insert into app_settings (key, value)
values ('auto_trade_enabled', 'false')
on conflict (key) do nothing;
