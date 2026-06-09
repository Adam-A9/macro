function detailParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('source'),
    id: params.get('id'),
    label: params.get('label') || params.get('id') || 'Economic chart',
    unit: params.get('unit') || '',
    decimals: Number(params.get('decimals') || 2),
    interval: params.get('interval') || 'MoM',
    sample: params.get('sample') || '',
    color: params.get('color') || '#3b82f6'
  };
}

function detailDisplaySeries(obs, cfg) {
  if (cfg.interval === 'YoY') {
    return {
      obs: calculateYoYObservations(obs),
      unit: '%',
      decimals: 2
    };
  }
  return {
    obs: cfg.sample === 'monthly' ? sampleMonthlyObservations(obs) : obs,
    unit: cfg.unit,
    decimals: cfg.decimals
  };
}

async function loadFullHistoryChart() {
  const cfg = detailParams();
  const state = document.getElementById('chart-state');
  const title = document.getElementById('series-title');
  const id = document.getElementById('series-id');
  const interval = document.getElementById('series-interval');
  const range = document.getElementById('series-range');
  const value = document.getElementById('series-value');

  title.textContent = cfg.label;
  document.title = cfg.label + ' | MACRO';
  id.textContent = (cfg.source === 'fred' ? 'FRED ' : 'MARKET ') + cfg.id;
  interval.textContent = cfg.interval + ' observations';
  document.documentElement.style.setProperty('--accent', cfg.color);

  try {
    const raw = cfg.source === 'fred'
      ? await fetchFREDHistory(cfg.id)
      : await fetchMarketHistory(cfg.id);
    const display = detailDisplaySeries(raw, cfg);
    if (display.obs.length < 2) throw new Error('Not enough observations returned');

    const first = display.obs[0];
    const latest = display.obs[display.obs.length - 1];
    range.textContent = first.date + ' to ' + latest.date + ' | ' +
      display.obs.length.toLocaleString() + ' points';
    value.textContent = latest.value.toLocaleString(undefined, {
      maximumFractionDigits: display.decimals
    }) + display.unit;

    makeModalChart(
      'history-chart',
      display.obs.map(d => d.date),
      display.obs.map(d => d.value),
      cfg.color,
      display.unit
    );
    modalChart.options.scales.x.ticks.maxTicksLimit = window.innerWidth < 700 ? 4 : 10;
    modalChart.update('none');
    state.style.display = 'none';
  } catch (error) {
    state.classList.add('error');
    state.textContent = 'Unable to load full history: ' + error.message;
  }
}

window.addEventListener('DOMContentLoaded', loadFullHistoryChart);
