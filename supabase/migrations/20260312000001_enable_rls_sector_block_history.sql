-- Enable RLS on sector_block_history.
-- All access is via the service role key (server-side only), which bypasses RLS.
-- No permissive policies are added, so anon/authenticated roles have no direct access.
alter table public.sector_block_history enable row level security;
