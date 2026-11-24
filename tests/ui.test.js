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

describe('zoomWindow', () => {
  // Monthly observations, Jan 1990 – Dec 2025
  const obs = [];
  for (let y = 1990; y <= 2025; y++) for (let m = 1; m <= 12; m++) {
    obs.push({ date: y + '-' + String(m).padStart(2, '0') + '-01', value: y + m / 12 });
  }

  it('defaults to the latest N years', () => {
    const w = zoomWindow(obs, 5, null);
    assert.isFalse(w.focused);
    assert.equal(w.obs[0].date, '2021-01-01');
    assert.equal(w.obs[w.obs.length - 1].date, '2025-12-01');
  });

  it('centers the same window length on a clicked date', () => {
    const w = zoomWindow(obs, 5, '2008-06-01');
    assert.isTrue(w.focused);
    assert.equal(w.obs[0].date.slice(0, 7), '2005-12');
    assert.equal(w.obs[w.obs.length - 1].date.slice(0, 7), '2010-11');
    assert.equal(w.obs.length, zoomWindow(obs, 5, null).obs.length);   // same length as the default view
  });

  it('shifts the window to stay inside the data at either end', () => {
    const late = zoomWindow(obs, 10, '2024-01-01');
    assert.equal(late.obs[late.obs.length - 1].date, '2025-12-01');
    assert.equal(late.obs[0].date.slice(0, 4), '2015');
    const early = zoomWindow(obs, 10, '1991-01-01');
    assert.equal(early.obs[0].date, '1990-01-01');
    assert.equal(early.obs[early.obs.length - 1].date.slice(0, 4), '1999');
  });
});

describe('moveQuality', () => {
  const series = (vals, mode, unit) => ({ mode: mode || 'Level', unit: unit || '%', decimals: 1,
    obs: vals.map((v, i) => ({ date: '2025-' + String(i + 1).padStart(2, '0') + '-01', value: v })) });
  const base = [4.0, 4.1, 4.0, 4.1, 4.0, 4.1, 4.0];

  it('down is green when lower is better (unemployment)', () => {
    const m = moveQuality(series(base.concat([3.8])), { good: 'down', unit: '%' });
    assert.equal(m.dir, 'down'); assert.equal(m.tone, 'good'); assert.equal(m.word, 'better');
  });

  it('up is red when lower is better, green when higher is better', () => {
    assert.equal(moveQuality(series(base.concat([4.3])), { good: 'down', unit: '%' }).tone, 'bad');
    assert.equal(moveQuality(series(base.concat([4.3])), { good: 'up', unit: '%' }).tone, 'good');
  });

  it('compares 12-mo changes with the previous 12-mo change, not their sign', () => {
    // Still positive growth, but slower than before: worse.
    const m = moveQuality(series([2.4, 2.3, 2.4, 2.3, 2.2, 2.07], 'YoY'), { good: 'up' });
    assert.equal(m.dir, 'down'); assert.equal(m.tone, 'bad');
  });

  it('inflation is better when it moves toward the target', () => {
    assert.equal(moveQuality(series([3, 3.1, 3, 3.1, 3.72, 4.08], 'YoY'), { good: { target: 2 } }).tone, 'bad');
    assert.equal(moveQuality(series([3, 3.1, 3, 3.1, 3.6, 3.0], 'YoY'), { good: { target: 2 } }).tone, 'good');
  });

  it('colors even small moves; gray only when unchanged or with no good direction', () => {
    assert.equal(moveQuality(series(base.concat([4.01])), { good: 'down', unit: '%' }).tone, 'bad');
    const same = moveQuality(series([4.0, 4.0]), { good: 'down', unit: '%' });
    assert.equal(same.dir, 'flat'); assert.equal(same.tone, 'neutral');
    const fed = moveQuality(series([3.75, 3.88]), { unit: '%' });
    assert.equal(fed.dir, 'up'); assert.equal(fed.tone, 'neutral');
  });

  it('returns the previous reading for the footer', () => {
    const m = moveQuality(series([3.72, 4.08], 'YoY'), { good: { target: 2 } });
    assert.equal(m.prev.value, 3.72);
  });
});

describe('monthYear', () => {
  it('formats dates as mm/yy for the tile sparkline range', () => {
    assert.equal(monthYear('2024-10-01'), '10/24');
    assert.equal(monthYear('2026-11-14'), '11/26');
  });
});
