// ─── SHARED STATE ────────────────────────────────────────
let charts      = {};
let sparklines  = {};
let refreshTimer;
const seriesRawData = {};

// ─── UTILITIES ───────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function filterToTwoYears(obs) {
  const cutoff = (new Date().getFullYear() - 2) + '-01-01';
  return obs.filter(d => d.date >= cutoff);
}

function parseFREDJson(json) {
  if (!json.observations) throw new Error('No observations in response');
  return json.observations
    .filter(o => o.value !== '.' && o.value !== '')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .reverse();
}

function sampleMonthlyObservations(obs) {
  const monthly = new Map();
  obs.forEach(d => monthly.set(d.date.slice(0, 7), d));
  return Array.from(monthly.values());
}

function findPriorObservation(obs, date, yearsBack) {
  const priorDate = (parseInt(date.slice(0, 4), 10) - yearsBack) + date.slice(4);
  const exact = obs.find(p => p.date === priorDate);
  if (exact) return exact;

  const target = Date.parse(priorDate + 'T00:00:00Z');
  let closest = null;
  let closestDays = Infinity;
  obs.forEach(p => {
    if (p.date >= date) return;
    const distanceDays = Math.abs(Date.parse(p.date + 'T00:00:00Z') - target) / 86400000;
    if (distanceDays <= 45 && distanceDays < closestDays) {
      closest = p;
      closestDays = distanceDays;
    }
  });
  return closest;
}

function calculateYoYObservations(obs) {
  return obs.map(d => {
    const prior = findPriorObservation(obs, d.date, 1);
    return {
      date: d.date,
      value: prior ? ((d.value - prior.value) / Math.abs(prior.value)) * 100 : null
    };
  }).filter(d => d.value !== null);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// 'long':  "Oct 2026", "Q3 2026" (quarterly) or "Nov 19, 2026" (daily reading)
// 'short': "Oct '26",  "Q3 '26"             or "11/19"
function formatObsDate(date, style, quarterly) {
  const y = date.slice(0, 4), m = parseInt(date.slice(5, 7), 10), d = parseInt(date.slice(8, 10), 10);
  const yy = "'" + y.slice(2);
  if (d !== 1) return style === 'short' ? m + '/' + d : MONTHS[m - 1] + ' ' + d + ', ' + y;
  if (quarterly) return 'Q' + Math.ceil(m / 3) + ' ' + (style === 'short' ? yy : y);
  return MONTHS[m - 1] + ' ' + (style === 'short' ? yy : y);
}

// ─── NUMBER FORMATTING ───────────────────────────────────
// Units: '$' is a prefix; 'B$'/'M$' read as $…B / $…M; anything else is a suffix.
function splitUnit(unit) {
  if (unit === '$') return { pre: '$', post: '' };
  if (unit === 'B$') return { pre: '$', post: 'B' };
  if (unit === 'M$') return { pre: '$', post: 'M' };
  return { pre: '', post: unit || '' };
}

function formatNumber(value, display) {
  const sign = value < 0 ? '−' : (display.showSign && value > 0 ? '+' : '');
  return sign + Math.abs(value).toLocaleString(undefined, {
    // Fixed decimals so columns compare cleanly; axis ticks drop trailing zeros.
    minimumFractionDigits: display.tick ? 0 : Math.min(display.decimals, 2),
    maximumFractionDigits: display.decimals
  });
}

function formatDisplayValue(value, display) {
  if (value == null || isNaN(value)) return '–';
  const u = splitUnit(display.unit);
  const n = formatNumber(value, display);
  return (/^[+−]/.test(n) ? n[0] + u.pre + n.slice(1) : u.pre + n) + u.post;
}

// ─── MODULE VIEW MODES (Level / MoM / QoQ / YoY) ─────────
// How a change is measured for a series:
//   'pct'  — percent change (indexes, dollar amounts, counts)
//   'pp'   — percentage-point difference (series already in %)
//   'diff' — plain difference in the series' own unit (e.g. payrolls)
function changeKind(cfg) {
  if (cfg.change) return cfg.change;
  return cfg.unit === '%' ? 'pp' : 'pct';
}

// The period-over-period label for a series: QoQ for quarterly data, else MoM.
function periodLabel(cfg) {
  return cfg.freq === 'QoQ' ? 'QoQ' : 'MoM';
}

function seriesModes(cfg) {
  return ['Level', periodLabel(cfg), 'YoY'];
}

function changeBetween(current, prior, kind) {
  if (kind === 'pct') return ((current - prior) / Math.abs(prior)) * 100;
  return current - prior;
}

// Turns level observations into the series shown for a mode.
// obs must be ascending by date and already sampled to the display frequency.
function buildModeSeries(obs, cfg, mode) {
  const kind = changeKind(cfg);
  const changeFormat = kind === 'pct'
    ? { unit: '%', decimals: 2 }
    : kind === 'pp'
      ? { unit: ' pp', decimals: 2 }
      : { unit: cfg.unit, decimals: cfg.decimals };

  if (mode === 'YoY') {
    const out = [];
    obs.forEach(d => {
      const prior = findPriorObservation(obs, d.date, 1);
      if (prior && prior.value !== 0) out.push({ date: d.date, value: changeBetween(d.value, prior.value, kind) });
    });
    return Object.assign({ mode, obs: out, showSign: true }, changeFormat);
  }

  if (mode === 'MoM' || mode === 'QoQ') {
    // Only compare consecutive periods; skip across gaps in the source data.
    const maxGapDays = mode === 'QoQ' ? 120 : 45;
    const out = [];
    for (let i = 1; i < obs.length; i++) {
      if (obs[i - 1].value === 0) continue;
      const gapDays = (Date.parse(obs[i].date) - Date.parse(obs[i - 1].date)) / 86400000;
      if (gapDays > maxGapDays) continue;
      out.push({ date: obs[i].date, value: changeBetween(obs[i].value, obs[i - 1].value, kind) });
    }
    return Object.assign({ mode, obs: out, showSign: true }, changeFormat);
  }

  return { mode: 'Level', obs: obs.slice(), unit: cfg.unit, decimals: cfg.decimals, showSign: false };
}

// Replace the (incomplete) current-month point of a monthly series with the
// most recent raw reading, so headline values stay current.
function mergeLatestObservation(monthly, latest) {
  if (!latest) return monthly;
  const month = latest.date.slice(0, 7);
  const kept = monthly.filter(d => d.date.slice(0, 7) !== month && d.date < latest.date);
  kept.push(latest);
  return kept;
}

// ─── FETCH ───────────────────────────────────────────────
async function fetchWithProxy(url) {
  const res = await fetch(PROXY_URL + encodeURIComponent(url));
  if (!res.ok) throw new Error('proxy failed: HTTP ' + res.status);
  return res.json();
}

async function fetchFRED(seriesId, limit = 60) {
  const url = 'https://api.stlouisfed.org/fred/series/observations' +
    '?series_id=' + seriesId +
    '&api_key=' + FRED_API_KEY +
    '&file_type=json&sort_order=desc&limit=' + limit;
  return parseFREDJson(await fetchWithProxy(url));
}

async function fetchFREDHistory(seriesId) {
  return fetchFRED(seriesId, 100000);
}

// Full history for a dashboard module. Daily/weekly series (sample: 'monthly')
// are rolled up to month-end by FRED, then topped up with the latest reading.
async function fetchFREDSeries(cfg) {
  const base = 'https://api.stlouisfed.org/fred/series/observations' +
    '?series_id=' + cfg.id +
    '&api_key=' + FRED_API_KEY +
    '&file_type=json&sort_order=desc';

  if (cfg.sample !== 'monthly') {
    return parseFREDJson(await fetchWithProxy(base));
  }
  const monthly = parseFREDJson(await fetchWithProxy(base + '&frequency=m&aggregation_method=eop'));
  const latest  = await fetchFRED(cfg.id, 1);
  return mergeLatestObservation(monthly, latest[latest.length - 1]);
}

async function fetchVintage(seriesId, vintageDates) {
  const url = 'https://api.stlouisfed.org/fred/series/observations' +
    '?series_id=' + seriesId +
    '&api_key=' + FRED_API_KEY +
    '&file_type=json&sort_order=desc&limit=5' +
    '&vintage_dates=' + vintageDates.join(',');
  const j = await fetchWithProxy(url);
  if (!j.observations) return null;
  const valid = j.observations.filter(o => o.value !== '.' && o.value !== '');
  return valid.length > 0 ? parseFloat(valid[0].value) : null;
}

async function fetchMarket(symbol) {
  return fetchMarketRange(symbol, '3y', '1d');
}

async function fetchMarketHistory(symbol) {
  return fetchMarketRange(symbol, 'all', '1mo');
}

async function fetchMarketRange(symbol, range, interval) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    symbol.replace('^', '%5E') + '?' +
    // Yahoo silently coarsens range=max to 3-month bars; an explicit
    // period keeps the requested interval.
    (range === 'all' ? 'period1=0&period2=' + Math.floor(Date.now() / 1000) : 'range=' + range) +
    '&interval=' + interval + '&events=history';
  const j = await fetchWithProxy(url);
  if (!j.chart || !j.chart.result || !j.chart.result[0]) {
    const err = j.chart?.error?.description || j['Error Message'] || 'no data returned';
    throw new Error(symbol + ': ' + err);
  }
  const result  = j.chart.result[0];
  const closes  = result.indicators.quote[0].close;
  return result.timestamp
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: closes[i] }))
    .filter(d => d.value != null);
}

async function fetchMarketWithFallbacks(symbols) {
  for (let i = 0; i < symbols.length; i++) {
    try {
      const obs = await fetchMarket(symbols[i]);
      if (obs.length > 0) {
        console.log('Market fallback: resolved using ' + symbols[i]);
        return obs;
      }
    } catch (e) {
      console.warn('Market fallback: ' + symbols[i] + ' failed — ' + e.message);
      if (i < symbols.length - 1) await sleep(300);
    }
  }
  throw new Error('All tickers failed: ' + symbols.join(', '));
}

// Full monthly history for a market symbol (Yahoo), topped up with the
// latest daily close so the headline is current. Mirrors fetchFREDSeries.
async function fetchMarketSeries(cfg) {
  const symbols = cfg.alts || [cfg.id];
  let lastError;
  for (let i = 0; i < symbols.length; i++) {
    try {
      const monthly = await fetchMarketRange(symbols[i], 'all', '1mo');
      const daily   = await fetchMarketRange(symbols[i], '5d', '1d');
      if (monthly.length) return mergeLatestObservation(monthly, daily[daily.length - 1]);
    } catch (e) {
      lastError = e;
      if (i < symbols.length - 1) await sleep(300);
    }
  }
  throw lastError || new Error('no data for ' + symbols.join(', '));
}

// One entry point for every module, whatever its source.
function fetchSeries(cfg) {
  return cfg.source === 'market' ? fetchMarketSeries(cfg) : fetchFREDSeries(cfg);
}

// Total return over trailing windows from daily closes (ascending).
// Returns { '1M': pct, '3M': pct, 'YTD': pct, '1Y': pct } (null when unavailable).
function trailingReturns(daily) {
  if (!daily.length) return {};
  const last = daily[daily.length - 1];
  const valueOnOrBefore = date => {
    let found = null;
    for (const d of daily) { if (d.date <= date) found = d; else break; }
    return found;
  };
  const shift = (months) => {
    const dt = new Date(last.date + 'T00:00:00Z');
    dt.setUTCMonth(dt.getUTCMonth() - months);
    return dt.toISOString().slice(0, 10);
  };
  const pct = base => (base && base.value ? (last.value / base.value - 1) * 100 : null);
  const yearStart = valueOnOrBefore((parseInt(last.date.slice(0, 4), 10) - 1) + '-12-31');
  return {
    '1M':  pct(valueOnOrBefore(shift(1))),
    '3M':  pct(valueOnOrBefore(shift(3))),
    'YTD': pct(yearStart),
    '1Y':  pct(valueOnOrBefore(shift(12)))
  };
}
