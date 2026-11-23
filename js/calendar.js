// ─── ECONOMIC CALENDAR ───────────────────────────────────
// Renders the calendar prebuilt by python/calendar_data.py (data/macro.json →
// calendar.events). Every row comes from an official source: FRED's release
// schedule and first-published values, and the Federal Reserve's FOMC calendar.
// There is no consensus-estimate column: no free source permits automated use.

let calendarTab = 'upcoming';
let calendarExpanded = false;
const UPCOMING_DAYS = 14;        // shown before "Show 2 more weeks"

// Today's date and time in US Eastern, where all release times are set.
function easternNow(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now || new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { date: get('year') + '-' + get('month') + '-' + get('day'),
           time: (get('hour') === '24' ? '00' : get('hour')) + ':' + get('minute') };
}

function formatCalDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatCalTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  return (hour % 12 || 12) + ':' + m + ' ' + (hour >= 12 ? 'pm' : 'am');
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function dayHeading(dateStr, today) {
  const diff = daysBetween(today, dateStr);
  const rel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : '';
  return (rel ? rel + ' · ' : '') + formatCalDate(dateStr);
}

// A row's status as of now: an "upcoming" row whose release time has passed
// (the data file is rebuilt hourly) is shown as awaiting data.
function calendarStatus(ev, et) {
  if (ev.status !== 'upcoming') return ev.status;
  return (ev.date < et.date || (ev.date === et.date && ev.time <= et.time)) ? 'pending' : 'upcoming';
}

function calendarValue(ev, which) {
  const text = ev[which + '_text'];
  if (text) return text;
  const v = ev[which];
  if (v == null) return null;
  return formatDisplayValue(v, { unit: ev.unit, decimals: ev.decimals, showSign: ev.sign && v !== 0 });
}

function calendarRowHtml(ev, et) {
  const status = calendarStatus(ev, et);
  const prior = calendarValue(ev, 'prior');
  const actual = calendarValue(ev, 'actual');
  const actualCell = status === 'released' && actual != null
    ? '<span class="cal-value cal-actual">' + escapeHtml(actual) + '</span>'
    : status === 'pending'
      ? '<span class="cal-status" title="Released; FRED usually posts it within hours">Awaiting data</span>'
      : status === 'upcoming' ? '' : '<span class="cal-dash">–</span>';
  const sub = [ev.period, ev.note, ev.agency].filter(Boolean).map(escapeHtml).join(' · ');
  return '<div class="cal-row' + (ev.impact === 'high' ? ' cal-high' : '') + '" role="row">' +
    '<span class="cal-time" role="cell">' + formatCalTime(ev.time) + '</span>' +
    '<span class="cal-event" role="cell"><span class="cal-name">' + escapeHtml(ev.label) + '</span>' +
      '<span class="cal-sub">' + sub + '</span></span>' +
    '<span class="cal-num" role="cell"><span class="cal-num-label">Previous</span>' +
      (prior != null ? '<span class="cal-value">' + escapeHtml(prior) + '</span>' : '<span class="cal-dash">–</span>') + '</span>' +
    '<span class="cal-num" role="cell">' + (actualCell ? '<span class="cal-num-label">Actual</span>' + actualCell : '') + '</span>' +
  '</div>';
}

// Pure: returns the calendar body HTML for a tab. Upcoming shows the next two
// weeks plus later high-impact releases (Fed, CPI, jobs…) unless expanded.
function renderCalendarHtml(events, tab, et, expanded) {
  const horizon = new Date(Date.parse(et.date + 'T00:00:00Z') + UPCOMING_DAYS * 86400000).toISOString().slice(0, 10);
  let hidden = 0;
  const rows = events.filter(ev => {
    const s = calendarStatus(ev, et);
    if (tab === 'past') return s === 'released';
    if (s === 'released') return false;
    // Beyond two weeks, only market-moving releases show until expanded.
    if (!expanded && ev.date > horizon && ev.impact !== 'high') { hidden++; return false; }
    return true;
  });
  if (!rows.length) {
    return '<p class="empty">' + (tab === 'past' ? 'No releases in the past week.' : 'No scheduled releases in the next four weeks.') + '</p>';
  }
  const byDay = new Map();
  rows.forEach(ev => {
    if (!byDay.has(ev.date)) byDay.set(ev.date, []);
    byDay.get(ev.date).push(ev);
  });
  const days = Array.from(byDay.keys()).sort();
  if (tab === 'past') days.reverse();            // most recent first
  const head = '<div class="cal-head" role="row"><span role="columnheader">Time (ET)</span>' +
    '<span role="columnheader">Release</span><span role="columnheader">Previous</span>' +
    '<span role="columnheader">Actual</span></div>';
  const more = hidden
    ? '<button type="button" class="link-btn cal-more" data-more>Show all releases through ' +
      formatCalDate(events[events.length - 1].date) + ' (' + hidden + ' more)</button>' : '';
  return head + days.map(d =>
    '<div class="cal-day" role="rowgroup">' +
      '<h3 class="cal-day-title">' + dayHeading(d, et.date) + '</h3>' +
      byDay.get(d).map(ev => calendarRowHtml(ev, et)).join('') +
    '</div>').join('') + more;
}

function renderCalendar() {
  renderNextUp();
  const host = document.getElementById('calendarBody');
  const cal = (typeof MACRO_DATA !== 'undefined' && MACRO_DATA && MACRO_DATA.calendar) || null;
  if (!host) return;
  if (!cal || !Array.isArray(cal.events)) {
    host.innerHTML = '<p class="empty">The calendar is unavailable right now.</p>';
    return;
  }
  const et = easternNow();
  host.innerHTML = renderCalendarHtml(cal.events, calendarTab, et, calendarExpanded);
  const more = host.querySelector('[data-more]');
  if (more) more.addEventListener('click', () => { calendarExpanded = true; renderCalendar(); });
  document.querySelectorAll('#calendarTabs [data-tab]').forEach(b =>
    b.setAttribute('aria-pressed', b.dataset.tab === calendarTab));
}

function fetchCalendar() {
  const tabs = document.getElementById('calendarTabs');
  if (tabs && !tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      calendarTab = b.dataset.tab;
      renderCalendar();
    }));
  }
  renderCalendar();
}

// ─── NEXT UP (top of the Overview) ───────────────────────
// One line per release: the five soonest, plus the next Fed decision, which
// always appears (even beyond the calendar's window), in date order.
const NEXT_UP_COUNT = 5;

function whenLabel(dateStr, timeStr, et) {
  const diff = daysBetween(et.date, dateStr);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : formatCalDate(dateStr);
  return day + ' · ' + formatCalTime(timeStr);
}

function nextUpRow(o) {
  return '<a class="next-row' + (o.strong ? ' next-strong' : '') + '" href="#calendar">' +
    '<span class="next-when">' + o.when + '</span>' +
    '<span class="next-what"><span class="next-name">' + escapeHtml(o.name) + '</span>' +
      (o.sub ? '<span class="next-sub">' + escapeHtml(o.sub) + '</span>' : '') + '</span>' +
    '<span class="next-value">' + o.value + '</span>' +
  '</a>';
}

function renderNextUpHtml(cal, et) {
  if (!cal || !Array.isArray(cal.events)) return '';
  const items = cal.events
    .filter(ev => ev.series !== 'DFEDTARU' && calendarStatus(ev, et) !== 'released')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .slice(0, NEXT_UP_COUNT)
    .map(ev => {
      const prior = calendarValue(ev, 'prior');
      return {
        key: ev.date + ev.time, strong: ev.impact === 'high',
        when: whenLabel(ev.date, ev.time, et), name: ev.label,
        sub: [ev.period, ev.note].filter(Boolean).join(' · '),
        value: calendarStatus(ev, et) === 'pending' ? '<span class="cal-status">Awaiting data</span>'
          : '<span class="next-label">Prev</span> ' + (prior != null ? escapeHtml(prior) : '–')
      };
    });
  const fed = cal.next_fomc;
  if (fed) {
    const days = daysBetween(et.date, fed.date);
    items.push({
      key: fed.date + fed.time, strong: true,
      when: whenLabel(fed.date, fed.time, et), name: 'Fed rate decision',
      sub: days > 1 ? 'in ' + days + ' days' : days === 1 ? 'tomorrow' : 'today',
      value: fed.current ? '<span class="next-label">Now</span> ' + escapeHtml(fed.current) : ''
    });
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  return items.map(nextUpRow).join('');
}

function renderNextUp() {
  const host = document.getElementById('nextUp');
  const cal = (typeof MACRO_DATA !== 'undefined' && MACRO_DATA && MACRO_DATA.calendar) || null;
  if (!host) return;
  const html = renderNextUpHtml(cal, easternNow());
  host.innerHTML = html || '<p class="empty">No upcoming releases found.</p>';
}
