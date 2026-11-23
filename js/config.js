// ─── GLOBAL CONFIG ───────────────────────────────────────
// All data (series, sector returns, economic calendar) is prebuilt hourly into
// data/macro.json by python/build_data.py; the browser holds no API keys.
const REFRESH_INTERVAL = 10 * 60 * 1000; // re-check the data file every 10 minutes
