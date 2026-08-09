// Browser Supabase client, built on @supabase/ssr so auth cookies stay in
// sync with the middleware (utils/supabase/middleware.ts) and any server
// components you add later.
//
// This re-exports a single client instance for convenience across the
// client components in this app (MapView, ObservationForm, etc).

import { createClient as createBrowserSupabaseClient } from "../../utils/supabase/client";

export const supabase = createBrowserSupabaseClient();
