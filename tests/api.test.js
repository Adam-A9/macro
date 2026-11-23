// ─── Tests for js/api.js utilities ───────────────────────
// These test pure functions that have no DOM or network dependencies.

describe('module view modes', () => {
  const monthly = [
    { date: '2025-01-01', value: 100 },
    { date: '2025-02-01', value: 102 },
    { date: '2026-01-01', value: 105 },
    { date: '2026-02-01', value: 108.12 }
  ];

  it('labels quarterly series QoQ and others MoM', () => {
    assert.deepEqual(seriesModes({ freq: 'MoM' }), ['Level', 'MoM', 'YoY']);
    assert.deepEqual(seriesModes({ freq: 'QoQ' }), ['Level', 'QoQ', 'YoY']);
  });

  it('measures % series in percentage points and others in percent', () => {
    assert.equal(changeKind({ unit: '%' }), 'pp');
    assert.equal(changeKind({ unit: 'B$' }), 'pct');
    assert.equal(changeKind({ unit: 'K', change: 'diff' }), 'diff');
  });

  it('Level mode returns observations unchanged', () => {
    const d = buildModeSeries(monthly, { unit: '', decimals: 2 }, 'Level');
    assert.equal(d.mode, 'Level');
    assert.equal(d.obs.length, 4);
    assert.isFalse(d.showSign);
  });

  it('MoM mode computes percent change from the prior observation', () => {
    const d = buildModeSeries(monthly, { unit: '', decimals: 2 }, 'MoM');
    assert.equal(d.unit, '%');
    // Jan 2025 → Feb 2025 and Jan 2026 → Feb 2026; the 11-month gap is skipped.
    assert.deepEqual(d.obs.map(o => o.date), ['2025-02-01', '2026-02-01']);
    assert.closeTo(d.obs[0].value, 2, 1e-9);
    assert.closeTo(d.obs[1].value, (108.12 / 105 - 1) * 100, 1e-9);
  });

  it('YoY mode compares against the same month a year earlier', () => {
    const d = buildModeSeries(monthly, { unit: '', decimals: 2 }, 'YoY');
    assert.deepEqual(d.obs.map(o => o.date), ['2026-01-01', '2026-02-01']);
    assert.closeTo(d.obs[0].value, 5, 1e-9);
    assert.closeTo(d.obs[1].value, 6, 1e-9);
  });

  it('YoY for a rate series is a percentage-point difference', () => {
    const rates = [{ date: '2025-03-01', value: 4.0 }, { date: '2026-03-01', value: 4.5 }];
    const d = buildModeSeries(rates, { unit: '%', decimals: 1 }, 'YoY');
    assert.equal(d.unit, ' pp');
    assert.closeTo(d.obs[0].value, 0.5, 1e-9);
  });

  it('diff change kind keeps the series unit (e.g. jobs added)', () => {
    const jobs = [{ date: '2026-01-01', value: 159000 }, { date: '2026-02-01', value: 159150 }];
    const d = buildModeSeries(jobs, { unit: 'K', decimals: 0, change: 'diff' }, 'MoM');
    assert.equal(d.unit, 'K');
    assert.equal(d.obs[0].value, 150);
  });
});

describe('formatObsDate', () => {
  it('formats monthly, quarterly and daily dates', () => {
    assert.equal(formatObsDate('2026-10-01', 'long'), 'Oct 2026');
    assert.equal(formatObsDate('2026-10-01', 'short'), "Oct '26");
    assert.equal(formatObsDate('2026-07-01', 'long', true), 'Q3 2026');
    assert.equal(formatObsDate('2026-11-19', 'short'), 'Nov 19');
  });
});

describe('gaps in source data', () => {
  it('does not compute a MoM change across a missing month', () => {
    const obs = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-04-01', value: 110 },
      { date: '2026-05-01', value: 121 }
    ];
    const d = buildModeSeries(obs, { unit: '', decimals: 2 }, 'MoM');
    assert.deepEqual(d.obs.map(o => o.date), ['2026-05-01']);
    assert.closeTo(d.obs[0].value, 10, 1e-9);
  });
});
