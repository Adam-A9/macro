"""Economic calendar data, built from official sources only.

  * Release schedule: FRED release dates, including scheduled future dates.
  * Actual / previous: the values as first published on the release date,
    read from FRED's historical vintages (ALFRED), not today's revised data.
  * Fed decisions: the Federal Reserve's own FOMC calendar page; the target
    range before and after each decision from DFEDTARL / DFEDTARU.

There is no consensus-estimate column: no free source permits automated use.

Called by build_data.py; output goes to data/macro.json under "calendar".
Pure helpers are unit-tested in tests/test_calendar_data.py.
"""
import html
import logging
import re
from datetime import date, datetime, timedelta

log = logging.getLogger("build_data")

DAYS_BACK = 7          # show releases from the past week...
DAYS_AHEAD = 28        # ...and the next four weeks
VINTAGE_GRACE = 3      # FRED sometimes posts a release a day or two late
VINTAGE_LOOKBACK = 120 # days of vintage history kept per series (covers GDP's three estimates)

# ─── RELEASE CATALOG ──────────────────────────────────────────
# Every release id and series below was checked against FRED (release name,
# series membership, units). Times are US Eastern, as published by each agency.
#   transform: pct   = % change vs prior period
#              diff  = change vs prior period (e.g. jobs added)
#              level = the value itself
#              yoy   = % change vs a year earlier
#   scale multiplies the raw FRED value into the display unit.
#   lag   = months between the reference period and the release month, used
#           to label upcoming releases (e.g. CPI out in December covers November).
# Not included: Existing Home Sales and U. Michigan sentiment (licensed data that
# FRED doesn't archive or posts late), ISM PMIs and Conference Board confidence
# (not on FRED).
RELEASES = [
    {"id": 10, "lag": 1, "name": "Consumer Price Index", "agency": "BLS", "time": "08:30", "impact": "high", "rows": [
        {"series": "CPIAUCSL", "label": "CPI", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"},
        {"series": "CPILFESL", "label": "Core CPI", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 46, "lag": 1, "name": "Producer Price Index", "agency": "BLS", "time": "08:30", "impact": "medium", "rows": [
        {"series": "PPIFIS", "label": "PPI (final demand)", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 50, "lag": 1, "name": "Employment Situation", "agency": "BLS", "time": "08:30", "impact": "high", "rows": [
        {"series": "PAYEMS", "label": "Nonfarm payrolls", "transform": "diff", "unit": "K", "decimals": 0, "note": "change"},
        {"series": "UNRATE", "label": "Unemployment rate", "transform": "level", "unit": "%", "decimals": 1},
        {"series": "CES0500000003", "label": "Average hourly earnings", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 180, "name": "Weekly Jobless Claims", "agency": "DOL", "time": "08:30", "impact": "medium", "freq": "W", "rows": [
        {"series": "ICSA", "label": "Initial jobless claims", "transform": "level", "scale": 0.001, "unit": "K", "decimals": 0}]},
    {"id": 192, "lag": 2, "name": "Job Openings (JOLTS)", "agency": "BLS", "time": "10:00", "impact": "medium", "rows": [
        {"series": "JTSJOL", "label": "Job openings", "transform": "level", "scale": 0.001, "unit": "M", "decimals": 2}]},
    {"id": 53, "name": "Gross Domestic Product", "agency": "BEA", "time": "08:30", "impact": "high", "freq": "Q", "rows": [
        {"series": "A191RL1Q225SBEA", "label": "Real GDP", "transform": "level", "unit": "%", "decimals": 1,
         "note": "q/q annualized", "estimates": True}]},
    {"id": 54, "lag": 1, "name": "Personal Income & Outlays", "agency": "BEA", "time": "08:30", "impact": "high", "rows": [
        {"series": "PCEPILFE", "label": "Core PCE prices", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"},
        {"series": "PCEPI", "label": "PCE prices", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 9, "lag": 1, "name": "Retail Sales", "agency": "Census", "time": "08:30", "impact": "high", "rows": [
        {"series": "RSAFS", "label": "Retail sales", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 27, "lag": 1, "name": "Housing Starts", "agency": "Census", "time": "08:30", "impact": "medium", "rows": [
        {"series": "HOUST", "label": "Housing starts", "transform": "level", "scale": 0.001, "unit": "M", "decimals": 2, "note": "annual rate"},
        {"series": "PERMIT", "label": "Building permits", "transform": "level", "scale": 0.001, "unit": "M", "decimals": 2, "note": "annual rate"}]},
    {"id": 97, "lag": 1, "name": "New Home Sales", "agency": "Census", "time": "10:00", "impact": "low", "rows": [
        {"series": "HSN1F", "label": "New home sales", "transform": "level", "unit": "K", "decimals": 0, "note": "annual rate"}]},
    # Release 95 carries two reports: the advance durable-goods report late in
    # the month and the full factory-orders report early in the next month.
    {"id": 95, "lag": 1, "name": "Durable Goods Orders", "agency": "Census", "time": "08:30", "impact": "medium",
     "day_from": 15, "rows": [
        {"series": "DGORDER", "label": "Durable goods orders", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 95, "lag": 2, "name": "Factory Orders", "agency": "Census", "time": "10:00", "impact": "low",
     "day_until": 14, "rows": [
        {"series": "AMTMNO", "label": "Factory orders", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 13, "lag": 1, "name": "Industrial Production", "agency": "Federal Reserve", "time": "09:15", "impact": "low", "rows": [
        {"series": "INDPRO", "label": "Industrial production", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"},
        {"series": "TCU", "label": "Capacity utilization", "transform": "level", "unit": "%", "decimals": 1}]},
    {"id": 51, "lag": 2, "name": "International Trade", "agency": "Census / BEA", "time": "08:30", "impact": "medium", "rows": [
        {"series": "BOPGSTB", "label": "Trade balance", "transform": "level", "scale": 0.001, "unit": "B$", "decimals": 1}]},
    {"id": 229, "lag": 2, "name": "Construction Spending", "agency": "Census", "time": "10:00", "impact": "low", "rows": [
        {"series": "TTLCONS", "label": "Construction spending", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 188, "lag": 1, "name": "Import Prices", "agency": "BLS", "time": "08:30", "impact": "low", "rows": [
        {"series": "IR", "label": "Import prices", "transform": "pct", "unit": "%", "decimals": 1, "note": "m/m"}]},
    {"id": 11, "lag": 1, "name": "Employment Cost Index", "agency": "BLS", "time": "08:30", "impact": "medium", "freq": "Q", "rows": [
        {"series": "ECIALLCIV", "label": "Employment cost index", "transform": "pct", "unit": "%", "decimals": 1, "note": "q/q"}]},
    {"id": 199, "lag": 2, "name": "Case-Shiller Home Prices", "agency": "S&P", "time": "09:00", "impact": "low", "rows": [
        {"series": "CSUSHPINSA", "label": "Case-Shiller home prices", "transform": "yoy", "unit": "%", "decimals": 1, "note": "y/y"}]},
]

FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
# Backup decision dates (second day of each meeting), from the same page.
FOMC_FALLBACK = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16",
    "2026-10-28", "2026-12-09",
    "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15",
    "2027-10-27", "2027-11-17",
]

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]
MONTH_ABBR = [m[:3] for m in MONTHS]


# ─── PURE HELPERS ─────────────────────────────────────────────
def add_months(d, n):
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def next_period(period, freq):
    """The period after `period` (a date) for a series of frequency M, W or Q."""
    if freq == "W":
        return period + timedelta(days=7)
    if freq == "Q":
        return add_months(period, 3)
    return add_months(period, 1)


def expected_period(spec, release_day):
    """The reference period an upcoming release will cover."""
    freq = spec.get("freq", "M")
    if freq == "W":
        # Weekly claims cover the week ending the Saturday before release.
        return release_day - timedelta(days=(release_day.weekday() - 5) % 7 or 7)
    p = add_months(date(release_day.year, release_day.month, 1), -spec.get("lag", 1))
    if freq == "Q":
        p = date(p.year, (p.month - 1) // 3 * 3 + 1, 1)
    return p


def period_label(period, freq):
    """Oct 2026 · Q3 2026 · week ending Nov 21."""
    if freq == "W":
        return "Week ending " + MONTH_ABBR[period.month - 1] + " " + str(period.day)
    if freq == "Q":
        return "Q%d %d" % ((period.month - 1) // 3 + 1, period.year)
    return MONTH_ABBR[period.month - 1] + " " + str(period.year)


def gdp_estimate(period, release_date):
    """BEA publishes three estimates per quarter, ~1, 2 and 3 months after it ends."""
    quarter_end = add_months(period, 3) - timedelta(days=1)
    days = (release_date - quarter_end).days
    if days < 45:
        return "advance estimate"
    if days < 75:
        return "second estimate"
    return "third estimate"


def transform(kind, values, scale=1.0):
    """values: newest first (floats). Returns the displayed number or None."""
    if not values:
        return None
    if kind == "level":
        return values[0] * scale
    if kind == "pct":
        return (values[0] / values[1] - 1) * 100 if len(values) > 1 and values[1] else None
    if kind == "diff":
        return (values[0] - values[1]) * scale if len(values) > 1 else None
    if kind == "yoy":
        return (values[0] / values[12] - 1) * 100 if len(values) > 12 and values[12] else None
    raise ValueError("unknown transform " + kind)


def rounded(x, decimals):
    return None if x is None else round(x, decimals)


def parse_fomc_page(page):
    """Decision dates (last day of each scheduled meeting) from the Fed's
    FOMC calendar page. Skips notation votes and cancelled meetings."""
    text = re.sub(r"<[^>]+>", "|", page)
    text = html.unescape(text)
    text = re.sub(r"\s*\|[\s|]*", "|", text)
    month = r"(January|February|March|April|May|June|July|August|September|October|November|December|" \
            r"[A-Z][a-z]{2}/[A-Z][a-z]{2})"
    out = set()
    for m in re.finditer(r"(\d{4}) FOMC Meetings", text):
        year = int(m.group(1))
        nxt = re.search(r"\d{4} FOMC Meetings|Note:", text[m.end():])
        block = text[m.end(): m.end() + (nxt.start() if nxt else 3000)]
        for mm in re.finditer(month + r"\|(\d{1,2})(?:-(\d{1,2}))?(\*)?(?:\s*\(([^)]*)\))?", block):
            months, d1, d2, _, paren = mm.groups()
            if paren and re.search(r"notation|cancel", paren, re.I):
                continue
            last = int(d2 or d1)
            if "/" in months:
                first_m, second_m = months.split("/")
                name = second_m if d2 and int(d2) < int(d1) else first_m
                mon = MONTH_ABBR.index(name) + 1
            else:
                mon = MONTHS.index(months) + 1
            out.add(date(year, mon, last).isoformat())
    return sorted(out)


def vintage_on_or_after(vintage_dates, d, grace=VINTAGE_GRACE):
    """The FRED vintage that carries a release made on date d (same day, or a
    day or two later when FRED posts late), else None."""
    limit = (date.fromisoformat(d) + timedelta(days=grace)).isoformat()
    for v in vintage_dates:
        if d <= v <= limit:
            return v
    return None


# ─── BUILD ────────────────────────────────────────────────────
class Fred:
    """Small cache around the FRED API so each series is fetched once."""

    def __init__(self, get):
        self.get = get                 # get(path, **params) -> dict
        self._latest, self._vintage_dates = {}, {}

    def release_dates(self, release_id, start):
        data = self.get("release/dates", release_id=release_id, realtime_start=start,
                        realtime_end="9999-12-31", include_release_dates_with_no_data="true",
                        sort_order="asc", limit=1000)
        return [r["date"] for r in data.get("release_dates", [])]

    def latest(self, sid, n=15):
        """Newest-first [(date, value)] in today's data."""
        if sid not in self._latest:
            data = self.get("series/observations", series_id=sid, sort_order="desc", limit=n)
            self._latest[sid] = _pairs(data)
        return self._latest[sid]

    def vintage(self, sid, d, n=15):
        """Newest-first [(date, value)] as the data stood on date d."""
        data = self.get("series/observations", series_id=sid, realtime_start=d, realtime_end=d,
                        sort_order="desc", limit=n)
        return _pairs(data)

    def vintage_dates(self, sid, start):
        key = (sid, start)
        if key not in self._vintage_dates:
            data = self.get("series/vintagedates", series_id=sid, realtime_start=start, limit=10000)
            self._vintage_dates[key] = data.get("vintage_dates", [])
        return self._vintage_dates[key]


def _pairs(data):
    out = []
    for o in data.get("observations", []):
        if o.get("value") in (".", "", None):
            continue
        out.append((date.fromisoformat(o["date"]), float(o["value"])))
    return out


def release_row(fred, spec, row, d, today, now_et):
    """One calendar row: a headline number from a release on date d."""
    freq = spec.get("freq", "M")
    sid, kind, scale = row["series"], row["transform"], row.get("scale", 1.0)
    base = {
        "date": d, "time": spec["time"], "release": spec["name"], "agency": spec["agency"],
        "impact": spec["impact"], "label": row["label"], "note": row.get("note", ""),
        "series": sid, "unit": row["unit"], "decimals": row["decimals"],
        "sign": kind in ("pct", "diff", "yoy") or row["unit"] == "B$",
    }
    release_day = date.fromisoformat(d)
    released_time = datetime.strptime(d + " " + spec["time"], "%Y-%m-%d %H:%M")
    lookback = (today - timedelta(days=VINTAGE_LOOKBACK)).isoformat()

    vintage = None
    if release_day <= today:
        vintage = vintage_on_or_after(fred.vintage_dates(sid, lookback), d)

    if vintage:
        values = fred.vintage(sid, vintage)
        if not values:
            return None
        period = values[0][0]
        nums = [v for _, v in values]
        actual = transform(kind, nums, scale)
        prior = transform(kind, nums[1:], scale)
        if row.get("estimates"):
            est = gdp_estimate(period, release_day)
            base["label"] = row["label"] + ", " + est
            if est != "advance estimate":
                # Previous = this quarter's earlier estimate, from the vintage before.
                earlier = [v for v in fred.vintage_dates(sid, lookback) if v < vintage]
                prev_vals = fred.vintage(sid, earlier[-1]) if earlier else []
                same = [v for p, v in prev_vals if p == period]
                prior = same[0] * scale if same else prior
        base.update(status="released", period=period_label(period, freq),
                    actual=rounded(actual, row["decimals"]), prior=rounded(prior, row["decimals"]))
        return base

    # Not in FRED yet: upcoming, or released but not posted yet.
    latest = fred.latest(sid)
    if not latest:
        return None
    nums = [v for _, v in latest]
    latest_period = latest[0][0]
    period = expected_period(spec, release_day)
    # "Previous" is known only for the next period after the latest published one.
    prior = transform(kind, nums, scale) if period == next_period(latest_period, freq) else None
    if not row.get("estimates") and period <= latest_period:
        return None          # a revision-only date: no new reference period
    if row.get("estimates"):
        est = gdp_estimate(latest_period, release_day)
        if est != "advance estimate" and (release_day - latest_period).days < 200:
            period = latest_period
            prior = latest[0][1] * scale       # the current estimate of the same quarter
        else:
            est = "advance estimate"
            period = next_period(latest_period, freq)
            prior = latest[0][1] * scale       # the previous quarter's latest estimate
        base["label"] = row["label"] + ", " + est
    status = "pending" if now_et >= released_time else "upcoming"
    base.update(status=status, period=period_label(period, freq),
                actual=None, prior=rounded(prior, row["decimals"]))
    return base


def fomc_rows(fred, decision_dates, start, end, now_et):
    upper = dict((p.isoformat(), v) for p, v in fred.latest("DFEDTARU", n=400))
    lower = dict((p.isoformat(), v) for p, v in fred.latest("DFEDTARL", n=400))

    def rng(day):
        u, lo = upper.get(day), lower.get(day)
        return None if u is None or lo is None else "%.2f–%.2f%%" % (lo, u)

    latest_day = max(upper) if upper else None
    rows = []
    for d in decision_dates:
        if not (start <= d <= end):
            continue
        after_day = (date.fromisoformat(d) + timedelta(days=1)).isoformat()
        before = rng(d) or (rng(latest_day) if latest_day and latest_day <= d else None)
        after = rng(after_day)
        decided = now_et >= datetime.strptime(d + " 14:00", "%Y-%m-%d %H:%M")
        rows.append({
            "date": d, "time": "14:00", "release": "FOMC Statement", "agency": "Federal Reserve",
            "impact": "high", "label": "Fed funds target range", "note": "", "series": "DFEDTARU",
            "unit": "", "decimals": 2, "sign": False, "period": "Rate decision",
            "status": "released" if after else ("pending" if decided else "upcoming"),
            "prior_text": before, "actual_text": after, "prior": None, "actual": None,
        })
    return rows


def build_calendar(get, today, now_et, fetch_text=None):
    """get(path, **params) -> FRED JSON; fetch_text(url) -> str (Fed page)."""
    fred = Fred(get)
    start = (today - timedelta(days=DAYS_BACK)).isoformat()
    end = (today + timedelta(days=DAYS_AHEAD)).isoformat()
    rows, problems = [], []

    dates_cache, seen = {}, set()
    for spec in RELEASES:
        try:
            if spec["id"] not in dates_cache:
                dates_cache[spec["id"]] = fred.release_dates(spec["id"], start)
            dates = dates_cache[spec["id"]]
            for d in dates:
                if not (start <= d <= end):
                    continue
                day = int(d[8:10])
                if day < spec.get("day_from", 1) or day > spec.get("day_until", 31):
                    continue
                for row in spec["rows"]:
                    r = release_row(fred, spec, row, d, today, now_et)
                    key = r and (r["series"], r["period"], r["label"])
                    if r and key not in seen:
                        seen.add(key)
                        rows.append(r)
        except Exception as e:  # one bad release shouldn't sink the calendar
            problems.append("%s: %s" % (spec["name"], e))
            log.warning("  calendar %s failed: %s", spec["name"], e)

    fomc_source = "federalreserve.gov"
    decisions = []
    if fetch_text:
        try:
            decisions = parse_fomc_page(fetch_text(FOMC_URL))
        except Exception as e:
            problems.append("FOMC calendar: %s" % e)
    if not decisions:
        decisions, fomc_source = FOMC_FALLBACK, "built-in list"
    try:
        rows += fomc_rows(fred, decisions, start, end, now_et)
    except Exception as e:
        problems.append("FOMC rows: %s" % e)

    rows.sort(key=lambda r: (r["date"], r["time"], {"high": 0, "medium": 1, "low": 2}[r["impact"]]))
    return {
        "events": rows, "start": start, "end": end,
        "fomc_source": fomc_source, "problems": problems,
    }
