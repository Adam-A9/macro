// ─── Tests for formatting, sector returns and signals ────

describe('formatDisplayValue', () => {
  it('puts $ before the number and scale letters after', () => {
    assert.equal(formatDisplayValue(92.5, { unit: '$', decimals: 2 }), '$92.50');
    assert.equal(formatDisplayValue(23500, { unit: 'B$', decimals: 0 }), '$23,500B');
  });

  it('keeps other units as suffixes', () => {
    assert.equal(formatDisplayValue(4.48, { unit: '%', decimals: 2 }), '4.48%');
    assert.equal(formatDisplayValue(0.25, { unit: ' pp', decimals: 2, showSign: true }), '+0.25 pp');
  });

  it('uses a true minus sign and keeps the sign before $', () => {
    assert.equal(formatDisplayValue(-1.5, { unit: '%', decimals: 1, showSign: true }), '−1.5%');
    assert.equal(formatDisplayValue(-3, { unit: '$', decimals: 0, showSign: true }), '−$3');
  });

  it('shows a dash for missing values', () => {
    assert.equal(formatDisplayValue(null, { unit: '%', decimals: 1 }), '–');
  });
});

describe('signals', () => {
  afterEach(() => { Object.keys(seriesRawData).forEach(k => delete seriesRawData[k]); });

  it('flags the Sahm rule at 0.50', () => {
    seriesRawData.SahmRule = [{ date: '2026-09-01', value: 0.2 }, { date: '2026-10-01', value: 0.53 }];
    const r = SIGNAL_LIBRARY.recession.read();
    assert.equal(r.status, 'critical');
    assert.equal(r.verdict, 'Triggered');
  });

  it('flags an inverted yield curve', () => {
    seriesRawData.Spread = [{ date: '2026-10-01', value: -0.3 }];
    assert.equal(SIGNAL_LIBRARY.curve.read().verdict, 'Inverted');
  });

  it('annualizes the latest quarter of real GDP', () => {
    seriesRawData.RealGDP = [{ date: '2026-04-01', value: 100 }, { date: '2026-07-01', value: 101 }];
    const r = SIGNAL_LIBRARY.growth.read();
    assert.equal(r.value, '+4.1%');
    assert.equal(r.status, 'good');
  });

  it('returns null before data arrives', () => {
    assert.isNull(SIGNAL_LIBRARY.credit.read());
  });
});

describe('glanceChange', () => {
  const mk = (vals, mode, unit) => ({ mode, unit, decimals: 2, showSign: mode !== 'Level',
    obs: vals.map((v, i) => ({ date: '2026-0' + (i + 1) + '-01', value: v })) });

  it('shows percentage points for rates', () => {
    const c = glanceChange(mk([4.2, 4.1], 'Level', '%'), { unit: '%' });
    assert.closeTo(c.value, -0.1, 1e-9);
    assert.equal(c.text, '−0.10 pp');
    assert.equal(c.since, "Jan '26");
  });

  it('shows percent change for compounding levels', () => {
    const c = glanceChange(mk([100, 104], 'Level', ''), { unit: '' });
    assert.equal(c.text, '+4.0%');
  });

  it('shows the recent average for MoM views', () => {
    const c = glanceChange(mk([60, 100, 150, 161], 'MoM', 'K'), { unit: 'K', change: 'diff' });
    assert.isTrue(c.average);
    assert.closeTo(c.value, 137, 1e-9);
    assert.equal(c.since, '3-mo avg');
  });
});

describe('search', () => {
  before(() => buildSearchIndex({
    pages: [
      { file: 'index.html', title: 'Overview', groups: [{ title: 'Inflation', series: ['CorePCE'] }] },
      { file: 'inflation.html', title: 'Inflation', groups: [{ title: 'Consumer Prices', series: ['CorePCE', 'CPI'] }] },
      { file: 'housing.html', title: 'Housing', groups: [{ title: 'Financing', series: ['Mortgage30'] }] }
    ],
    series: {
      CorePCE: { label: 'Core PCE Prices', id: 'PCEPILFE' },
      CPI: { label: 'Consumer Price Index (CPI)', short: 'CPI', id: 'CPIAUCSL' },
      Mortgage30: { label: '30-Year Mortgage Rate', id: 'MORTGAGE30US' }
    }
  }));

  it('matches every word against name, id, group and page', () => {
    assert.deepEqual(searchMatches('mortgage rate').map(r => r.name), ['Mortgage30']);
    assert.deepEqual(searchMatches('pcepilfe').map(r => r.name), ['CorePCE']);
    assert.deepEqual(searchMatches('nothing here'), []);
  });

  it('lists each series once, preferring its section page over the Overview', () => {
    // Simulate being on the Housing page (the test runner is itself index.html).
    const real = window.currentPageFile;
    window.currentPageFile = () => 'housing.html';
    try {
      const r = searchMatches('core pce');
      assert.equal(r.length, 1);
      assert.equal(r[0].page, 'inflation.html');
    } finally { window.currentPageFile = real; }
  });

  it('prefers the current page when the series is on it', () => {
    const real = window.currentPageFile;
    window.currentPageFile = () => 'index.html';
    try { assert.equal(searchMatches('core pce')[0].page, 'index.html'); }
    finally { window.currentPageFile = real; }
  });
});
