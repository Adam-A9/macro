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
const NBER_RECESSIONS = [
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

// Recession shading that works with any date labels (matches by range,
// not by exact label), used by the module charts.
const recessionRangePlugin = {
  id: 'recessionRange',
  beforeDraw(chart) {
    const labels = chart.data.labels || [];
    if (!labels.length) return;
    const { ctx, chartArea: { left, right, top, bottom }, scales: { x } } = chart;
    ctx.save();
    ctx.fillStyle = 'rgba(216,234,245,0.07)';
    NBER_RECESSIONS.forEach(([start, end]) => {
      const i0 = labels.findIndex(l => l >= start);
      let i1 = -1;
      for (let i = labels.length - 1; i >= 0; i--) { if (labels[i] <= end) { i1 = i; break; } }
      if (i0 < 0 || i1 < i0) return;
      // Extend half a period each side so short recessions stay visible.
      const half = labels.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 0;
      const x0 = Math.max(x.getPixelForValue(i0) - half, left);
      const x1 = Math.min(x.getPixelForValue(i1) + half, right);
      ctx.fillRect(x0, top, Math.max(x1 - x0, 2), bottom - top);
    });
    ctx.restore();
  }
};

// ─── MODULE CHART (one per dashboard row) ────────────────
// obs: [{date, value}], display: { unit, decimals, showSign }, avg: number|null
function makeModuleChart(canvasId, obs, display, avg) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();

  const color  = '#3b82f6';
  const labels = obs.map(d => d.date);
  const fmt = v => {
    const sign = display.showSign && v > 0 ? '+' : '';
    return sign + Number(v).toLocaleString(undefined, { maximumFractionDigits: display.decimals }) + display.unit;
  };

  const datasets = [{
    data: obs.map(d => d.value),
    borderColor: color,
    borderWidth: 1.6,
    backgroundColor: 'transparent',
    fill: false,
    pointRadius: 0,
    pointHoverRadius: 4,
    pointHoverBackgroundColor: color,
    pointHoverBorderColor: '#080c10',
    tension: 0.2
  }];
  if (avg != null) {
    datasets.push({
      data: obs.map(() => avg),
      borderColor: 'rgba(216,234,245,0.45)',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false
    });
  }

  charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    plugins: [recessionRangePlugin],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1117',
          borderColor: 'rgba(216,234,245,0.3)',
          borderWidth: 1,
          titleColor: '#d8eaf5',
          bodyColor: '#e8edf2',
          padding: 10,
          displayColors: false,
          filter: item => item.datasetIndex === 0,
          titleFont: { family: "'Space Mono', monospace", size: 10 },
          bodyFont:  { family: "'DM Mono', monospace", size: 14, weight: '700' },
          callbacks: {
            title: items => formatObsDate(items[0].label, 'long'),
            label: item => ' ' + fmt(item.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30,45,61,0.6)' },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            // One tick per year (first observation of each year).
            callback(value, index) {
              const label = labels[index];
              if (!label) return null;
              if (index > 0 && labels[index - 1].slice(0, 4) === label.slice(0, 4)) return null;
              // Skip a partial first year so its label doesn't crowd the next one.
              if (index === 0 && label.slice(5, 7) > '03') return null;
              const year = label.slice(0, 4);
              if (window.innerWidth < 700 && parseInt(year, 10) % 2) return null;
              return year;
            }
          }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(30,45,61,0.6)' },
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
