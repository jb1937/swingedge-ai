// src/lib/supabase/server.ts
// Server-side Supabase client using the service role key.
// Use this in API routes and server components — never expose to the client.

import { createClient } from '@supabase/supabase-js';

export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        // Opt out of Next.js Data Cache so reads are always fresh from Supabase.
        fetch: (url, options = {}) =>
          fetch(url as RequestInfo, { ...options, cache: 'no-store' }),
      },
    }
  );
}
