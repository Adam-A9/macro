// Full-screen chart for one series (opened from a module's "Expand").
// URL: chart.html?series=<name>&view=<Level|MoM|QoQ|YoY>
async function loadFullHistoryChart() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('series');
  const state = document.getElementById('chart-state');

  try {
    const data = await loadMacroData();
    const cfg = data.series[name];
    if (!cfg) throw new Error('unknown series "' + name + '"');
    const view = seriesModes(cfg).includes(params.get('view')) ? params.get('view') : (cfg.mode || 'Level');
    const quarterly = cfg.freq === 'QoQ';
    const reference = cfg.target && cfg.target[view] != null
      ? { value: cfg.target[view], label: cfg.target.label || 'Target' } : null;

    document.getElementById('series-title').textContent = cfg.label;
    document.title = cfg.label + ' · Macro';
    document.getElementById('series-id').textContent =
      (cfg.source === 'market' ? 'Yahoo Finance · ' : 'FRED · ') + cfg.id;
    document.getElementById('series-interval').textContent =
      (view === 'Level' ? 'Level' : view + ' change') +
      ' · shaded: recessions' + (reference ? ' · dashed: ' + reference.label : '');

    const display = buildModeSeries(cfg.obs, cfg, view);
    if (display.obs.length < 2) throw new Error('not enough observations');
    const first = display.obs[0];
    const latest = display.obs[display.obs.length - 1];
    document.getElementById('series-range').textContent =
      formatObsDate(first.date, 'long', quarterly) + ' – ' + formatObsDate(latest.date, 'long', quarterly);
    document.getElementById('series-value').textContent = formatDisplayValue(latest.value, display);
    makeModuleChart('history-chart', display.obs, display, {
      quarterly, reference, log: !!cfg.log && view === 'Level', maxLabels: 14, noGrid: true
    });
    state.hidden = true;
  } catch (error) {
    state.textContent = 'Unable to load this chart: ' + error.message;
  }
}

window.addEventListener('DOMContentLoaded', loadFullHistoryChart);
