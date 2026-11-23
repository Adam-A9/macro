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
