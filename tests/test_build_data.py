"""Unit tests for python/build_data.py. Run: python -m unittest discover tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "python"))
import build_data as bd  # noqa: E402


class ParseFred(unittest.TestCase):
    def test_skips_blanks_and_sorts(self):
        obs = [{"date": "2026-02-01", "value": "4.2"},
               {"date": "2026-01-01", "value": "4.1"},
               {"date": "2026-03-01", "value": "."}]
        self.assertEqual(bd.parse_fred(obs), [["2026-01-01", 4.1], ["2026-02-01", 4.2]])


class MergeLatest(unittest.TestCase):
    def test_replaces_current_month(self):
        monthly = [["2026-09-01", 4.1], ["2026-10-01", 4.2]]
        self.assertEqual(bd.merge_latest(monthly, ["2026-10-17", 4.3]),
                         [["2026-09-01", 4.1], ["2026-10-17", 4.3]])

    def test_appends_new_month(self):
        monthly = [["2026-10-01", 4.2]]
        self.assertEqual(bd.merge_latest(monthly, ["2026-11-19", 5.04])[-1], ["2026-11-19", 5.04])

    def test_no_latest(self):
        self.assertEqual(bd.merge_latest([["2026-10-01", 1.0]], None), [["2026-10-01", 1.0]])


class ParseYahoo(unittest.TestCase):
    def test_drops_missing_closes(self):
        payload = {"chart": {"result": [{
            "timestamp": [1767225600, 1769904000],          # 2026-01-01, 2026-02-01
            "indicators": {"quote": [{"close": [100.123456, None]}]}}]}}
        self.assertEqual(bd.parse_yahoo(payload), [["2026-01-01", 100.1235]])

    def test_error_payload(self):
        with self.assertRaises(ValueError):
            bd.parse_yahoo({"chart": {"result": None, "error": {"description": "No data found"}}})


class TrailingReturns(unittest.TestCase):
    def test_windows(self):
        daily = [["2025-11-20", 100], ["2025-12-31", 110], ["2026-08-20", 120],
                 ["2026-10-20", 125], ["2026-11-20", 132]]
        r = bd.trailing_returns(daily)
        self.assertAlmostEqual(r["1M"], round((132 / 125 - 1) * 100, 2))
        self.assertAlmostEqual(r["3M"], 10.0)
        self.assertAlmostEqual(r["YTD"], 20.0)
        self.assertAlmostEqual(r["1Y"], 32.0)

    def test_month_end_clamp(self):
        # Mar 31 minus 1 month must not crash on Feb 31
        r = bd.trailing_returns([["2026-02-27", 100], ["2026-03-31", 110]])
        self.assertAlmostEqual(r["1M"], 10.0)


class StaleFallback(unittest.TestCase):
    def test_failed_series_keeps_previous_data(self):
        catalog = {"series": {"X": {"source": "fred", "id": "X"}}, "sectors": {}}
        previous = {"series": {"X": {"obs": [["2026-01-01", 1.0], ["2026-02-01", 2.0]],
                                     "updated_at": "2026-02-02T00:00:00+00:00"}}}
        orig_fred, orig_cal = bd.fetch_fred_series, bd.fetch_calendar
        bd.fetch_fred_series = lambda cfg, key: (_ for _ in ()).throw(RuntimeError("down"))
        bd.fetch_calendar = lambda key: {"events": [], "problems": []}
        try:
            data, fresh = bd.build(catalog, "k", previous)
        finally:
            bd.fetch_fred_series, bd.fetch_calendar = orig_fred, orig_cal
        x = data["series"]["X"]
        self.assertEqual(fresh, 0)
        self.assertTrue(x["stale"])
        self.assertEqual(x["obs"], previous["series"]["X"]["obs"])
        self.assertEqual(x["updated_at"], "2026-02-02T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
