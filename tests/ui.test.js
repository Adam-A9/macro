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
    assert.equal(r.verdict, 'Recession signal');
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

describe('gridColumns', () => {
  it('picks the widest column count that fills every row', () => {
    assert.equal(gridColumns(12, 6), 6);
    assert.equal(gridColumns(10, 6), 5);
    assert.equal(gridColumns(8, 6), 4);
    assert.equal(gridColumns(12, 5), 4);
  });

  it('falls back to the fewest empty cells', () => {
    assert.equal(gridColumns(7, 6), 4);   // 4+3: one gap
    assert.equal(gridColumns(2, 1), 2);   // never fewer than 2
  });
});

describe('status placement', () => {
  afterEach(() => {
    Object.keys(seriesRawData).forEach(k => delete seriesRawData[k]);
    delete window.LAYOUT;
  });

  it('puts the Sahm verdict on Unemployment when the Sahm rule has no tile', () => {
    window.LAYOUT = [{ title: 'Jobs', series: ['Unemployment', 'Payrolls'] }];
    seriesRawData.SahmRule = [{ date: '2026-10-01', value: 0.1 }];
    assert.equal(statusFor('Unemployment').verdict, 'No recession signal');
    assert.isNull(statusFor('Payrolls'));
  });

  it('keeps it on the Sahm rule tile when that tile exists', () => {
    window.LAYOUT = [{ title: 'Jobs', series: ['Unemployment', 'SahmRule'] }];
    seriesRawData.SahmRule = [{ date: '2026-10-01', value: 0.1 }];
    assert.isNull(statusFor('Unemployment'));
    assert.equal(statusFor('SahmRule').status, 'good');
  });
});
