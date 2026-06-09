// ─── Tests for js/ui.js helpers ──────────────────────────
// Tests pure utility functions. DOM-dependent functions (updateCard, fetchAll)
// require a full browser environment and are tested via manual integration testing.

describe('gradientColor', () => {
  it('returns a red-ish color for t=0 when higherIsGood=true (worst)', () => {
    const color = gradientColor(0, true);
    assert.ok(color.startsWith('rgba('), 'should return rgba string');
    assert.ok(color.includes(',40,60,'), 'should be in red range');
  });

  it('returns a green-ish color for t=1 when higherIsGood=true (best)', () => {
    const color = gradientColor(1, true);
    assert.ok(color.startsWith('rgba(0,'), 'should start with 0 red channel for green');
  });

  it('inverts scale when higherIsGood=false', () => {
    const goodHigh  = gradientColor(1, true);
    const badHigh   = gradientColor(1, false);
    const goodLow   = gradientColor(0, true);
    const badLow    = gradientColor(0, false);
    // When higherIsGood=false, t=1 (high) should be red; t=0 (low) should be green
    assert.equal(goodHigh, badLow,  'high-when-good = low-when-bad');
    assert.equal(goodLow,  badHigh, 'low-when-good = high-when-bad');
  });

  it('returns mid-range color for t=0.5', () => {
    const color = gradientColor(0.5, true);
    assert.ok(color.startsWith('rgba('), 'should return rgba string');
  });
});

describe('cellColor', () => {
  // Mock HIGHER_IS_GOOD (normally defined per-page)
  before(() => { window._HIGHER_IS_GOOD_BAK = window.HIGHER_IS_GOOD; window.HIGHER_IS_GOOD = ['GDP']; });
  after(()  => { window.HIGHER_IS_GOOD = window._HIGHER_IS_GOOD_BAK; });

  it('returns green for positive Spread value', () => {
    assert.equal(cellColor(0.5, 'Spread', false), 'rgba(0,190,90,0.38)');
  });

  it('returns red for negative Spread value', () => {
    assert.equal(cellColor(-0.5, 'Spread', false), 'rgba(220,40,60,0.38)');
  });

  it('returns green for positive change when higherIsGood (isChange=true, GDP)', () => {
    assert.equal(cellColor(1, 'GDP', true), 'rgba(0,190,90,0.38)');
  });

  it('returns red for negative change when higherIsGood (isChange=true, GDP)', () => {
    assert.equal(cellColor(-1, 'GDP', true), 'rgba(220,40,60,0.38)');
  });

  it('returns red for positive change when !higherIsGood (isChange=true, CPI)', () => {
    assert.equal(cellColor(1, 'CPI', true), 'rgba(220,40,60,0.38)');
  });

  it('returns green for negative change when !higherIsGood (isChange=true, CPI)', () => {
    assert.equal(cellColor(-1, 'CPI', true), 'rgba(0,190,90,0.38)');
  });

  it('returns null for non-change, non-Spread values', () => {
    assert.equal(cellColor(5, 'CPI', false), null);
  });
});

describe('display interval helpers', () => {
  beforeEach(() => { window.DUAL_ROW = []; });

  it('uses monthly samples for rates configured as MoM', () => {
    const cfg = { freq: 'MoM', sample: 'monthly', unit: '%', decimals: 2 };
    assert.equal(getDisplayInterval('Yield10Y', cfg), 'MoM');

    const display = buildDisplaySeries('Yield10Y', [
      { date: '2026-05-01', value: 4.40 },
      { date: '2026-05-29', value: 4.42 },
      { date: '2026-06-01', value: 4.45 },
      { date: '2026-06-08', value: 4.48 }
    ], cfg);
    assert.equal(display.interval, 'MoM');
    assert.equal(display.unit, '%');
    assert.equal(display.obs.length, 2);
    assert.deepEqual(display.obs.map(d => d.date), ['2026-05-29', '2026-06-08']);
    assert.equal(formatDisplayValue(display.obs[1].value, display), '4.48%');
  });

  it('uses YoY display data for dual-row series so charts and tables match', () => {
    window.DUAL_ROW = ['CPI'];
    const cfg = { freq: 'MoM', unit: '', decimals: 2 };
    const obs = [
      { date: '2025-04-01', value: 100 },
      { date: '2025-05-01', value: 110 },
      { date: '2026-04-01', value: 105 },
      { date: '2026-05-01', value: 121 }
    ];

    const display = buildDisplaySeries('CPI', obs, cfg);
    assert.equal(display.interval, 'YoY');
    assert.equal(display.unit, '%');
    assert.deepEqual(display.obs.map(d => d.date), ['2026-04-01', '2026-05-01']);
    assert.closeTo(display.obs[0].value, 5, 0.0001);
    assert.closeTo(display.obs[1].value, 10, 0.0001);
    assert.equal(formatDisplayValue(display.obs[1].value, display), '+10%');
  });
});
