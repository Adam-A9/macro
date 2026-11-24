// ─── PAGE MODEL ──────────────────────────────────────────
// Each page defines:
//   LAYOUT       = [{ title, series: [names...] }, ...]  (module order and groups)
//   HIDDEN       = [names...]        (loaded for signals but not shown as modules)
//   SHOW_SECTORS = true|false        (ranked sector returns)
// Series settings live in config/series.json; data in data/macro.json.
// SERIES is filled from the data file with just the series this page uses.
let SERIES = {};

const moduleModes = {};
const moduleZoom = {};
const moduleFocus = {};   // date clicked on the full-history chart, per module

// Zoom window (years) for the "recent" chart. Shorter comparisons get
// shorter default windows; the range buttons override it.
const ZOOM_RANGES = [1, 2, 3, 5, 10];
const DEFAULT_ZOOM = { Level: 5, YoY: 5, MoM: 3, QoQ: 2 };

function pageSectors() {
  const on = typeof SHOW_SECTORS !== 'undefined' && SHOW_SECTORS;
  return on && MACRO_DATA && MACRO_DATA.sectors ? MACRO_DATA.sectors.labels : null;
}

function pageSeriesNames() {
  const names = [];
  pageLayout().forEach(g => g.series.forEach(n => names.push(n)));
  (typeof HIDDEN !== 'undefined' ? HIDDEN : []).forEach(n => names.push(n));
  return names;
}

function pageLayout() {
  if (typeof LAYOUT !== 'undefined' && LAYOUT.length) return LAYOUT;
  return [{ title: '', series: Object.keys(SERIES).filter(n => !SERIES[n].hidden) }];
}

function storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }

function modeStorageKey(name) {
  return 'macro.mode.' + (location.pathname.split('/').pop() || 'index.html') + '.' + name;
}

function getMode(name) {
  if (moduleModes[name]) return moduleModes[name];
  const cfg = SERIES[name];
  const modes = seriesModes(cfg);
  const saved = storageGet(modeStorageKey(name));
  const fallback = cfg.mode || 'Level';
  moduleModes[name] = modes.includes(saved) ? saved : (modes.includes(fallback) ? fallback : 'Level');
  return moduleModes[name];
}

function setMode(name, mode) {
  delete moduleZoom[name];
  moduleModes[name] = mode;
  storageSet(modeStorageKey(name), mode);
  renderModule(name);
}

// The right chart's window: the last `years` by default, or `years` centered
// on a date picked on the full-history chart, shifted to stay inside the data.
function zoomWindow(obs, years, focus) {
  if (!obs.length) return { obs: [], focused: false };
  const DAY = 86400000;
  const first = Date.parse(obs[0].date), last = Date.parse(obs[obs.length - 1].date);
  const span = years * 365.25 * DAY;
  let start, end;
  if (!focus) {
    const cutoff = (parseInt(obs[obs.length - 1].date.slice(0, 4), 10) - years) + obs[obs.length - 1].date.slice(4);
    return { obs: obs.filter(d => d.date > cutoff), focused: false };
  }
  const center = Date.parse(focus);
  start = center - span / 2;
  end = center + span / 2;
  if (end > last) { start -= end - last; end = last; }
  if (start < first) { end = Math.min(last, end + (first - start)); start = first; }
  const s = new Date(start).toISOString().slice(0, 10), e = new Date(end).toISOString().slice(0, 10);
  // End-exclusive so every window has the same length; a window that runs to
  // the end of the data keeps the latest point.
  const toEnd = end >= last;
  return { obs: obs.filter(d => d.date >= s && (d.date < e || (toEnd && d.date === e))), focused: true };
}

function setFocus(name, date) {
  if (date) moduleFocus[name] = date; else delete moduleFocus[name];
  renderModule(name);
}

function getZoom(name) {
  return moduleZoom[name] || DEFAULT_ZOOM[getMode(name)] || 5;
}

function setZoom(name, years) {
  moduleZoom[name] = years;
  renderModule(name);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ─── MODULE MARKUP ───────────────────────────────────────
function segmented(cls, items, attr) {
  return '<div class="segmented ' + cls + '" role="group">' +
    items.map(it => '<button type="button" ' + attr + '="' + it.value + '">' + it.label + '</button>').join('') +
    '</div>';
}

function moduleMarkup(name) {
  const cfg = SERIES[name];
  const source = cfg.source === 'market' ? 'Yahoo Finance · ' + cfg.id : 'FRED · ' + cfg.id;
  return '' +
    '<article class="module" id="card-' + name + '">' +
      '<header class="module-head">' +
        '<div class="module-id">' +
          '<h3 class="module-name">' + escapeHtml(cfg.label) + '</h3>' +
          '<div class="module-reading">' +
            '<span class="module-value is-loading" id="val-' + name + '">Loading…</span>' +
            '<span class="module-asof" id="date-' + name + '"></span>' +
          '</div>' +
        '</div>' +
        '<div class="module-controls">' +
          segmented('mode-toggle', seriesModes(cfg).map(m => ({ value: m, label: m })), 'data-mode') +
        '</div>' +
      '</header>' +
      '<div class="module-charts">' +
        '<figure class="pane">' +
          '<figcaption class="pane-head">' +
            '<span class="pane-title" id="hist-title-' + name + '">Full history</span>' +
            '<button type="button" class="link-btn" data-expand>Expand</button>' +
          '</figcaption>' +
          '<div class="pane-canvas"><canvas id="hist-' + name + '" role="img" aria-label="' + escapeHtml(cfg.label) + ', full history"></canvas></div>' +
          '<div class="pane-key" id="hist-key-' + name + '"></div>' +
        '</figure>' +
        '<figure class="pane">' +
          '<figcaption class="pane-head">' +
            '<span class="pane-title" id="zoom-title-' + name + '">Recent</span>' +
            '<button type="button" class="link-btn zoom-reset" data-reset hidden>Back to latest</button>' +
            segmented('zoom-toggle small', ZOOM_RANGES.map(y => ({ value: y, label: y + 'Y' })), 'data-years') +
          '</figcaption>' +
          '<div class="pane-canvas"><canvas id="chart-' + name + '" role="img" aria-label="' + escapeHtml(cfg.label) + ', recent"></canvas></div>' +
          '<div class="pane-key" id="zoom-key-' + name + '"></div>' +
        '</figure>' +
      '</div>' +
      '<div class="table-wrap" id="mini-table-' + name + '"></div>' +
      '<details class="module-about">' +
        '<summary>About this measure <span class="module-source">' + escapeHtml(source) + '</span></summary>' +
        '<p>' + escapeHtml(cfg.desc || '') + '</p>' +
      '</details>' +
    '</article>';
}

function renderModules() {
  const host = document.getElementById('modules');
  if (!host) return;
  host.innerHTML = pageLayout().map(group =>
    '<section class="module-group">' +
      (group.title ? '<h2 class="group-title">' + escapeHtml(group.title) + '</h2>' : '') +
      group.series.filter(n => SERIES[n]).map(moduleMarkup).join('') +
    '</section>'
  ).join('');

  Object.keys(SERIES).forEach(name => {
    const card = document.getElementById('card-' + name);
    if (!card) return;
    card.querySelectorAll('[data-mode]').forEach(btn =>
      btn.addEventListener('click', () => setMode(name, btn.dataset.mode)));
    card.querySelectorAll('[data-years]').forEach(btn =>
      btn.addEventListener('click', () => setZoom(name, parseInt(btn.dataset.years, 10))));
    card.querySelector('[data-expand]').addEventListener('click', () => openSeriesChart(name));
    card.querySelector('[data-reset]').addEventListener('click', () => setFocus(name, null));
    syncButtons(name);
  });
}

function syncButtons(name) {
  const card = document.getElementById('card-' + name);
  if (!card) return;
  const mode = getMode(name), years = getZoom(name);
  card.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  card.querySelectorAll('[data-years]').forEach(b => b.setAttribute('aria-pressed', parseInt(b.dataset.years, 10) === years));
}

// ─── MODULE RENDERING ────────────────────────────────────
function updateCard(name, rawObs) {
  seriesRawData[name] = rawObs;
  renderModule(name);
}

function renderModule(name) {
  const cfg = SERIES[name];
  const raw = seriesRawData[name];
  const valEl = document.getElementById('val-' + name);
  if (!cfg || !raw || raw.length < 2 || !valEl) return;
  syncButtons(name);

  const quarterly = cfg.freq === 'QoQ';
  const display = buildModeSeries(raw, cfg, getMode(name));
  const obs = display.obs;
  if (!obs.length) return;
  const latest = obs[obs.length - 1];

  // Headline
  valEl.classList.remove('is-loading');
  const u = splitUnit(display.unit);
  const head = formatDisplayValue(latest.value, Object.assign({}, display, { unit: u.pre === '$' ? '$' : '' }));
  valEl.innerHTML = escapeHtml(head) +
    (u.post.trim() ? '<span class="module-unit">' + escapeHtml(u.post.trim()) + '</span>' : '');
  const modeText = display.mode === 'Level' ? '' : ' · ' + display.mode + ' change';
  document.getElementById('date-' + name).textContent =
    formatObsDate(latest.date, 'long', quarterly) + modeText;

  // Full history (left) and recent window (right)
  const years = getZoom(name);
  const win = zoomWindow(obs, years, moduleFocus[name]);
  const recent = win.obs;
  const bars = display.mode === 'MoM' || display.mode === 'QoQ';
  const reference = cfg.target && cfg.target[display.mode] != null
    ? { value: cfg.target[display.mode], label: cfg.target.label || 'Target' } : null;
  document.getElementById('hist-title-' + name).textContent = 'Since ' + obs[0].date.slice(0, 4);
  document.getElementById('zoom-title-' + name).textContent = win.focused && recent.length
    ? formatObsDate(recent[0].date, 'long', quarterly) + ' – ' + formatObsDate(recent[recent.length - 1].date, 'long', quarterly)
    : 'Last ' + years + (years === 1 ? ' year' : ' years');
  document.querySelector('#card-' + name + ' [data-reset]').hidden = !win.focused;

  const log = !!cfg.log && display.mode === 'Level';
  makeModuleChart('hist-' + name, obs, display, {
    quarterly, reference, log, maxLabels: 8, noGrid: true,
    highlight: recent.length ? [recent[0].date, recent[recent.length - 1].date] : null,
    onPick: date => setFocus(name, date)      // click: show this period at right
  });
  makeModuleChart('chart-' + name, recent, display, { quarterly, bars, reference, maxLabels: 10 });

  // Keys: say what the shading, highlight and dashed line mean.
  const refKey = reference ? '<span><i class="key-ref"></i>' + escapeHtml(reference.label) + '</span>' : '';
  document.getElementById('hist-key-' + name).innerHTML =
    '<span><i class="key-recession"></i>Recession</span>' +
    '<span><i class="key-window"></i>Shown at right · click to move</span>' + refKey;
  document.getElementById('zoom-key-' + name).innerHTML = refKey;

  // Last 12 readings
  const tableObs = obs.slice(-12);
  const wrap = document.getElementById('mini-table-' + name);
  if (!wrap) return;
  wrap.innerHTML =
    '<table class="readings"><thead><tr><th scope="row">' + display.mode + '</th>' +
      tableObs.map(d => '<th scope="col" title="' + formatObsDate(d.date, 'long', quarterly) + '">' +
        formatObsDate(d.date, 'short', quarterly) + '</th>').join('') +
    '</tr></thead><tbody><tr><th scope="row"></th>' +
      tableObs.map(d => '<td>' + formatDisplayValue(d.value, display) + '</td>').join('') +
    '</tr></tbody></table>';
  wrap.scrollLeft = wrap.scrollWidth;   // latest readings first on narrow screens
  updateGlanceRow(name);
}

function renderAllModules() {
  Object.keys(SERIES).forEach(renderModule);
}

// ─── AT A GLANCE ─────────────────────────────────────────
// Small multiples: one identical tile per module on an even grid. Each tile
// shows name, date, latest value, a 2-year sparkline and either the change
// shows the previous reading with a colored arrow. Selecting a tile jumps to its module.
function sparkline(values) {
  if (values.length < 2) return '';
  const w = 200, h = 40, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  const y = v => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const pts = values.map((v, i) => [i / (values.length - 1) * w, y(v)]);
  const zero = min < 0 && max > 0
    ? '<line class="spark-zero" x1="0" x2="' + w + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>' : '';
  const dot = (cls, pt) => '<span class="spark-dot ' + cls + '" style="top:' + (pt[1] / h * 100).toFixed(1) + '%"></span>';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    zero + '<polyline points="' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/></svg>' +
    dot('start', pts[0]) + dot('end', pts[pts.length - 1]);
}

// ─── ARROW ───────────────────────────────────────────────
// Each tile compares its latest reading with the previous one. The arrow
// shows which way it moved and is colored by whether that's good for the
// series: green = better, red = worse, gray = unchanged or no agreed
// direction. "Better" comes from the series' `good` setting:
// 'up', 'down' or {target} (closer to target is better).
const VIEW_WORDS = { Level: '', YoY: '12-mo change', MoM: '1-mo change', QoQ: 'qtr change' };

function moveQuality(display, cfg) {
  const obs = display.obs;
  if (obs.length < 2) return null;
  const prev = obs[obs.length - 2], latest = obs[obs.length - 1];
  const delta = latest.value - prev.value;
  const dir = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = cfg.good;
  let tone = 'neutral', word = 'no good or bad direction';
  if (good) {
    let better;
    if (good.target != null) {
      // Distance to target only makes sense for rates (12-mo changes, % levels).
      if (display.mode === 'Level' && cfg.unit !== '%') better = null;
      else better = Math.abs(prev.value - good.target) - Math.abs(latest.value - good.target);
    } else {
      better = good === 'down' ? -delta : delta;
    }
    if (better == null) { tone = 'neutral'; word = 'no good or bad direction in this view'; }
    else if (Math.abs(better) < 1e-9) { tone = 'neutral'; word = 'unchanged'; }
    else { tone = better > 0 ? 'good' : 'bad'; word = better > 0 ? 'better' : 'worse'; }
  }
  return { prev, latest, dir, tone, word };
}

function tileHtml(name) {
  const cfg = SERIES[name];
  return '<a class="tile" href="#card-' + name + '" data-series="' + name + '" id="glance-' + name + '">' +
    '<span class="tile-top">' +
      '<span class="tile-name" title="' + escapeHtml(cfg.label) + '">' + escapeHtml(cfg.short || cfg.label) + '</span>' +
      '<span class="tile-date"></span>' +
    '</span>' +
    '<span class="tile-value is-loading">…</span>' +
    '<span class="tile-spark"></span>' +
    '<span class="tile-range"><span class="tile-from"></span><span class="tile-to"></span></span>' +
    '<span class="tile-foot"><span class="tile-prev"></span> <span class="tile-arrow"></span></span>' +
  '</a>';
}

// Pick a column count that fills every row: the widest layout (up to
// maxCols) whose count divides evenly, else the one leaving the fewest gaps.
function gridColumns(n, maxCols) {
  let best = 2, bestGap = Infinity;
  for (let c = Math.max(2, Math.min(maxCols, n)); c >= 2; c--) {
    const gap = (c - n % c) % c;
    if (gap < bestGap) { best = c; bestGap = gap; }
    if (gap === 0) break;
  }
  return best;
}

function layoutGlance() {
  const host = document.getElementById('glanceBody');
  if (!host) return;
  const n = host.querySelectorAll('.tile').length;
  const maxCols = Math.max(2, Math.floor((host.clientWidth + 12) / (204 + 12)));
  host.style.setProperty('--cols', gridColumns(n, Math.min(maxCols, 6)));
}

function renderGlance() {
  const host = document.getElementById('glanceBody');
  if (!host) return;
  const names = [];
  pageLayout().forEach(g => g.series.forEach(n => { if (SERIES[n]) names.push(n); }));
  host.innerHTML = names.map(tileHtml).join('');
  host.querySelectorAll('.tile').forEach(tile => tile.addEventListener('click', e => {
    e.preventDefault();
    jumpToModule(tile.dataset.series);
  }));
  layoutGlance();
  window.addEventListener('resize', layoutGlance);
}

function updateGlanceRow(name) {
  const tile = document.getElementById('glance-' + name);
  const cfg = SERIES[name], raw = seriesRawData[name];
  if (!tile || !cfg || !raw) return;
  const quarterly = cfg.freq === 'QoQ';
  const display = buildModeSeries(raw, cfg, getMode(name));
  const obs = display.obs;
  if (!obs.length) return;
  const latest = obs[obs.length - 1];

  tile.querySelector('.tile-date').textContent = VIEW_WORDS[display.mode] || '';
  const u = splitUnit(display.unit);
  const head = formatDisplayValue(latest.value, Object.assign({}, display, { unit: u.pre === '$' ? '$' : '' }));
  const v = tile.querySelector('.tile-value');
  v.classList.remove('is-loading');
  v.innerHTML = escapeHtml(head) + (u.post.trim() ? '<span class="tile-unit">' + escapeHtml(u.post.trim()) + '</span>' : '');

  // Sparkline over the same 2-year window on every tile, so tiles compare
  // like with like (small multiples share a scale of time).
  const from = (parseInt(latest.date.slice(0, 4), 10) - 2) + latest.date.slice(4);
  let spark = obs.filter(d => d.date >= from);
  if (spark.length < 2) spark = obs.slice(-2);
  tile.querySelector('.tile-spark').innerHTML = sparkline(spark.map(d => d.value));
  tile.querySelector('.tile-from').textContent = formatObsDate(spark[0].date, 'short', quarterly);
  tile.querySelector('.tile-to').textContent = formatObsDate(latest.date, 'short', quarterly);

  // Footer: the previous reading (same measure as the big number) and an
  // arrow colored by whether the move is good for this series.
  const m = moveQuality(display, cfg);
  const prevEl = tile.querySelector('.tile-prev'), arrowEl = tile.querySelector('.tile-arrow');
  if (m) {
    prevEl.innerHTML = 'Prev (' + escapeHtml(formatObsDate(m.prev.date, 'short', quarterly)) + ') <b>' +
      escapeHtml(formatDisplayValue(m.prev.value, display)) + '</b>';
    arrowEl.textContent = m.dir === 'up' ? '▲' : m.dir === 'down' ? '▼' : '→';
    arrowEl.className = 'tile-arrow arrow-' + m.tone;
    arrowEl.title = 'Since the previous reading: ' + m.word;
  } else {
    prevEl.textContent = ''; arrowEl.textContent = '';
  }
  tile.setAttribute('aria-label', cfg.label + (VIEW_WORDS[display.mode] ? ', ' + VIEW_WORDS[display.mode] : '') + ': ' +
    formatDisplayValue(latest.value, display) +
    (m ? '; previous ' + formatDisplayValue(m.prev.value, display) + ', ' + m.word : '') + '. Show full charts.');
}

// Scroll to a module and briefly highlight it.
function jumpToModule(name, instant) {
  const card = document.getElementById('card-' + name);
  if (!card) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: instant || reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', '#card-' + name);
  card.classList.remove('flash');
  void card.offsetWidth;                // restart the animation
  card.classList.add('flash');
}

// "Back to overview" button, shown once the overview is scrolled away.
function initBackToTop() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'to-top';
  btn.textContent = '↑ At a glance';
  btn.hidden = true;
  btn.addEventListener('click', () => {
    const g = document.getElementById('glance');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (g || document.body).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', location.pathname + location.search);
  });
  document.body.appendChild(btn);
  const glance = document.getElementById('glance');
  if (!glance || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(entries => { btn.hidden = entries[0].isIntersecting; })
    .observe(glance);
}

// ─── SECTOR RETURNS ──────────────────────────────────────
const SECTOR_PERIODS = ['1M', '3M', 'YTD', '1Y'];
let sectorReturns = {};
let sectorPeriod = storageGet('macro.sectorPeriod') || 'YTD';

function renderSectors() {
  const sectors = pageSectors();
  const host = document.getElementById('sectors');
  if (!sectors || !host) return;
  const rows = Object.keys(sectors)
    .filter(sym => sectorReturns[sym] && sectorReturns[sym][sectorPeriod] != null)
    .map(sym => ({ sym, label: sectors[sym], value: sectorReturns[sym][sectorPeriod] }))
    .sort((a, b) => b.value - a.value);

  // One linear scale spanning the actual range, so the zero line sits
  // where the data puts it instead of wasting half the width.
  const maxPos = Math.max(0, ...rows.map(r => r.value));
  const maxNeg = Math.max(0, ...rows.map(r => -r.value));
  const span = (maxPos + maxNeg) || 1;
  const hasNeg = maxNeg > 0;
  const zero = maxNeg / span * 100;         // % position of the zero line

  host.querySelector('.sector-rows').innerHTML = rows.length ? rows.map(r => {
    const w = Math.abs(r.value) / span * 100;
    const left = r.value >= 0 ? zero : zero - w;
    const val = formatDisplayValue(r.value, { unit: '%', decimals: 1, showSign: true });
    return '<div class="sector-row">' +
      '<span class="sector-label">' + escapeHtml(r.label) + ' <span class="sector-sym">' + r.sym + '</span></span>' +
      '<span class="sector-track">' +
        (hasNeg ? '<span class="sector-zero" style="left:' + zero + '%"></span>' : '') +
        '<span class="sector-bar' + (r.value < 0 ? ' neg' : '') + '" style="left:' + left + '%;width:' + w + '%"></span>' +
      '</span>' +
      '<span class="sector-value">' + val + '</span>' +
    '</div>';
  }).join('') : '<div class="empty">Loading sector returns…</div>';

  host.querySelectorAll('[data-period]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.period === sectorPeriod));
}

function initSectors() {
  const host = document.getElementById('sectors');
  if (!pageSectors() || !host) return;
  host.querySelector('.sector-controls').innerHTML =
    segmented('period-toggle', SECTOR_PERIODS.map(p => ({ value: p, label: p })), 'data-period');
  host.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => {
    sectorPeriod = b.dataset.period;
    storageSet('macro.sectorPeriod', sectorPeriod);
    renderSectors();
  }));
  renderSectors();
}

// ─── LOAD ────────────────────────────────────────────────
// One request: data/macro.json holds every series, sector returns and the
// calendar's FRED data. The file is rebuilt hourly; re-checked every 10 min.
let modulesRendered = false;

async function fetchAll() {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  errEl.hidden = true;
  const notes = [];

  try {
    const data = await loadMacroData();
    SERIES = {};
    pageSeriesNames().forEach(n => { if (data.series[n]) SERIES[n] = data.series[n]; });
    if (!modulesRendered) {
      renderGlance();
      renderModules();
      initSectors();
      modulesRendered = true;
    }
    Object.keys(SERIES).forEach(name => {
      const s = SERIES[name];
      if (s.stale) {
        notes.push(s.label + ' could not be refreshed' +
          (s.updated_at ? '; showing data from ' + new Date(s.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''));
      }
      if (s.obs.length >= 2) updateCard(name, s.obs);
      else markUnavailable(name);
    });
    // Refresh every tile once all data is in.
    Object.keys(SERIES).forEach(updateGlanceRow);
    sectorReturns = (data.sectors && data.sectors.returns) || {};
    renderSectors();
    if (typeof renderCalendar === 'function') renderCalendar();
    _finishFetch(notes, data.generated_at);
  } catch (e) {
    if (!modulesRendered) {
      document.getElementById('modules').innerHTML = '<p class="empty">Data is unavailable right now.</p>';
    }
    notes.push('Could not load data: ' + e.message);
    _finishFetch(notes, null);
  }
}

function markUnavailable(name) {
  const el = document.getElementById('val-' + name);
  if (el) { el.textContent = 'Unavailable'; el.classList.add('is-loading'); }
}

function _finishFetch(notes, generatedAt) {
  const btn   = document.getElementById('refreshBtn');
  const errEl = document.getElementById('errorMsg');
  if (generatedAt) {
    document.getElementById('last-updated').textContent = 'Data as of ' +
      new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (notes.length) {
    errEl.textContent = notes.join(' · ');
    errEl.hidden = false;
  }
  btn.disabled = false;
  btn.textContent = 'Refresh';
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(fetchAll, REFRESH_INTERVAL);
}

// ─── FULL-SCREEN CHART ───────────────────────────────────
function openSeriesChart(name) {
  if (!SERIES[name]) return;
  const query = new URLSearchParams({ series: name, view: getMode(name) });
  window.open('chart.html?' + query.toString(), '_blank', 'noopener');
}

// ─── PAGE INIT ───────────────────────────────────────────
function initPage() {
  if (!document.getElementById('modules')) return;   // e.g. the test runner
  initBackToTop();
  document.getElementById('refreshBtn').addEventListener('click', fetchAll);
  const target = location.hash.startsWith('#card-') ? location.hash.slice(6) : null;
  fetchAll().then(() => {
    // Arriving with a link to a module (#card-Name): go straight to it.
    if (target) jumpToModule(target, true);
    // The calendar reads FRED data from the same file, so it starts after the load.
    if (typeof fetchCalendar === 'function') fetchCalendar();
  });
}

window.addEventListener('DOMContentLoaded', initPage);
