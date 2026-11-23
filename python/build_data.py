"""Builds data/macro.json: every series the site shows, sector returns and the
economic calendar (python/calendar_data.py), fetched server-side so the
browser needs no API key.

Run by .github/workflows/deploy.yml every hour and on every push to main.

    FRED_API_KEY=... python python/build_data.py --out _site/data/macro.json \
        --previous https://<site>/data/macro.json

If a source fails, that series keeps its previously published values (marked
"stale") instead of disappearing. The run fails only if nothing could be built.
"""
import argparse
import json
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests
from zoneinfo import ZoneInfo

import calendar_data

log = logging.getLogger("build_data")

FRED_URL = "https://api.stlouisfed.org/fred"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
FRED_PAUSE = 0.55          # FRED allows 120 requests/minute
YAHOO_PAUSE = 0.4
# Plain, identifiable client name for official sites (the Fed's page refuses
# anonymous scripts). Yahoo keeps the session default.
SITE_USER_AGENT = "macro-dashboard/1.0 (+https://github.com/Adam-A9/macro)"

session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0 (macro dashboard data build)"


# ─── HTTP ────────────────────────────────────────────────────
class FetchError(Exception):
    """A failed request. Messages never include the URL, which carries the API key."""


def get_json(url, params=None, retries=3):
    endpoint = url.split("?")[0]
    for attempt in range(retries):
        try:
            r = session.get(url, params=params, timeout=30)
        except requests.RequestException as e:
            error = FetchError(f"{type(e).__name__} from {endpoint}")
        else:
            if r.ok:
                try:
                    return r.json()
                except ValueError:
                    error = FetchError(f"invalid JSON from {endpoint}")
            elif r.status_code == 429 or r.status_code >= 500:
                error = FetchError(f"HTTP {r.status_code} from {endpoint}")
            else:
                # Other 4xx (e.g. unknown series id) won't succeed on retry.
                raise FetchError(f"HTTP {r.status_code} from {endpoint}")
        if attempt == retries - 1:
            raise error
        wait = 2 * (attempt + 1)
        log.warning("  retry in %ss (%s)", wait, error)
        time.sleep(wait)


# ─── PURE HELPERS (unit-tested in tests/test_build_data.py) ──
def parse_fred(observations):
    """FRED observations -> [[date, value], ...] ascending, skipping blanks."""
    out = []
    for o in observations:
        v = o.get("value")
        if v in (".", "", None):
            continue
        out.append([o["date"], float(v)])
    out.sort(key=lambda p: p[0])
    return out


def merge_latest(monthly, latest):
    """Replace the current (incomplete) month with the latest raw reading."""
    if not latest:
        return monthly
    month = latest[0][:7]
    kept = [p for p in monthly if p[0][:7] != month and p[0] < latest[0]]
    kept.append(latest)
    return kept


def parse_yahoo(payload):
    """Yahoo chart payload -> [[date, close], ...] ascending."""
    result = (payload.get("chart") or {}).get("result")
    if not result:
        err = ((payload.get("chart") or {}).get("error") or {}).get("description", "no data")
        raise ValueError(err)
    r = result[0]
    closes = r["indicators"]["quote"][0]["close"]
    out = []
    for t, c in zip(r.get("timestamp") or [], closes):
        if c is None:
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).date().isoformat()
        out.append([d, round(float(c), 4)])
    return out


def trailing_returns(daily):
    """Total price return (%) over 1M, 3M, YTD and 1Y from daily closes."""
    if not daily:
        return {}
    last_date = date.fromisoformat(daily[-1][0])
    last = daily[-1][1]

    def on_or_before(d):
        found = None
        for ds, v in daily:
            if ds <= d:
                found = v
            else:
                break
        return found

    def months_back(n):
        y, m = last_date.year, last_date.month - n
        while m <= 0:
            m += 12
            y -= 1
        day = min(last_date.day, 28 if m == 2 else 30 if m in (4, 6, 9, 11) else 31)
        return date(y, m, day).isoformat()

    def pct(base):
        return round((last / base - 1) * 100, 2) if base else None

    return {
        "1M": pct(on_or_before(months_back(1))),
        "3M": pct(on_or_before(months_back(3))),
        "YTD": pct(on_or_before(f"{last_date.year - 1}-12-31")),
        "1Y": pct(on_or_before(months_back(12))),
    }


# ─── SOURCES ─────────────────────────────────────────────────
def fred_observations(series_id, key, **params):
    q = {"series_id": series_id, "api_key": key, "file_type": "json"}
    q.update(params)
    data = get_json(f"{FRED_URL}/series/observations", q)
    time.sleep(FRED_PAUSE)
    if "observations" not in data:
        raise ValueError(data.get("error_message", "no observations"))
    return parse_fred(data["observations"])


def fetch_fred_series(cfg, key):
    if cfg.get("sample") != "monthly":
        return fred_observations(cfg["id"], key)
    monthly = fred_observations(cfg["id"], key, frequency="m", aggregation_method="eop")
    latest = fred_observations(cfg["id"], key, sort_order="desc", limit=1)
    return merge_latest(monthly, latest[-1] if latest else None)


def yahoo_chart(symbol, **params):
    data = get_json(YAHOO_URL + requests.utils.quote(symbol, safe=""), params)
    time.sleep(YAHOO_PAUSE)
    return parse_yahoo(data)


def fetch_market_series(cfg):
    last_error = None
    for symbol in cfg.get("alts") or [cfg["id"]]:
        try:
            # An explicit period keeps monthly bars (range=max returns 3-month bars).
            monthly = yahoo_chart(symbol, period1=0, period2=int(time.time()), interval="1mo")
            daily = yahoo_chart(symbol, range="5d", interval="1d")
            if monthly:
                return merge_latest(monthly, daily[-1] if daily else None)
        except Exception as e:  # try the next ticker
            last_error = e
    raise last_error or ValueError("no data")


def fred_get(key):
    """FRED JSON getter for calendar_data (paced, retried, key never logged)."""
    def get(path, **params):
        q = dict(params, api_key=key, file_type="json")
        data = get_json(f"{FRED_URL}/{path}", q)
        time.sleep(FRED_PAUSE)
        return data
    return get


def fetch_text(url):
    r = session.get(url, headers={"User-Agent": SITE_USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


def fetch_calendar(key):
    now_et = datetime.now(ZoneInfo("America/New_York")).replace(tzinfo=None)
    cal = calendar_data.build_calendar(fred_get(key), now_et.date(), now_et, fetch_text)
    log.info("  calendar: %d rows (%s to %s), Fed dates from %s",
             len(cal["events"]), cal["start"], cal["end"], cal["fomc_source"])
    for p in cal["problems"]:
        log.warning("  calendar problem: %s", p)
    return cal


# ─── BUILD ───────────────────────────────────────────────────
def load_previous(source):
    if not source:
        return {}
    try:
        if source.startswith("http"):
            r = session.get(source, timeout=30)
            r.raise_for_status()
            return r.json()
        with open(source) as f:
            return json.load(f)
    except Exception as e:
        log.warning("No previous data (%s): %s", source, e)
        return {}


def build(catalog, key, previous):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    prev_series = previous.get("series", {})
    out = {"generated_at": now, "series": {}, "sectors": {}, "calendar": {},
           "pages": catalog.get("pages", [])}
    fresh = 0

    for name, cfg in catalog["series"].items():
        entry = dict(cfg)
        try:
            obs = fetch_market_series(cfg) if cfg.get("source") == "market" else fetch_fred_series(cfg, key)
            if len(obs) < 2:
                raise ValueError("fewer than 2 observations")
            entry.update(obs=obs, updated_at=now, stale=False)
            fresh += 1
            log.info("  %-14s %5d obs  latest %s", name, len(obs), obs[-1][0])
        except Exception as e:
            old = prev_series.get(name, {})
            entry.update(obs=old.get("obs", []), updated_at=old.get("updated_at"),
                         stale=True, error=str(e)[:200])
            log.error("  %-14s FAILED (%s) - keeping previous data", name, e)
        out["series"][name] = entry

    prev_returns = previous.get("sectors", {}).get("returns", {})
    returns = {}
    for sym in catalog.get("sectors", {}):
        try:
            returns[sym] = trailing_returns(yahoo_chart(sym, range="2y", interval="1d"))
        except Exception as e:
            log.error("  sector %s FAILED (%s)", sym, e)
            if sym in prev_returns:
                returns[sym] = prev_returns[sym]
    out["sectors"] = {"labels": catalog.get("sectors", {}), "returns": returns}

    try:
        cal = fetch_calendar(key)
        if not cal["events"] and previous.get("calendar", {}).get("events"):
            log.error("  calendar came back empty - keeping previous")
            cal = previous["calendar"]
        out["calendar"] = cal
    except Exception as e:
        log.error("  calendar FAILED (%s) - keeping previous", e)
        out["calendar"] = previous.get("calendar", {})

    return out, fresh


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config/series.json")
    ap.add_argument("--out", default="data/macro.json")
    ap.add_argument("--previous", default="", help="URL or path of the last published data")
    args = ap.parse_args()

    key = os.environ.get("FRED_API_KEY")
    if not key:
        sys.exit("FRED_API_KEY is not set")

    with open(args.config) as f:
        catalog = json.load(f)
    previous = load_previous(args.previous)
    data, fresh = build(catalog, key, previous)

    usable = sum(1 for s in data["series"].values() if s["obs"])
    log.info("%d/%d series fetched fresh, %d usable", fresh, len(data["series"]), usable)
    if usable == 0:
        sys.exit("No usable data - not publishing")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    log.info("Wrote %s (%.0f KB)", args.out, os.path.getsize(args.out) / 1024)


if __name__ == "__main__":
    main()
