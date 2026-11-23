// ─── GLOBAL CONFIG ───────────────────────────────────────
// Series data is prebuilt into data/macro.json by python/build_data.py;
// the browser holds no API keys.
const REFRESH_INTERVAL = 10 * 60 * 1000; // re-check the data file every 10 minutes

// Supabase (public anon key — safe for browser, RLS protects writes)
const SUPABASE_URL  = 'https://ygcirhhnojzmprbomzxs.supabase.co';
const SUPABASE_ANON = 'sb_publishable_anqkkEq1X9N4NnN3NxJ8pg_Zx7cjaS_';
