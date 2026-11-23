// ─── Tests for js/calendar.js ────────────────────────────

const ET = { date: '2026-11-23', time: '12:00' };

function ev(over) {
  return Object.assign({
    date: '2026-11-25', time: '08:30', release: 'Gross Domestic Product', agency: 'BEA',
    impact: 'high', label: 'Real GDP, second estimate', note: 'q/q annualized', series: 'A191RL1Q225SBEA',
    unit: '%', decimals: 1, sign: false, period: 'Q3 2026', status: 'upcoming', prior: 3.4, actual: null
  }, over);
}

describe('calendar formatting', () => {
  it('formats times in 12-hour Eastern', () => {
    assert.equal(formatCalTime('08:30'), '8:30 am');
    assert.equal(formatCalTime('14:00'), '2:00 pm');
    assert.equal(formatCalTime('12:00'), '12:00 pm');
    assert.equal(formatCalTime(''), '');
  });

  it('formats dates without timezone drift', () => {
    assert.equal(formatCalDate('2026-12-01'), 'Tue, Dec 1');
  });

  it('labels today, tomorrow and yesterday', () => {
    assert.equal(dayHeading('2026-11-23', '2026-11-23'), 'Today · Mon, Nov 23');
    assert.equal(dayHeading('2026-11-24', '2026-11-23'), 'Tomorrow · Tue, Nov 24');
    assert.equal(dayHeading('2026-11-22', '2026-11-23'), 'Yesterday · Sun, Nov 22');
    assert.equal(dayHeading('2026-11-25', '2026-11-23'), 'Wed, Nov 25');
  });

  it('reads Eastern time regardless of the viewer\'s timezone', () => {
    const et = easternNow(new Date('2026-11-24T03:30:00Z'));   // 10:30 pm on Nov 23 in New York
    assert.deepEqual(et, { date: '2026-11-23', time: '22:30' });
  });
});

describe('calendar values', () => {
  it('formats numbers with the row\'s unit, decimals and sign', () => {
    assert.equal(calendarValue(ev({ prior: 3.4 }), 'prior'), '3.4%');
    assert.equal(calendarValue(ev({ unit: 'K', decimals: 0, sign: true, prior: 165 }), 'prior'), '+165K');
    assert.equal(calendarValue(ev({ unit: 'B$', decimals: 1, sign: true, prior: -105 }), 'prior'), '−$105.0B');
  });

  it('prefers prebuilt text (Fed target range)', () => {
    assert.equal(calendarValue(ev({ prior_text: '3.75–4.00%' }), 'prior'), '3.75–4.00%');
  });

  it('returns null when a value is unknown', () => {
    assert.isNull(calendarValue(ev({ actual: null }), 'actual'));
  });
});

describe('calendarStatus', () => {
  it('keeps released and pending rows as they are', () => {
    assert.equal(calendarStatus(ev({ status: 'released' }), ET), 'released');
    assert.equal(calendarStatus(ev({ status: 'pending' }), ET), 'pending');
  });

  it('turns an upcoming row into pending once its release time passes', () => {
    assert.equal(calendarStatus(ev({ date: '2026-11-23', time: '08:30' }), ET), 'pending');
    assert.equal(calendarStatus(ev({ date: '2026-11-23', time: '14:00' }), ET), 'upcoming');
    assert.equal(calendarStatus(ev({ date: '2026-11-25' }), ET), 'upcoming');
  });
});

describe('renderCalendarHtml', () => {
  const events = [
    ev({ date: '2026-11-17', label: 'Retail sales', status: 'released', prior: 0.8, actual: 0.2, sign: true, period: 'Oct 2026' }),
    ev({ date: '2026-11-19', label: 'Initial jobless claims', status: 'released', unit: 'K', decimals: 0, prior: 202, actual: 203, impact: 'medium' }),
    ev({ date: '2026-11-25' }),
    ev({ date: '2026-12-03', label: 'Initial jobless claims', unit: 'K', decimals: 0, prior: null, impact: 'medium' }),
    ev({ date: '2026-11-23', time: '08:30', label: 'Durable goods orders', status: 'upcoming', impact: 'medium' })
  ];
  const html = tab => {
    const div = document.createElement('div');
    div.innerHTML = renderCalendarHtml(events, tab, ET);
    return div;
  };

  it('upcoming tab shows future and awaiting rows, grouped by day in order', () => {
    const div = html('upcoming');
    const days = [...div.querySelectorAll('.cal-day-title')].map(h => h.textContent);
    assert.deepEqual(days, ['Today · Mon, Nov 23', 'Wed, Nov 25', 'Thu, Dec 3']);
    assert.include(div.textContent, 'Awaiting data');
    assert.notInclude(div.textContent, 'Retail sales');
  });

  it('past tab shows released rows, most recent day first, with actuals', () => {
    const div = html('past');
    const days = [...div.querySelectorAll('.cal-day-title')].map(h => h.textContent);
    assert.deepEqual(days, ['Thu, Nov 19', 'Tue, Nov 17']);
    assert.equal(div.querySelector('.cal-actual').textContent, '203K');
  });

  it('never invents an estimate: unknown values show a dash', () => {
    const div = html('upcoming');
    const dec3 = [...div.querySelectorAll('.cal-day')].find(d => d.querySelector('.cal-day-title').textContent.includes('Dec 3'));
    const claims = dec3.querySelector('.cal-row');
    assert.include(claims.querySelector('.cal-num').textContent, '–');
    assert.notInclude(div.textContent.toLowerCase(), 'estimate:');
  });

  it('marks high-impact releases and shows period, note and agency', () => {
    const div = html('upcoming');
    const gdp = [...div.querySelectorAll('.cal-row')].find(r => r.textContent.includes('Real GDP'));
    assert.isTrue(gdp.classList.contains('cal-high'));
    assert.include(gdp.querySelector('.cal-sub').textContent, 'Q3 2026 · q/q annualized · BEA');
  });

  it('shows an empty state per tab', () => {
    assert.include(renderCalendarHtml([], 'past', ET), 'No releases in the past week');
    assert.include(renderCalendarHtml([], 'upcoming', ET), 'No scheduled releases');
  });

  it('beyond two weeks shows only high-impact releases until expanded', () => {
    const far = events.concat([
      ev({ date: '2026-12-09', time: '14:00', label: 'Fed funds target range', impact: 'high' }),
      ev({ date: '2026-12-16', label: 'Industrial production', impact: 'low' })]);
    const short = renderCalendarHtml(far, 'upcoming', ET, false);
    assert.include(short, 'Fed funds target range');
    assert.notInclude(short, 'Industrial production');
    assert.include(short, '(1 more)');
    const full = renderCalendarHtml(far, 'upcoming', ET, true);
    assert.include(full, 'Industrial production');
    assert.notInclude(full, 'more)');
  });

  it('leaves the actual blank for releases that are still ahead', () => {
    const div = html('upcoming');
    const gdp = [...div.querySelectorAll('.cal-row')].find(r => r.textContent.includes('Real GDP'));
    assert.equal(gdp.querySelectorAll('.cal-num')[1].textContent, '');
  });
});
