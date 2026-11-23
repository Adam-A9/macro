// Full-screen chart for one series (opened from a module's "Expand").
function detailParams() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get('target');
  return {
    source: params.get('source') || 'fred',
    id: params.get('id'),
    label: params.get('label') || params.get('id') || 'Economic chart',
    unit: params.get('unit') || '',
    decimals: Number(params.get('decimals') || 2),
    interval: params.get('interval') || 'Level',
    freq: params.get('freq') || '',
    change: params.get('change') || '',
    sample: params.get('sample') || '',
    reference: target != null ? { value: Number(target), label: params.get('targetLabel') || 'Target' } : null
  };
}

async function loadFullHistoryChart() {
  const cfg = detailParams();
  const state = document.getElementById('chart-state');
  document.getElementById('series-title').textContent = cfg.label;
  document.title = cfg.label + ' · Macro';
  document.getElementById('series-id').textContent =
    (cfg.source === 'market' ? 'Yahoo Finance · ' : 'FRED · ') + cfg.id;
  document.getElementById('series-interval').textContent =
    (cfg.interval === 'Level' ? 'Level' : cfg.interval + ' change') +
    ' · shaded: recessions' + (cfg.reference ? ' · dashed: ' + cfg.reference.label : '');

  try {
    const raw = await fetchSeries(cfg);
    const display = buildModeSeries(raw, cfg, cfg.interval);
    if (display.obs.length < 2) throw new Error('Not enough observations returned');
    const first = display.obs[0];
    const latest = display.obs[display.obs.length - 1];
    document.getElementById('series-range').textContent =
      formatObsDate(first.date, 'long', cfg.freq === 'QoQ') + ' – ' +
      formatObsDate(latest.date, 'long', cfg.freq === 'QoQ');
    document.getElementById('series-value').textContent = formatDisplayValue(latest.value, display);
    makeModuleChart('history-chart', display.obs, display, {
      quarterly: cfg.freq === 'QoQ',
      bars: false,
      reference: cfg.reference,
      maxLabels: 14
    });
    state.hidden = true;
  } catch (error) {
    state.textContent = 'Unable to load full history: ' + error.message;
  }
}

window.addEventListener('DOMContentLoaded', loadFullHistoryChart);
