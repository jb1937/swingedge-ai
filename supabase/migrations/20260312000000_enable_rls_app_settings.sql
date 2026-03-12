-- Enable RLS on app_settings.
-- All access is via the service role key (server-side only), which bypasses RLS.
-- No permissive policies are added, so anon/authenticated roles have no direct access.
alter table public.app_settings enable row level security;
