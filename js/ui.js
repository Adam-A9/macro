// ─── HEATMAP HELPERS ─────────────────────────────────────
// These reference HIGHER_IS_GOOD defined per-page in the inline script.

function cellColor(val, sName, isChange) {
  if (sName === 'Spread') return val >= 0 ? 'rgba(0,190,90,0.38)' : 'rgba(220,40,60,0.38)';
  if (isChange) {
    const good = HIGHER_IS_GOOD.includes(sName) ? val >= 0 : val <= 0;
    return good ? 'rgba(0,190,90,0.38)' : 'rgba(220,40,60,0.38)';
  }
  return null;
}

function gradientColor(t, higherIsGood) {
  const g = higherIsGood ? t : 1 - t;
  if (g < 0.5) {
    const r = Math.round(180 + (0.5 - g) * 2 * 75);
    return 'rgba(' + r + ',40,60,0.4)';
  }
  const gr = Math.round(80 + (g - 0.5) * 2 * 150);
  return 'rgba(0,' + gr + ',60,0.4)';
}

// ─── DASHBOARD MODULES (one full-width row per series) ───
// Each page defines LAYOUT = [{ title, series: [names...] }, ...].
// Pages without LAYOUT get one untitled group in FRED_SERIES order.
const moduleModes = {};

function pageLayout() {
  if (typeof LAYOUT !== 'undefined' && LAYOUT.length) return LAYOUT;
  return [{ title: '', series: Object.keys(FRED_SERIES) }];
}

function modeStorageKey(name) {
  return 'macro.mode.' + location.pathname.split('/').pop() + '.' + name;
}

function getMode(name) {
  if (moduleModes[name]) return moduleModes[name];
  const cfg = FRED_SERIES[name];
  let saved = null;
  try { saved = localStorage.getItem(modeStorageKey(name)); } catch (_) {}
  const modes = seriesModes(cfg);
  const fallback = cfg.mode || (DUAL_ROW.includes(name) ? 'YoY' : 'Level');
  moduleModes[name] = modes.includes(saved) ? saved : (modes.includes(fallback) ? fallback : 'Level');
  return moduleModes[name];
}

function setMode(name, mode) {
  moduleModes[name] = mode;
  try { localStorage.setItem(modeStorageKey(name), mode); } catch (_) {}
  document.querySelectorAll('#card-' + name + ' .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  renderModule(name);
}

function moduleMarkup(name) {
  const cfg = FRED_SERIES[name];
  const buttons = seriesModes(cfg).map(m =>
    '<button type="button" class="mode-btn" data-mode="' + m + '">' + m + '</button>').join('');
  return '' +
    '<div class="kpi-card module" id="card-' + name + '">' +
      '<div class="kpi-tooltip" id="tip-' + name + '"></div>' +
      '<div class="module-top">' +
        '<div class="kpi-label">' + cfg.label +
          ' <span class="module-series-id">' + cfg.id + '</span><span class="kpi-info">?</span></div>' +
        '<div class="mode-toggle" role="group" aria-label="View">' + buttons + '</div>' +
      '</div>' +
      '<div class="module-body">' +
        '<div class="module-summary">' +
          '<div class="kpi-value loading-text" id="val-' + name + '">Loading…</div>' +
          '<div class="kpi-date" id="date-' + name + '">–</div>' +
          '<div class="revision-tag flat" id="revision-' + name + '" style="display:none;"></div>' +
          '<dl class="module-stats" id="stats-' + name + '"></dl>' +
        '</div>' +
        '<div class="module-chart">' +
          '<div class="module-chart-canvas" title="Open full history"><canvas id="chart-' + name + '"></canvas></div>' +
          '<div class="module-chart-key">' +
            '<span><i class="key-line"></i>10-yr average</span>' +
            '<span><i class="key-band"></i>Recession</span>' +
            '<a href="#" class="module-history-link" data-series="' + name + '">Full history ↗</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mini-table-wrap" id="mini-table-' + name + '"></div>' +
    '</div>';
}

function renderModules() {
  const host = document.getElementById('modules');
  if (!host) return;
  host.innerHTML = pageLayout().map(group =>
    (group.title ? '<div class="section-label module-group">// ' + group.title + '</div>' : '') +
    group.series.filter(n => FRED_SERIES[n]).map(moduleMarkup).join('')
  ).join('');

  Object.keys(FRED_SERIES).forEach(name => {
    const card = document.getElementById('card-' + name);
    if (!card) return;
    const mode = getMode(name);
    card.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.addEventListener('click', () => setMode(name, btn.dataset.mode));
    });
    card.querySelector('.module-chart-canvas').addEventListener('click', () => openFREDChart(name));
    card.querySelector('.module-history-link').addEventListener('click', e => {
      e.preventDefault();
      openFREDChart(name);
    });
  });
}

function formatDisplayValue(value, display) {
  const prefix = display.showSign && value > 0 ? '+' : '';
  return prefix + value.toLocaleString(undefined, {
    minimumFractionDigits: display.showSign ? Math.min(display.decimals, 2) : 0,
    maximumFractionDigits: display.decimals
  }) + display.unit;
}

// Kept for chart links and older callers: the default interval for a series.
function getDisplayInterval(name, cfg) {
  if (cfg.displayFreq) return cfg.displayFreq;
  return DUAL_ROW.includes(name) ? 'YoY' : cfg.freq;
}

function buildDisplaySeries(name, obs, cfg) {
  const interval = getDisplayInterval(name, cfg);
  const sampledObs = cfg.sample === 'monthly' ? sampleMonthlyObservations(obs) : obs;
  if (interval !== 'YoY') {
    return { interval, unit: cfg.unit, decimals: cfg.decimals, showSign: false, obs: sampledObs };
  }
  const fullObs = seriesRawData[name] || obs;
  return { interval, unit: '%', decimals: 2, showSign: true, obs: calculateYoYObservations(fullObs) };
}

// ─── UPDATE MODULE ───────────────────────────────────────
// References globals: FRED_SERIES, DUAL_ROW, seriesRawData
function updateCard(name, rawObs) {
  seriesRawData[name] = rawObs;
  const tipEl = document.getElementById('tip-' + name);
  if (tipEl) tipEl.textContent = FRED_SERIES[name].desc || '';
  renderModule(name);
}

function renderModule(name) {
  const cfg = FRED_SERIES[name];
  const raw = seriesRawData[name];
  const valEl = document.getElementById('val-' + name);
  if (!cfg || !raw || raw.length < 2 || !valEl) return;

  const quarterly = cfg.freq === 'QoQ';
  const display = buildModeSeries(raw, cfg, getMode(name));
  const obs = display.obs;
  if (obs.length < 1) return;
  const latest = obs[obs.length - 1];
  const fmt = v => (v == null ? '–' : formatDisplayValue(v, display));

  // Headline
  valEl.classList.remove('loading-text');
  const prefix = display.showSign && latest.value > 0 ? '+' : '';
  valEl.innerHTML = prefix + latest.value.toLocaleString(undefined, {
      minimumFractionDigits: display.showSign ? Math.min(display.decimals, 2) : 0,
      maximumFractionDigits: display.decimals
    }) + '<span class="kpi-unit">' + display.unit.trim() + '</span>';
  const modeText = display.mode === 'Level' ? '' : ' · ' + display.mode + ' change';
  document.getElementById('date-' + name).textContent =
    'As of ' + formatObsDate(latest.date, 'long', quarterly) + modeText;

  // Historical context
  const stats = historyStats(obs);
  const statsEl = document.getElementById('stats-' + name);
  if (statsEl && stats) {
    const short = stats.yearsCovered < 9.5;
    const rows = [
      ['1 yr ago', fmt(stats.yearAgo)],
      ['5-yr avg', fmt(stats.avg5)],
      [short ? 'Period avg' : '10-yr avg', fmt(stats.avg10)],
      [short ? 'Period range' : '10-yr range', fmt(stats.low10) + ' to ' + fmt(stats.high10)],
      [short ? 'Percentile' : '10-yr percentile', stats.percentile == null ? '–' : ordinal(stats.percentile)]
    ];
    statsEl.innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
  }

  // 10-year chart
  const cutoff = (parseInt(latest.date.slice(0, 4), 10) - 10) + latest.date.slice(4);
  const chartObs = obs.filter(d => d.date > cutoff);
  makeModuleChart('chart-' + name, chartObs, display, stats ? stats.avg10 : null);

  // Recent readings table (last 12)
  const tableObs = obs.slice(-12);
  const wrap = document.getElementById('mini-table-' + name);
  if (!wrap) return;
  const headers = tableObs.map(d =>
    '<th title="' + formatObsDate(d.date, 'long', quarterly) + '">' + formatObsDate(d.date, 'short', quarterly) + '</th>').join('');
  const cells = tableObs.map(d => '<td>' + fmt(d.value) + '</td>').join('');
  wrap.innerHTML =
    '<table class="mini-table"><thead><tr><th class="row-head"></th>' + headers + '</tr></thead>' +
    '<tbody><tr><td class="row-head">' + display.mode + '</td>' + cells + '</tr></tbody></table>';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── STANDARD FETCH ALL ──────────────────────────────────
// References globals: FRED_SERIES, MARKET (both defined per-page).
// index.html overrides this function to add ALFRED revision logic.
async function fetchAll() {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  btn.classList.add('loading');
  btn.textContent    = '⟳ Loading…';
  errEl.style.display = 'none';

  const errors = [];

  // FRED series
  const fredNames = Object.keys(FRED_SERIES);
  for (let i = 0; i < fredNames.length; i++) {
    if (i > 0) await sleep(300);
    const name = fredNames[i];
    try {
      const cfg = FRED_SERIES[name];
      const obs = await fetchFREDSeries(cfg);
      updateCard(name, obs);
    } catch (e) {
      errors.push('FRED ' + FRED_SERIES[name].id + ': ' + e.message);
      const el = document.getElementById('val-' + name);
      if (el) { el.textContent = 'Error'; el.classList.add('loading-text'); }
    }
  }

  // Market / Yahoo Finance
  const marketSymbols = Object.keys(MARKET);
  for (let i = 0; i < marketSymbols.length; i++) {
    if (i > 0) await sleep(600);
    const sym = marketSymbols[i];
    const cfg = MARKET[sym];
    try {
      const obs    = await fetchMarket(sym);
      if (obs.length > 1) {
        const latest = obs[obs.length - 1];
        const prior  = obs[obs.length - 2];
        const pct    = ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
        const pos    = pct >= 0;
        document.getElementById(cfg.valId).textContent =
          latest.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        const chgEl = document.getElementById(cfg.chgId);
        if (chgEl) {
          chgEl.textContent = (pos ? '+' : '') + pct.toFixed(2) + '%';
          chgEl.style.color = pos ? 'var(--green)' : 'var(--red)';
        }
        makeLineChart(cfg.canvasId, obs.map(d => d.date), obs.map(d => d.value), cfg.color);
      }
    } catch (e) {
      errors.push('Market (' + cfg.label + '): ' + e.message);
      document.getElementById(cfg.valId).textContent = 'N/A';
      const chgEl = document.getElementById(cfg.chgId);
      if (chgEl) chgEl.textContent = '–';
    }
  }

  _finishFetch(errors);
}

// Shared post-fetch housekeeping (timestamp, error display, auto-refresh timer)
function _finishFetch(errors) {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  const now   = new Date();
  const ts    = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('last-updated').textContent = 'Updated ' + ts;
  const footer = document.getElementById('footer-ts');
  if (footer) footer.textContent = 'Last fetch: ' + ts;

  if (errors.length > 0) {
    errEl.innerHTML     = errors.map(e => '⚠ ' + e).join('<br>');
    errEl.style.display = 'block';
  }
  btn.classList.remove('loading');
  btn.textContent = '↻ Refresh';

  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(fetchAll, REFRESH_INTERVAL);
}

// ─── EXPAND MODAL ───────────────────────────────────────
function openChartWindow(params) {
  const query = new URLSearchParams(params);
  window.open('chart.html?' + query.toString(), '_blank', 'noopener');
}

function openFREDChart(name) {
  const cfg = FRED_SERIES[name];
  if (!cfg) return;
  openChartWindow({
    source: 'fred',
    id: cfg.id,
    label: cfg.label,
    unit: cfg.unit,
    decimals: cfg.decimals,
    interval: getMode(name),
    freq: cfg.freq || '',
    change: changeKind(cfg),
    sample: cfg.sample || '',
    color: cfg.bar || '#3b82f6'
  });
}

function openModal(name) {
  const cfg = FRED_SERIES[name];
  if (!cfg) return;
  const obs = seriesRawData[name];
  if (!obs || obs.length < 2) return;

  const modal   = document.getElementById('kpi-modal');
  const overlay = document.getElementById('kpi-modal-overlay');
  if (!modal || !overlay) return;

  // Header info
  document.getElementById('modal-title').textContent = cfg.label;
  var modalSeriesEl = document.getElementById('modal-series');
  if (modalSeriesEl) modalSeriesEl.style.display = 'none';
  const display = buildDisplaySeries(name, obs, cfg);
  document.getElementById('modal-freq').textContent = display.interval;

  const latest = obs[obs.length - 1];
  const prior  = obs[obs.length - 2];
  const change = latest.value - prior.value;
  const pct    = (change / Math.abs(prior.value)) * 100;
  const pos    = change >= 0;

  document.getElementById('modal-value').innerHTML =
    latest.value.toLocaleString(undefined, { maximumFractionDigits: cfg.decimals }) +
    '<span style="font-size:16px;color:var(--muted);font-weight:400;margin-left:4px;">' + cfg.unit + '</span>';

  const chgEl = document.getElementById('modal-change');
  chgEl.textContent = (pos ? '▲' : '▼') + ' ' +
    Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: cfg.decimals }) +
    ' (' + pct.toFixed(2) + '%)';
  chgEl.className = 'kpi-change ' + (pos ? 'pos' : 'neg');

  // Full chart
  makeModalChart(
    'modal-chart-canvas',
    display.obs.map(d => d.date),
    display.obs.map(d => d.value),
    '#3b82f6',
    display.unit
  );

  // Enlarged heatmap table
  const tableWrap = document.getElementById('modal-table');
  const srcTable = document.getElementById('mini-table-' + name);
  tableWrap.innerHTML = srcTable ? srcTable.innerHTML : '';

  // Recession legend — show only if recession bands overlap
  const firstDate = obs[0].date, lastDate = obs[obs.length - 1].date;
  const hasRecession = NBER_RECESSIONS.some(([s, e]) => s <= lastDate && e >= firstDate);
  document.getElementById('modal-recession-legend').style.display = hasRecession ? 'flex' : 'none';

  // Description
  document.getElementById('modal-desc').textContent = cfg.desc || '';

  // Show
  overlay.classList.add('active');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal   = document.getElementById('kpi-modal');
  const overlay = document.getElementById('kpi-modal-overlay');
  if (modal) modal.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

// ─── PAGE INIT ───────────────────────────────────────────
// Called on DOMContentLoaded. Populates tooltips and kicks off the first fetch.
// Also calls fetchCalendar() if it is defined (only loaded on index.html).
function initPage() {
  renderModules();
  Object.keys(FRED_SERIES).forEach(name => {
    const tip = document.getElementById('tip-' + name);
    if (tip && FRED_SERIES[name].desc) tip.textContent = FRED_SERIES[name].desc;
  });
  document.querySelectorAll('.kpi-info').forEach(icon => {
    const card = icon.closest('.kpi-card');
    icon.addEventListener('mouseenter', () => card.classList.add('show-tip'));
    icon.addEventListener('mouseleave', () => card.classList.remove('show-tip'));
  });

  // Market chart panels use the same full-history window.
  Object.keys(MARKET).forEach(symbol => {
    const cfg = MARKET[symbol];
    const panel = document.getElementById(cfg.canvasId)?.closest('.chart-panel');
    if (!panel) return;
    panel.style.cursor = 'pointer';
    panel.addEventListener('click', () => {
      openChartWindow({
        source: 'market',
        id: symbol,
        label: cfg.label,
        unit: cfg.unit || '',
        decimals: cfg.decimals ?? 2,
        interval: 'Level',
        color: cfg.color
      });
    });
  });

  fetchAll();
  if (typeof fetchCalendar === 'function') fetchCalendar();
}

window.addEventListener('DOMContentLoaded', initPage);
