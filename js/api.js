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
  return fetchMarketRange(symbol, 'max', '1mo');
}

async function fetchMarketRange(symbol, range, interval) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    symbol.replace('^', '%5E') +
    '?range=' + range + '&interval=' + interval + '&events=history';
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
