// ─── CHART.JS DEFAULTS ───────────────────────────────────
Chart.defaults.color       = '#d8eaf5';
Chart.defaults.font.family = "'Space Mono', monospace";
Chart.defaults.font.size   = 10;

// ─── LINE CHART ──────────────────────────────────────────
function makeLineChart(canvasId, labels, data, color, fill = true) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (charts[canvasId]) charts[canvasId].destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, color + '33');
  gradient.addColorStop(1, color + '00');

  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        backgroundColor: fill ? gradient : 'transparent',
        fill,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#080c10',
        pointHoverBorderWidth: 2,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#0d1117',
          borderColor: color,
          borderWidth: 1,
          titleColor: '#d8eaf5',
          bodyColor: '#e8edf2',
          padding: 10,
          displayColors: false,
          titleFont: { family: "'Space Mono', monospace", size: 10 },
          bodyFont:  { family: "'DM Mono', monospace",   size: 15, weight: '700' },
          callbacks: {
            title: items => items[0].label,
            label: item  => ' ' + Number(item.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 })
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30,45,61,0.6)', drawBorder: false },
          ticks: { maxTicksLimit: 6, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(30,45,61,0.6)', drawBorder: false },
          ticks: { maxTicksLimit: 5 },
          position: 'right'
        }
      }
    }
  });
}

// ─── NBER RECESSION PERIODS ─────────────────────────────
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

// Chart.js plugin that draws recession shading bands
const recessionPlugin = {
  id: 'recessionShading',
  beforeDraw(chart) {
    const meta = chart.options.plugins.recessionShading;
    if (!meta || !meta.periods || !meta.periods.length) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { x } } = chart;
    ctx.save();
    ctx.fillStyle = 'rgba(255,59,92,0.08)';
    meta.periods.forEach(([start, end]) => {
      const x0 = x.getPixelForValue(start);
      const x1 = x.getPixelForValue(end);
      if (x1 < left || x0 > right) return;
      const clampL = Math.max(x0, left);
      const clampR = Math.min(x1, right);
      ctx.fillRect(clampL, top, clampR - clampL, bottom - top);
    });
    ctx.restore();
  }
};

// Index range [i0, i1] of labels falling inside [start, end], or null.
function labelRange(labels, start, end) {
  const i0 = labels.findIndex(l => l >= start);
  let i1 = -1;
  for (let i = labels.length - 1; i >= 0; i--) { if (labels[i] <= end) { i1 = i; break; } }
  return (i0 < 0 || i1 < i0) ? null : [i0, i1];
}

// Shades NBER recessions and, optionally, a highlighted window
// (options.plugins.moduleBands.highlight = [startDate, endDate]).
const moduleBandsPlugin = {
  id: 'moduleBands',
  beforeDatasetsDraw(chart, args, opts) {
    const labels = chart.data.labels || [];
    if (labels.length < 2) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { x } } = chart;
    // Half a period each side so short recessions stay visible.
    const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
    const fill = (range, style) => {
      if (!range) return;
      const x0 = Math.max(x.getPixelForValue(range[0]) - half, left);
      const x1 = Math.min(x.getPixelForValue(range[1]) + half, right);
      ctx.fillStyle = style;
      ctx.fillRect(x0, top, Math.max(x1 - x0, 2), bottom - top);
    };
    ctx.save();
    if (opts && opts.highlight) fill(labelRange(labels, opts.highlight[0], opts.highlight[1]), 'rgba(59,130,246,0.10)');
    NBER_RECESSIONS.forEach(([s, e]) => fill(labelRange(labels, s, e), 'rgba(216,234,245,0.08)'));
    ctx.restore();
  }
};

// Picks a "nice" year spacing so the x-axis shows roughly 6-10 labels.
function yearTickStep(labels, maxLabels) {
  if (!labels.length) return 1;
  const span = parseInt(labels[labels.length - 1].slice(0, 4), 10) - parseInt(labels[0].slice(0, 4), 10) + 1;
  const steps = [1, 2, 5, 10, 20, 25];
  return steps.find(st => span / st <= maxLabels) || 50;
}

// ─── MODULE CHART (one per dashboard row) ────────────────
// obs: [{date, value}], display: { unit, decimals, showSign, mode }
// opts: { bars: bool, highlight: [start, end], quarterly: bool, maxLabels: number }
function makeModuleChart(canvasId, obs, display, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();

  const color  = '#3b82f6';
  const labels = obs.map(d => d.date);
  const values = obs.map(d => d.value);
  const isChange = display.mode !== 'Level';
  const fmt = v => {
    const sign = display.showSign && v > 0 ? '+' : '';
    return sign + Number(v).toLocaleString(undefined, { maximumFractionDigits: display.decimals }) + display.unit;
  };

  const narrow = window.innerWidth < 700;
  const maxLabels = (opts.maxLabels || 10) / (narrow ? 2 : 1);
  const step = yearTickStep(labels, maxLabels);
  const shortSpan = labels.length && (Date.parse(labels[labels.length - 1]) - Date.parse(labels[0])) < 2.5 * 365 * 86400000;

  const dataset = opts.bars ? {
    type: 'bar',
    data: values,
    backgroundColor: values.map(v => v >= 0 ? color : 'rgba(216,234,245,0.45)'),
    borderWidth: 0,
    barPercentage: 0.8,
    categoryPercentage: 0.9
  } : {
    type: 'line',
    data: values,
    borderColor: color,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    fill: false,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: color,
    pointHoverBorderColor: '#080c10',
    tension: 0.15
  };

  charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: opts.bars ? 'bar' : 'line',
    plugins: [moduleBandsPlugin],
    data: { labels, datasets: [dataset] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        moduleBands: { highlight: opts.highlight || null },
        tooltip: {
          backgroundColor: '#0d1117',
          borderColor: 'rgba(216,234,245,0.3)',
          borderWidth: 1,
          titleColor: '#d8eaf5',
          bodyColor: '#e8edf2',
          padding: 10,
          displayColors: false,
          titleFont: { family: "'Space Mono', monospace", size: 10 },
          bodyFont:  { family: "'DM Mono', monospace", size: 14, weight: '700' },
          callbacks: {
            title: items => formatObsDate(items[0].label, 'long', opts.quarterly),
            label: item => ' ' + fmt(item.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30,45,61,0.5)', offset: false },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback(value, index) {
              const label = labels[index];
              if (!label) return null;
              if (shortSpan) {
                // Short windows: label quarters (Jan/Apr/Jul/Oct) instead of years.
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
          position: 'right',
          grid: {
            color: ctx => (isChange && ctx.tick && ctx.tick.value === 0) ? 'rgba(216,234,245,0.35)' : 'rgba(30,45,61,0.5)'
          },
          ticks: { maxTicksLimit: 6, callback: v => fmt(v) }
        }
      }
    }
  });
}

// ─── MODAL CHART ────────────────────────────────────────
let modalChart = null;
function makeModalChart(canvasId, labels, data, color, unit) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (modalChart) modalChart.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, color + '44');
  gradient.addColorStop(1, color + '00');

  // Filter recession periods that overlap the data range
  const firstDate = labels[0], lastDate = labels[labels.length - 1];
  const overlapping = NBER_RECESSIONS.filter(([s, e]) => s <= lastDate && e >= firstDate);

  modalChart = new Chart(ctx, {
    type: 'line',
    plugins: [recessionPlugin],
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#080c10',
        pointHoverBorderWidth: 2,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        recessionShading: { periods: overlapping },
        tooltip: {
          enabled: true,
          backgroundColor: '#0d1117',
          borderColor: color,
          borderWidth: 1,
          titleColor: '#d8eaf5',
          bodyColor: '#e8edf2',
          padding: 12,
          displayColors: false,
          titleFont: { family: "'Space Mono', monospace", size: 11 },
          bodyFont:  { family: "'DM Mono', monospace",   size: 18, weight: '700' },
          callbacks: {
            title: items => items[0].label,
            label: item  => ' ' + Number(item.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 }) + (unit || '')
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30,45,61,0.6)', drawBorder: false },
          ticks: { maxTicksLimit: 10, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(30,45,61,0.6)', drawBorder: false },
          ticks: { maxTicksLimit: 8 },
          position: 'right'
        }
      }
    }
  });
}

// ─── SPARKLINE ───────────────────────────────────────────
function makeSparkline(canvasId, data, color) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (sparklines[canvasId]) sparklines[canvasId].destroy();

  sparklines[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(() => ''),
      datasets: [{
        data: data.map(d => d.value),
        borderColor: color,
        borderWidth: 1.5,
        backgroundColor: 'transparent',
        fill: false,
        pointRadius: 0,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#0d1117',
          borderColor: color,
          borderWidth: 1,
          titleColor: '#d8eaf5',
          bodyColor: '#e8edf2',
          padding: 8,
          displayColors: false,
          titleFont: { family: "'Space Mono', monospace", size: 9 },
          bodyFont:  { family: "'DM Mono', monospace",   size: 12, weight: '700' },
          callbacks: {
            title: items => data[items[0].dataIndex]?.date ?? '',
            label: item  => ' ' + Number(item.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 })
          }
        }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}
