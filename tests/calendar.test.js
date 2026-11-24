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

  it('marks high-impact releases and shows the release frequency underneath', () => {
    const div = html('upcoming');
    const gdp = [...div.querySelectorAll('.cal-row')].find(r => r.textContent.includes('Real GDP'));
    assert.isTrue(gdp.classList.contains('cal-high'));
    assert.equal(gdp.querySelector('.cal-sub').textContent, 'Quarterly');
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

describe('renderNextUpHtml', () => {
  const cal = {
    events: [
      ev({ date: '2026-11-17', label: 'Retail sales', status: 'released' }),
      ev({ date: '2026-12-10', label: 'CPI', prior: 0.4, sign: true }),
      ev({ date: '2026-11-24', time: '09:00', label: 'Case-Shiller home prices', impact: 'low', prior: 2.1, sign: true, period: 'Sep 2026', note: 'y/y' }),
      ev({ date: '2026-11-25', label: 'Real GDP, second estimate' }),
      ev({ date: '2026-11-25', time: '10:00', label: 'New home sales', impact: 'low', unit: 'K', decimals: 0, prior: 676 }),
      ev({ date: '2026-12-01', time: '10:00', label: 'Job openings', impact: 'medium' }),
      ev({ date: '2026-12-04', label: 'Nonfarm payrolls' }),
      ev({ date: '2026-12-09', time: '14:00', label: 'Fed funds target range', series: 'DFEDTARU', prior_text: '3.75–4.00%' }),
      ev({ date: '2026-11-23', time: '08:30', label: 'Durable goods orders' })
    ],
    next_fomc: { date: '2027-01-27', time: '14:00', label: 'Fed rate decision', current: '3.75–4.00%' }
  };
  const rows = c => {
    const div = document.createElement('div');
    div.innerHTML = renderNextUpHtml(c || cal, ET);
    return [...div.querySelectorAll('.next-row:not(.next-head)')];
  };

  it('shows four rows: the three soonest releases plus the next Fed decision', () => {
    const names = rows().map(r => r.querySelector('.next-name').textContent);
    assert.deepEqual(names, ['Durable goods orders', 'Case-Shiller home prices', 'Real GDP, second estimate',
      'Fed rate decision']);
  });

  it('always includes the next Fed decision with the current range', () => {
    const fed = rows()[3];
    assert.equal(fed.querySelector('.next-name').textContent, 'Fed rate decision');
    assert.include(fed.querySelector('.next-when').textContent, 'Wed, Jan 27 · 2:00 pm');
    assert.include(fed.textContent, 'in 65 days');
    assert.include(fed.querySelector('.next-prev').textContent, '3.75–4.00%');
  });

  it('puts a near Fed decision in date order among the releases', () => {
    const near = Object.assign({}, cal, { next_fomc: { date: '2026-11-24', time: '14:00', current: '3.75–4.00%' } });
    const names = rows(near).map(r => r.querySelector('.next-name').textContent);
    assert.equal(names[2], 'Fed rate decision');          // after Case-Shiller (9:00 am) the same day
  });

  it('shows period, previous value, awaiting data, and links to the calendar', () => {
    const r = rows();
    assert.isNull(r[0].querySelector('.next-actual'));               // no Actual column in Next up
    assert.include(r[0].querySelector('.next-sub').textContent, 'awaiting data');
    assert.include(r[1].querySelector('.next-when').textContent, 'Tomorrow · 9:00 am');
    assert.equal(r[1].querySelector('.next-sub').textContent, 'Monthly');
    assert.include(r[1].querySelector('.next-prev').textContent, '+2.1%');
    r.forEach(x => assert.equal(x.getAttribute('href'), '#calendar'));
  });
});

describe('calendarTone', () => {
  it('lower is better for unemployment and claims', () => {
    assert.equal(calendarTone(ev({ good: 'down', prior: 4.2, actual: 4.1 })), 'good');
    assert.equal(calendarTone(ev({ good: 'down', prior: 191, actual: 203 })), 'bad');
  });

  it('higher is better for payrolls and retail sales', () => {
    assert.equal(calendarTone(ev({ good: 'up', prior: 60, actual: 165 })), 'good');
    assert.equal(calendarTone(ev({ good: 'up', prior: 0.8, actual: 0.2 })), 'bad');
  });

  it('monthly inflation is better closer to 0.2% a month', () => {
    assert.equal(calendarTone(ev({ good: { target: 0.2 }, prior: 0.4, actual: 0.3 })), 'good');
    assert.equal(calendarTone(ev({ good: { target: 0.2 }, prior: 0.2, actual: 0.5 })), 'bad');
  });

  it('neutral with no direction, no actual, or no change', () => {
    assert.equal(calendarTone(ev({ good: null, prior: 1, actual: 2 })), 'neutral');
    assert.equal(calendarTone(ev({ good: 'up', prior: 1, actual: null })), 'neutral');
    assert.equal(calendarTone(ev({ good: 'up', prior: 1.1, actual: 1.1 })), 'neutral');
  });

  it('colors the actual in the full calendar', () => {
    const html = renderCalendarHtml([ev({ date: '2026-11-17', label: 'Retail sales', status: 'released',
      good: 'up', prior: 0.8, actual: 0.2, sign: true })], 'past', ET, false);
    assert.include(html, 'cal-actual tone-bad');
  });
});

describe('renderRecentHtml', () => {
  const cal = { events: [
    ev({ date: '2026-11-17', time: '08:30', label: 'Retail sales', status: 'released', good: 'up', prior: 0.8, actual: 0.2, sign: true }),
    ev({ date: '2026-11-19', time: '08:30', label: 'Initial jobless claims', status: 'released', good: 'down',
         unit: 'K', decimals: 0, prior: 202, actual: 203 }),
    ev({ date: '2026-11-25', label: 'Real GDP, second estimate' })
  ] };
  const rows = () => {
    const div = document.createElement('div');
    div.innerHTML = renderRecentHtml(cal, ET);
    return [...div.querySelectorAll('.next-row:not(.next-head)')];
  };

  it('lists released rows newest first, skipping upcoming ones', () => {
    assert.deepEqual(rows().map(r => r.querySelector('.next-name').textContent), ['Initial jobless claims', 'Retail sales']);
  });

  it('shows previous and actual in their own columns, with a colored arrow', () => {
    const claims = rows()[0];
    assert.equal(claims.querySelector('.next-prev').textContent, '202K');
    assert.equal(claims.querySelector('.next-actual').textContent, '203K');
    const arrow = claims.querySelector('.next-arrow span');
    assert.equal(arrow.textContent, '▲');
    assert.equal(arrow.className, 'arrow-bad');          // claims rising is bad
  });

  it('has one header row with Previous and Actual', () => {
    const div = document.createElement('div');
    div.innerHTML = renderRecentHtml(cal, ET);
    const heads = div.querySelectorAll('.next-head');
    assert.equal(heads.length, 1);
    assert.include(heads[0].textContent, 'Previous');
    assert.include(heads[0].textContent, 'Actual');
  });
});

describe('releaseFrequency', () => {
  it('is the gap between previous and actual: weekly, monthly or quarterly', () => {
    assert.equal(releaseFrequency({ period: 'Week ending Nov 14' }), 'Weekly');
    assert.equal(releaseFrequency({ period: 'Oct 2026' }), 'Monthly');
    assert.equal(releaseFrequency({ period: 'Q3 2026' }), 'Quarterly');
    assert.equal(releaseFrequency({ period: 'Rate decision' }), '');
  });

  it('past-week strip shows at most four rows', () => {
    const many = { events: [] };
    for (let d = 10; d <= 19; d++) many.events.push(ev({ date: '2026-11-' + d, status: 'released', label: 'R' + d, prior: 1, actual: 2 }));
    const div = document.createElement('div');
    div.innerHTML = renderRecentHtml(many, ET);
    assert.equal(div.querySelectorAll('.next-row:not(.next-head)').length, 4);
  });
});
