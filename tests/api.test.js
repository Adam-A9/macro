// ─── Tests for js/api.js utilities ───────────────────────
// These test pure functions that have no DOM or network dependencies.

describe('parseFREDJson', () => {
  it('returns observations in chronological order (reversed)', () => {
    const json = {
      observations: [
        { date: '2024-03-01', value: '3.5' },
        { date: '2024-02-01', value: '3.4' },
        { date: '2024-01-01', value: '3.2' },
      ]
    };
    const result = parseFREDJson(json);
    assert.equal(result.length, 3);
    assert.equal(result[0].date, '2024-01-01');
    assert.equal(result[2].date, '2024-03-01');
  });

  it('filters out missing values (dots and empty strings)', () => {
    const json = {
      observations: [
        { date: '2024-03-01', value: '3.5' },
        { date: '2024-02-01', value: '.'   },
        { date: '2024-01-01', value: ''    },
      ]
    };
    const result = parseFREDJson(json);
    assert.equal(result.length, 1);
    assert.equal(result[0].value, 3.5);
  });

  it('parses values as floats', () => {
    const json = { observations: [{ date: '2024-01-01', value: '123.456' }] };
    const result = parseFREDJson(json);
    assert.equal(typeof result[0].value, 'number');
    assert.equal(result[0].value, 123.456);
  });

  it('throws when observations key is missing', () => {
    assert.throws(() => parseFREDJson({}), /No observations/);
    assert.throws(() => parseFREDJson({ error: 'bad' }), /No observations/);
  });

  it('returns empty array when all values are missing', () => {
    const json = {
      observations: [
        { date: '2024-01-01', value: '.' },
        { date: '2024-02-01', value: '' },
      ]
    };
    assert.equal(parseFREDJson(json).length, 0);
  });
});

describe('filterToTwoYears', () => {
  it('filters observations older than two years', () => {
    const year = new Date().getFullYear();
    const obs = [
      { date: (year - 3) + '-06-01', value: 1 },
      { date: (year - 2) + '-01-01', value: 2 }, // exactly on cutoff — included
      { date: (year - 1) + '-06-01', value: 3 },
      { date: year       + '-01-01', value: 4 },
    ];
    const result = filterToTwoYears(obs);
    assert.equal(result.length, 3);
    assert.equal(result[0].value, 2);
  });

  it('returns all when everything is within two years', () => {
    const year = new Date().getFullYear();
    const obs = [
      { date: (year - 1) + '-01-01', value: 1 },
      { date:  year      + '-01-01', value: 2 },
    ];
    assert.equal(filterToTwoYears(obs).length, 2);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(filterToTwoYears([]), []);
  });
});

describe('observation transforms', () => {
  it('keeps the latest observation from each month', () => {
    const result = sampleMonthlyObservations([
      { date: '2026-04-01', value: 1 },
      { date: '2026-04-30', value: 2 },
      { date: '2026-05-01', value: 3 },
      { date: '2026-05-29', value: 4 }
    ]);
    assert.deepEqual(result, [
      { date: '2026-04-30', value: 2 },
      { date: '2026-05-29', value: 4 }
    ]);
  });

  it('calculates annual changes against the matching prior period', () => {
    const result = calculateYoYObservations([
      { date: '2025-05-01', value: 100 },
      { date: '2026-05-01', value: 110 }
    ]);
    assert.equal(result.length, 1);
    assert.closeTo(result[0].value, 10, 0.0001);
  });
});

describe('sleep', () => {
  it('resolves after approximately the specified delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 45, 'should wait at least ~50ms');
  });
});

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
    assert.equal(d.obs.length, 3);
    assert.closeTo(d.obs[0].value, 2, 1e-9);
    assert.closeTo(d.obs[2].value, (108.12 / 105 - 1) * 100, 1e-9);
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

describe('historyStats', () => {
  // 11 years of monthly values 0..131
  const obs = [];
  for (let i = 0; i < 132; i++) {
    const y = 2015 + Math.floor(i / 12), m = (i % 12) + 1;
    obs.push({ date: y + '-' + String(m).padStart(2, '0') + '-01', value: i });
  }
  const s = historyStats(obs);

  it('reports the value one year earlier', () => {
    assert.equal(s.latest, 131);
    assert.equal(s.yearAgo, 119);
  });

  it('averages the trailing 5 and 10 years', () => {
    assert.closeTo(s.avg5, (72 + 131) / 2, 1e-9);   // last 60 points: 72..131
    assert.closeTo(s.avg10, (12 + 131) / 2, 1e-9);  // last 120 points: 12..131
  });

  it('reports the 10-year range and percentile', () => {
    assert.equal(s.low10, 12);
    assert.equal(s.high10, 131);
    assert.equal(s.percentile, 100);
  });
});

describe('mergeLatestObservation', () => {
  it('replaces the current month with the latest raw reading', () => {
    const monthly = [{ date: '2026-09-01', value: 4.1 }, { date: '2026-10-01', value: 4.2 }];
    const merged = mergeLatestObservation(monthly, { date: '2026-10-17', value: 4.3 });
    assert.deepEqual(merged, [{ date: '2026-09-01', value: 4.1 }, { date: '2026-10-17', value: 4.3 }]);
  });

  it('appends when the latest reading starts a new month', () => {
    const monthly = [{ date: '2026-10-01', value: 4.2 }];
    const merged = mergeLatestObservation(monthly, { date: '2026-11-19', value: 5.04 });
    assert.equal(merged.length, 2);
    assert.equal(merged[1].value, 5.04);
  });
});

describe('formatObsDate', () => {
  it('formats monthly, quarterly and daily dates', () => {
    assert.equal(formatObsDate('2026-10-01', 'long'), 'Oct 2026');
    assert.equal(formatObsDate('2026-10-01', 'short'), "Oct '26");
    assert.equal(formatObsDate('2026-07-01', 'long', true), 'Q3 2026');
    assert.equal(formatObsDate('2026-11-19', 'short'), '11/19');
  });
});
