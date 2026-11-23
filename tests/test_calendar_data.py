"""Unit tests for python/calendar_data.py, using a simulated FRED API.
Run: python -m unittest discover tests"""
import os
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))
import calendar_data as cd  # noqa: E402

SPEC = {r["name"]: r for r in cd.RELEASES}


def obs(pairs):
    """[('2026-10-01', 1.0), ...] newest first -> FRED observations payload."""
    return {"observations": [{"date": d, "value": str(v)} for d, v in pairs]}


class FakeFred:
    """Answers the handful of FRED endpoints the calendar uses."""

    def __init__(self, release_dates=None, latest=None, vintages=None, vintage_dates=None):
        self.release_dates = release_dates or {}   # release_id -> [dates]
        self.latest = latest or {}                 # sid -> newest-first pairs
        self.vintages = vintages or {}             # (sid, date) -> newest-first pairs
        self.vintage_dates = vintage_dates or {}   # sid -> [dates]
        self.calls = []

    def __call__(self, path, **p):
        self.calls.append((path, p))
        if path == "release/dates":
            return {"release_dates": [{"date": d} for d in self.release_dates.get(p["release_id"], [])]}
        if path == "series/vintagedates":
            return {"vintage_dates": [d for d in self.vintage_dates.get(p["series_id"], []) if d >= p["realtime_start"]]}
        if path == "series/observations":
            sid = p["series_id"]
            if "realtime_start" in p:
                return obs(self.vintages.get((sid, p["realtime_start"]), []))
            return obs(self.latest.get(sid, [])[: p.get("limit", 1000)])
        raise AssertionError("unexpected FRED call " + path)


TODAY = date(2026, 11, 23)
NOW = datetime(2026, 11, 23, 12, 0)


class Periods(unittest.TestCase):
    def test_expected_period_uses_publication_lag(self):
        self.assertEqual(cd.expected_period(SPEC["Consumer Price Index"], date(2026, 12, 10)), date(2026, 11, 1))
        self.assertEqual(cd.expected_period(SPEC["Job Openings (JOLTS)"], date(2026, 12, 1)), date(2026, 10, 1))
        self.assertEqual(cd.expected_period(SPEC["Case-Shiller Home Prices"], date(2026, 11, 24)), date(2026, 9, 1))

    def test_weekly_claims_cover_the_week_ending_the_saturday_before(self):
        claims = SPEC["Weekly Jobless Claims"]
        self.assertEqual(cd.expected_period(claims, date(2026, 11, 25)), date(2026, 11, 21))   # Wednesday
        self.assertEqual(cd.expected_period(claims, date(2026, 12, 3)), date(2026, 11, 28))    # Thursday

    def test_quarterly_release_maps_to_its_quarter(self):
        self.assertEqual(cd.expected_period(SPEC["Employment Cost Index"], date(2027, 1, 29)), date(2026, 10, 1))

    def test_labels(self):
        self.assertEqual(cd.period_label(date(2026, 10, 1), "M"), "Oct 2026")
        self.assertEqual(cd.period_label(date(2026, 7, 1), "Q"), "Q3 2026")
        self.assertEqual(cd.period_label(date(2026, 11, 21), "W"), "Week ending Nov 21")

    def test_gdp_estimate_numbering(self):
        q3 = date(2026, 7, 1)
        self.assertEqual(cd.gdp_estimate(q3, date(2026, 10, 29)), "advance estimate")
        self.assertEqual(cd.gdp_estimate(q3, date(2026, 11, 25)), "second estimate")
        self.assertEqual(cd.gdp_estimate(q3, date(2026, 12, 23)), "third estimate")


class Transforms(unittest.TestCase):
    def test_kinds(self):
        self.assertAlmostEqual(cd.transform("pct", [101.0, 100.0]), 1.0)
        self.assertAlmostEqual(cd.transform("diff", [159293.0, 159128.0]), 165.0)
        self.assertAlmostEqual(cd.transform("level", [203000.0], 0.001), 203.0)
        vals = [110.0] + [105.0] * 11 + [100.0]
        self.assertAlmostEqual(cd.transform("yoy", vals), 10.0)

    def test_missing_history(self):
        self.assertIsNone(cd.transform("pct", [101.0]))
        self.assertIsNone(cd.transform("yoy", [1.0] * 5))


FOMC_HTML = """
<h4>2027 FOMC Meetings</h4><div>January</div><div>26-27</div><div>March</div><div>16-17</div>
<div>June</div><div>8-9</div><div>October</div><div>26-27</div><p>Note: tentative</p>
<h4>2026 FOMC Meetings</h4>
<div class="fomc-meeting__month"><strong>December</strong></div><div class="fomc-meeting__date">8-9*</div>
<h4>2025 FOMC Meetings</h4>
<div><strong>August</strong></div><div>22 (notation vote)</div>
<div><strong>Apr/May</strong></div><div>30-1</div>
"""


class Fomc(unittest.TestCase):
    def test_parses_both_page_layouts(self):
        dates = cd.parse_fomc_page(FOMC_HTML)
        for d in ("2027-01-27", "2027-03-17", "2027-06-09", "2027-10-27", "2026-12-09"):
            self.assertIn(d, dates)

    def test_skips_notation_votes_and_handles_cross_month_meetings(self):
        dates = cd.parse_fomc_page(FOMC_HTML)
        self.assertNotIn("2025-08-22", dates)
        self.assertIn("2025-05-01", dates)

    def test_rows_show_range_before_and_after(self):
        fred = FakeFred(latest={
            "DFEDTARU": [("2026-12-10", 3.75), ("2026-12-09", 4.0)],
            "DFEDTARL": [("2026-12-10", 3.5), ("2026-12-09", 3.75)]})
        rows = cd.fomc_rows(cd.Fred(fred), ["2026-12-09"], "2026-12-01", "2026-12-31",
                            datetime(2026, 12, 10, 9, 0))
        self.assertEqual(rows[0]["prior_text"], "3.75–4.00%")
        self.assertEqual(rows[0]["actual_text"], "3.50–3.75%")
        self.assertEqual(rows[0]["status"], "released")

    def test_upcoming_meeting_shows_current_range(self):
        fred = FakeFred(latest={"DFEDTARU": [("2026-11-23", 4.0)], "DFEDTARL": [("2026-11-23", 3.75)]})
        row = cd.fomc_rows(cd.Fred(fred), ["2026-12-09"], "2026-11-16", "2026-12-21", NOW)[0]
        self.assertEqual((row["status"], row["prior_text"], row["actual_text"]), ("upcoming", "3.75–4.00%", None))


class NextFomc(unittest.TestCase):
    def test_next_meeting_even_beyond_the_window_with_current_range(self):
        fred = cd.Fred(FakeFred(latest={"DFEDTARU": [("2026-11-23", 4.0)], "DFEDTARL": [("2026-11-23", 3.75)]}))
        nxt = cd.next_fomc(fred, ["2026-10-28", "2026-12-09", "2027-01-27"], datetime(2026, 12, 9, 15, 0))
        self.assertEqual(nxt["date"], "2027-01-27")          # Dec 9 decision already announced at 2 pm
        self.assertEqual(nxt["current"], "3.75–4.00%")

    def test_decision_day_before_2pm_is_still_next(self):
        fred = cd.Fred(FakeFred(latest={"DFEDTARU": [("2026-12-09", 4.0)], "DFEDTARL": [("2026-12-09", 3.75)]}))
        self.assertEqual(cd.next_fomc(fred, ["2026-12-09"], datetime(2026, 12, 9, 10, 0))["date"], "2026-12-09")

    def test_none_when_schedule_runs_out(self):
        self.assertIsNone(cd.next_fomc(cd.Fred(FakeFred()), ["2026-01-28"], NOW))


class Rows(unittest.TestCase):
    def jobs(self, **kw):
        spec = SPEC["Employment Situation"]
        row = spec["rows"][0]           # payrolls, 'diff'
        return cd.release_row(cd.Fred(FakeFred(**kw)), spec, row, kw.pop("_d", "2026-11-06"), TODAY, NOW)

    def test_released_row_uses_first_print_from_the_vintage(self):
        r = self.jobs(
            vintage_dates={"PAYEMS": ["2026-10-02", "2026-11-06"]},
            vintages={("PAYEMS", "2026-11-06"): [("2026-10-01", 159293), ("2026-09-01", 159128), ("2026-08-01", 159068)]})
        self.assertEqual((r["status"], r["period"], r["actual"], r["prior"]), ("released", "Oct 2026", 165, 60))
        self.assertEqual(r["good"], "up")            # colors the actual on the site

    def test_vintage_posted_a_day_late_still_counts(self):
        r = self.jobs(
            vintage_dates={"PAYEMS": ["2026-11-07"]},
            vintages={("PAYEMS", "2026-11-07"): [("2026-10-01", 159293), ("2026-09-01", 159128), ("2026-08-01", 159068)]})
        self.assertEqual(r["status"], "released")

    def test_released_but_not_yet_on_fred_is_pending(self):
        spec = SPEC["Retail Sales"]
        # The October report is out (8:30 am) but FRED still only has September.
        fred = cd.Fred(FakeFred(vintage_dates={"RSAFS": ["2026-10-15"]},
                                latest={"RSAFS": [("2026-09-01", 101.0), ("2026-08-01", 100.0)]}))
        r = cd.release_row(fred, spec, spec["rows"][0], "2026-11-23", TODAY, datetime(2026, 11, 23, 9, 0))
        self.assertEqual((r["status"], r["period"], r["actual"]), ("pending", "Oct 2026", None))
        self.assertAlmostEqual(r["prior"], 1.0)

    def test_upcoming_previous_only_when_it_is_the_next_period(self):
        spec = SPEC["Weekly Jobless Claims"]
        fred = cd.Fred(FakeFred(latest={"ICSA": [("2026-11-14", 203000), ("2026-11-07", 202000)]}))
        nxt = cd.release_row(fred, spec, spec["rows"][0], "2026-11-25", TODAY, NOW)
        later = cd.release_row(fred, spec, spec["rows"][0], "2026-12-03", TODAY, NOW)
        self.assertEqual((nxt["period"], nxt["prior"]), ("Week ending Nov 21", 203))
        self.assertEqual((later["period"], later["prior"]), ("Week ending Nov 28", None))

    def test_revision_only_date_is_skipped(self):
        spec = SPEC["Industrial Production"]
        fred = cd.Fred(FakeFred(latest={"INDPRO": [("2026-10-01", 103.4), ("2026-09-01", 103.8)]}))
        self.assertIsNone(cd.release_row(fred, spec, spec["rows"][0], "2026-11-24", TODAY, NOW))

    def test_gdp_second_estimate_compares_with_the_advance_estimate(self):
        spec = SPEC["Gross Domestic Product"]
        fred = cd.Fred(FakeFred(
            vintage_dates={"A191RL1Q225SBEA": ["2026-10-29", "2026-11-25"]},
            vintages={("A191RL1Q225SBEA", "2026-11-25"): [("2026-07-01", 3.6), ("2026-04-01", 2.1)],
                      ("A191RL1Q225SBEA", "2026-10-29"): [("2026-07-01", 3.4), ("2026-04-01", 2.1)]}))
        r = cd.release_row(fred, spec, spec["rows"][0], "2026-11-25", date(2026, 11, 26), NOW)
        self.assertEqual(r["label"], "Real GDP, second estimate")
        self.assertEqual((r["period"], r["actual"], r["prior"]), ("Q3 2026", 3.6, 3.4))

    def test_upcoming_gdp_estimate_and_next_advance(self):
        spec = SPEC["Gross Domestic Product"]
        fred = cd.Fred(FakeFred(latest={"A191RL1Q225SBEA": [("2026-07-01", 3.4), ("2026-04-01", 2.1)]}))
        second = cd.release_row(fred, spec, spec["rows"][0], "2026-11-25", TODAY, NOW)
        advance = cd.release_row(fred, spec, spec["rows"][0], "2027-01-28", TODAY, NOW)
        self.assertEqual((second["label"], second["period"], second["prior"]), ("Real GDP, second estimate", "Q3 2026", 3.4))
        self.assertEqual((advance["label"], advance["period"]), ("Real GDP, advance estimate", "Q4 2026"))


class Build(unittest.TestCase):
    def test_full_build_orders_rows_and_reports_problems(self):
        fake = FakeFred(
            release_dates={10: ["2026-12-10"], 50: ["2026-12-04"]},
            latest={"CPIAUCSL": [("2026-10-01", 337.5), ("2026-09-01", 336.2)],
                    "CPILFESL": [("2026-10-01", 339.9), ("2026-09-01", 338.9)],
                    "PAYEMS": [("2026-10-01", 159293), ("2026-09-01", 159128)],
                    "UNRATE": [("2026-10-01", 4.1), ("2026-09-01", 4.2)],
                    "CES0500000003": [("2026-10-01", 38.0), ("2026-09-01", 37.85)],
                    "DFEDTARU": [("2026-11-23", 4.0)], "DFEDTARL": [("2026-11-23", 3.75)]})

        def broken_page(url):
            raise OSError("offline")
        cal = cd.build_calendar(fake, TODAY, NOW, broken_page)
        labels = [r["label"] for r in cal["events"]]
        self.assertEqual(labels[:3], ["Nonfarm payrolls", "Unemployment rate", "Average hourly earnings"])
        self.assertIn("Fed funds target range", labels)
        self.assertEqual(cal["fomc_source"], "built-in list")
        self.assertTrue(any("FOMC calendar" in p for p in cal["problems"]))
        self.assertEqual([r["date"] for r in cal["events"]], sorted(r["date"] for r in cal["events"]))


if __name__ == "__main__":
    unittest.main()
