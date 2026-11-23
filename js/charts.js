// ─── THEME TOKENS ────────────────────────────────────────
// Chart colors are read from the CSS custom properties in css/site.css so
// the palette stays in one place.
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyChartDefaults() {
  Chart.defaults.color = token('--ink-3');
  Chart.defaults.font.family = token('--font-sans') || 'system-ui, sans-serif';
  Chart.defaults.font.size = 11;
}
applyChartDefaults();

// NBER business-cycle peaks and troughs (monthly), 1948 onward.
const NBER_RECESSIONS = [
  ['1948-11-01','1949-10-01'],
  ['1953-07-01','1954-05-01'],
  ['1957-08-01','1958-04-01'],
  ['1960-04-01','1961-02-01'],
  ['1969-12-01','1970-11-01'],
  ['1973-11-01','1975-03-01'],
  ['1980-01-01','1980-07-01'],
  ['1981-07-01','1982-11-01'],
  ['1990-07-01','1991-03-01'],
  ['2001-03-01','2001-11-01'],
  ['2007-12-01','2009-06-01'],
  ['2020-02-01','2020-04-01']
];

// Index range [i0, i1] of labels falling inside [start, end], or null.
function labelRange(labels, start, end) {
  const i0 = labels.findIndex(l => l >= start);
  let i1 = -1;
  for (let i = labels.length - 1; i >= 0; i--) { if (labels[i] <= end) { i1 = i; break; } }
  return (i0 < 0 || i1 < i0) ? null : [i0, i1];
}

// Draws, behind the data: NBER recession bands, an optional highlighted
// window, and an optional labeled reference line (e.g. the Fed's 2% target).
const moduleBandsPlugin = {
  id: 'moduleBands',
  beforeDatasetsDraw(chart, args, opts) {
    const labels = chart.data.labels || [];
    if (labels.length < 2) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { x, y } } = chart;
    const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
    const fill = (range, style) => {
      if (!range) return;
      const x0 = Math.max(x.getPixelForValue(range[0]) - half, left);
      const x1 = Math.min(x.getPixelForValue(range[1]) + half, right);
      ctx.fillStyle = style;
      ctx.fillRect(x0, top, Math.max(x1 - x0, 2), bottom - top);
    };
    ctx.save();
    if (opts && opts.highlight) fill(labelRange(labels, opts.highlight[0], opts.highlight[1]), token('--highlight'));
    NBER_RECESSIONS.forEach(([s, e]) => fill(labelRange(labels, s, e), token('--recession')));
    ctx.restore();
  },
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.reference) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    const py = y.getPixelForValue(opts.reference.value);
    if (py < top || py > bottom) return;
    ctx.save();
    ctx.strokeStyle = token('--ink-2');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
};

// Picks a "nice" year spacing so the x-axis shows at most maxLabels labels.
function yearTickStep(labels, maxLabels) {
  if (!labels.length) return 1;
  const span = parseInt(labels[labels.length - 1].slice(0, 4), 10) - parseInt(labels[0].slice(0, 4), 10) + 1;
  return [1, 2, 5, 10, 20, 25].find(st => span / st <= maxLabels) || 50;
}

// ─── MODULE CHART ────────────────────────────────────────
// obs: [{date, value}], display: { unit, decimals, showSign, mode }
// opts: { bars, highlight: [start, end], reference: {value, label}, quarterly, maxLabels }
function makeModuleChart(canvasId, obs, display, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();

  const series = token('--series');
  const surface = token('--surface');
  const grid = token('--grid');
  const axis = token('--axis');
  const labels = obs.map(d => d.date);
  const values = obs.map(d => d.value);
  const isChange = display.mode && display.mode !== 'Level';
  const fmt = v => formatDisplayValue(v, display);
  const tickFmt = v => formatDisplayValue(v, Object.assign({}, display, { tick: true, decimals: Math.min(display.decimals, 2) }));

  const narrow = window.innerWidth < 700;
  const maxLabels = (opts.maxLabels || 10) / (narrow ? 2 : 1);
  const step = yearTickStep(labels, maxLabels);
  const shortSpan = labels.length > 1 &&
    (Date.parse(labels[labels.length - 1]) - Date.parse(labels[0])) < 2.5 * 365 * 86400000;

  const dataset = opts.bars ? {
    type: 'bar',
    data: values,
    backgroundColor: series,
    borderRadius: 2,
    borderSkipped: 'start',
    barPercentage: 0.85,
    categoryPercentage: 0.9
  } : {
    type: 'line',
    data: values,
    borderColor: series,
    borderWidth: 2,
    backgroundColor: 'transparent',
    fill: false,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: series,
    pointHoverBorderColor: surface,
    pointHoverBorderWidth: 2,
    tension: 0.15
  };

  charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: opts.bars ? 'bar' : 'line',
    plugins: [moduleBandsPlugin],
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      // Optional click-to-pick (full-history chart): reports the date under the pointer.
      onClick: opts.onPick ? (evt, els, chart) => {
        const i = Math.round(chart.scales.x.getValueForPixel(evt.x));
        const label = labels[Math.max(0, Math.min(labels.length - 1, i))];
        // Defer: the pick re-renders (destroys) this chart, which must not
        // happen while Chart.js is still dispatching the click.
        if (label) setTimeout(() => opts.onPick(label), 0);
      } : undefined,
      onHover: opts.onPick ? (evt, els, chart) => { chart.canvas.style.cursor = 'pointer'; } : undefined,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        moduleBands: { highlight: opts.highlight || null, reference: opts.reference || null },
        tooltip: {
          backgroundColor: token('--surface-raised'),
          borderColor: token('--border-strong'),
          borderWidth: 1,
          titleColor: token('--ink-2'),
          bodyColor: token('--ink'),
          padding: 10,
          displayColors: false,
          titleFont: { size: 11, weight: '400' },
          bodyFont: { size: 14, weight: '600' },
          callbacks: {
            title: items => formatObsDate(items[0].label, 'long', opts.quarterly),
            label: item => fmt(item.parsed.y)
          }
        }
      },
      scales: {
        x: {
          border: { color: axis },
          grid: { display: false },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback(value, index) {
              const label = labels[index];
              if (!label) return null;
              if (shortSpan) {
                // Short windows: label quarter starts instead of years.
                const m = parseInt(label.slice(5, 7), 10);
                const prev = index > 0 ? labels[index - 1].slice(0, 7) : null;
                if (prev === label.slice(0, 7) || (m - 1) % 3 !== 0 || label.slice(8, 10) !== '01') return null;
                if (narrow && (m - 1) % 6 !== 0) return null;
                return formatObsDate(label.slice(0, 8) + '01', 'short', opts.quarterly);
              }
              const year = label.slice(0, 4);
              if (index > 0 && labels[index - 1].slice(0, 4) === year) return null;
              if (index === 0 && label.slice(5, 7) > '03') return null;
              return parseInt(year, 10) % step === 0 ? year : null;
            }
          }
        },
        y: {
          type: opts.log ? 'logarithmic' : 'linear',
          position: 'right',
          grace: opts.log ? 0 : '6%',
          // Keep the reference line (e.g. 2% target) inside the plot.
          suggestedMin: opts.reference ? opts.reference.value : undefined,
          suggestedMax: opts.reference ? opts.reference.value : undefined,
          border: { display: false },
          grid: {
            color: ctx => (isChange && ctx.tick && ctx.tick.value === 0) ? axis : grid
          },
          ticks: { maxTicksLimit: 5, callback: v => tickFmt(v) }
        }
      }
    }
  });
}
