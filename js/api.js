// ─── SHARED STATE ────────────────────────────────────────
let charts      = {};
let refreshTimer;
const seriesRawData = {};

// ─── UTILITIES ───────────────────────────────────────────
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

// ─── DATA ────────────────────────────────────────────────
// All data comes from one file, rebuilt hourly by python/build_data.py
// (see .github/workflows/deploy.yml). No API keys in the browser.
let MACRO_DATA = null;

async function loadMacroData() {
  const res = await fetch('data/macro.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('data file unavailable (HTTP ' + res.status + ')');
  const data = await res.json();
  Object.values(data.series || {}).forEach(s => {
    s.obs = (s.obs || []).map(p => ({ date: p[0], value: p[1] }));
  });
  MACRO_DATA = data;
  return data;
}
