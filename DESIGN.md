# Macro — design notes

This dashboard answers one question per page: *where is the economy now, and how does that compare with history?* Every design decision below traces to published work on data visualization, dashboard design, or macroeconomic indicators. Sources are listed at the end.

## 1. Layout: overview first, then detail

**Every page opens with an "At a glance" grid: one identical tile per metric.** Selecting a tile scrolls to that metric's module and briefly highlights it; a floating button returns to the grid. The format follows four principles:
- **Small multiples.** Tufte describes small multiples as one design repeated within the viewer's eye span, each instance showing different data [15]. Every tile has the same structure:
  - top line: name and date
  - a large current value
  - a 2-year sparkline, Tufte's "word-sized graphic" [16]
  - a footer with the change since the prior reading and a stoplight dot

  Because only the data differs, the eye compares values, not layouts.
- **A modular grid.** Tiles sit on an even grid in the tradition of Müller-Brockmann's *Grid Systems in Graphic Design* [17]. The column count is chosen so every row fills: 6×2 for 12 metrics, 5×2 for 10, 4×2 for 8, and 2 columns on phones. Each page's metric count was set to make that possible. For example, the Sahm-rule verdict rides on the Unemployment tile on the Overview, since the rule is computed from unemployment.
- **Grouping by proximity, not boxes.** Nielsen Norman Group finds proximity among the strongest grouping cues and warns that extra containers add clutter [18, 19]. So the grid has no outer frame; each tile's own edge is the only boundary.
- **At-a-glance monitoring.** Few's dashboard principle is a current value plus a compact trend, with detail one step away [3]. The tiles are that first step; the modules are the detail.

For MoM/QoQ views the tile footer shows the recent average (3 months or 4 quarters), because a change-of-a-change ("+105K vs Sep" for payrolls) is hard to read.

**The stoplight dot** (bottom-right of each tile) gives a quick read:
- **Green:** better than the prior reading, or a healthy reading (positive growth in a change view; within 0.5 pp of the 2% target for inflation).
- **Yellow:** little changed, meaning within a third of the series' typical one-step move.
- **Red:** worse, or a weak reading.
- **Hollow ring:** the series has no agreed good-or-bad direction (Fed funds, Treasury yields, the dollar, gold, M2, home prices), so the site doesn't invent one.

"Better" comes from each series' `good` setting in `config/series.json` (`up`, `down` or `{target}`). The five rule-based readings below decide their tile's dot directly, and hovering a dot shows the reason. Because the dot is color only, its reason is also in the tile's accessible label, and the change beside it shows the direction in text (WCAG 2.1 SC 1.4.1 [13]).

**Each module shows the full history beside the recent window.** The left chart covers everything FRED or Yahoo has (CPI since 1947, unemployment since 1948). The right chart zooms into the last 1–10 years, and the stretch it covers is highlighted on the left chart. This is Shneiderman's information-seeking mantra, *"overview first, zoom and filter, then details on demand"* [1]: the overview is the left chart, the zoom is the right chart with its range buttons, and the details are the hover tooltip, the 12-reading table, and *About this measure*. Munzner calls this pattern *overview + detail* [2]. It answers "historical trend vs. current trend" without a mode switch.

**The default zoom shortens as the comparison shortens.** Level and YoY open at 5 years, MoM at 3 and QoQ at 2. A month-over-month series is noisy, so a long window hides its current direction. Five years (rather than ten) also keeps the 2020 spike from flattening the recent trend.

**One module type everywhere.** FRED series, stocks, commodities and the dollar all use the same component, controls and layout. Few's first rule for dashboards is that consistency lets a reader learn the display once [3].

**Rows grouped by meaning.** Modules are grouped and ordered by economic relationship (for example, Construction: permits → starts → sales → supply), following Few's guidance to group related measures and place them in sequence [3].

## 2. Content: only the measures that matter

Five metrics have a **rule-based reading** with a citable threshold. It sets the stoplight dot on their tile (hover the dot for the rule):

| Tag on | Measure | Threshold | Source |
|---|---|---|---|
| Unemployment / Sahm rule | Sahm rule (`SAHMREALTIME`) | ≥ 0.50 pp triggers | Sahm (2019) [9] |
| Real growth | Real GDP, annualized QoQ (`GDPC1`) | < 0 contracting | BEA convention |
| Core inflation | Core PCE YoY (`PCEPILFE`) | Fed target 2% | FOMC (2012, rev. 2020) [10] |
| Yield curve | 10Y – 2Y (`T10Y2Y`) | < 0 inverted | Estrella & Mishkin (1998) [11] |
| Credit stress | Baa – 10Y spread (`BAA10Y`) | ≥ 3.5 pp stressed | Gilchrist & Zakrajšek (2012) [12] |

Curation choices:
- **Real GDP** (`GDPC1`) replaces nominal GDP, so growth isn't inflated by price changes.
- **Prime-age employment rate** replaces labor force participation, because it isn't distorted by an aging population.
- **Shelter CPI** is included because it is about a third of the CPI basket and drives inflation's persistence.
- **Series with too little history are dropped.** FRED carries only short windows of NAR existing-home sales, NAR affordability and ICE high-yield spreads.
- **Decorative assets are dropped.** Bitcoin, and the duplicate homebuilder ETF, were removed.
- **Eleven sector price charts become one ranked bar chart of returns.** Cleveland & McGill show position along a common scale is read more accurately than comparing separate charts [4].

## 3. Ink: remove what doesn't carry data

Following Tufte's data-ink principle [5], the redesign removed:
- the background grid pattern, the pulsing "live" indicator and the glowing accent bars
- vertical gridlines
- trailing zeros on axis ticks (`+20%`, not `+20.00%`)
- a different color for every market chart

What stays is the data line, hairline horizontal gridlines, a single stronger zero line for change views, and labeled reference lines where a number has a policy meaning (the Fed's 2% target, the Sahm trigger, curve inversion). Recessions are shaded in a neutral tone [6] so they give context without competing with the data.

**Log scale for compounding series.** The S&P 500 and gold use a logarithmic axis on Level view, so equal percentage moves look equal across decades [5, 7].

## 4. Color

**Color is used sparingly and only where it means something** [3, 8]:
- **One series color** (blue) for all data. Identity is carried by titles, not hue, so there is nothing to decode.
- **Status colors** (green/yellow/red) appear only on the overview's stoplight dots. Each dot's reason is in its tooltip and accessible label, and the change beside it carries the direction in text (WCAG 2.1, SC 1.4.1 [13]).
- **No beat/miss coloring in the calendar.** A CPI "miss" is good news, so red/green there would mislead.
- **Bars use one color for positive and negative values.** The bar's position relative to the zero line already shows the sign.

**The palette was checked with a contrast and color-vision validator, not by eye.** The series blue (`#3987e5`) passes the lightness band, chroma floor and ≥ 3:1 contrast on the dark surface. Paired with the next palette slot it also passes color-vision-deficiency separation (ΔE ≥ 8, OKLab) under protanopia, deuteranopia and tritanopia. This follows the approach of Brewer's ColorBrewer [8] and Okabe & Ito [14]. All text meets WCAG AA contrast (4.5:1).

**Dark theme only.** Charts read the same CSS tokens as the page, so changing a color in `css/site.css` updates every chart.

## 5. Typography and numbers

- **System sans throughout.** The previous monospace face hurt reading speed for prose and labels [3].
- **Tabular figures in tables and on axes**, so columns align. Headline numbers use proportional figures.
- **Fixed decimals per series**, so `2.00%` and `1.90%` compare cleanly.
- **True minus signs (−)**, and `$` before the number rather than after it.

## 6. Accessibility

- Every control is a real `<button>` with `aria-pressed`.
- Each chart is labeled with `role="img"`.
- Descriptions use the native `<details>` element.
- The layout reflows to one column on phones, and tables scroll to the latest reading.
- Motion is disabled under `prefers-reduced-motion`.

## Economic calendar

The calendar (on the Overview) is built by `python/calendar_data.py` during the hourly data job, from official sources only.

**Where each part comes from**
- **Release schedule:** FRED's release calendar, including scheduled future dates. Each release ID and series was checked against FRED's own metadata.
- **Actual and previous:** the values as first published on the release day, read from FRED's historical vintages (ALFRED), not today's revised figures. Example: the October jobs report printed +165K, with September revised to +60K.
- **Fed decisions:** dates come from the Federal Reserve's FOMC calendar page, read on every run, with a built-in list as backup. The target range before and after comes from `DFEDTARL`/`DFEDTARU`; the new range takes effect the day after the announcement.

**What each row shows**
- **Reference period:** the month, quarter or week the number covers (e.g. "Oct 2026", "Week ending Nov 21"). For upcoming releases it comes from each agency's standard publication lag.
- **Value convention:** each release uses its usual headline form, e.g. CPI m/m, payrolls change, GDP q/q annualized, housing starts at an annual rate.
- **GDP estimates:** labeled advance, second or third. For a revision, "previous" is the earlier estimate of the same quarter.
- **"Previous" for upcoming rows:** shown only when it's already published. Later weeks of claims show "–".
- **Revision-only dates on FRED's schedule are skipped:** if a release would cover an already-published period, it doesn't get a row.
- **"Awaiting data":** the release time has passed but FRED hasn't posted the number yet, usually a matter of hours.

**What's deliberately left out**
- **Consensus forecasts.** No free source permits automated use, and the old "estimate" column copied the previous value, which was a made-up number.
- **Reports without reliable data on FRED:**
  - Existing home sales (NAR licensing; no release history or future dates)
  - University of Michigan sentiment (FRED posts it a month late)
  - ISM PMIs and the Conference Board's consumer confidence (not on FRED)

**Layout**
- **Two tabs:** Upcoming and Past week.
- **Upcoming** shows the next two weeks plus later high-impact releases; minor releases beyond two weeks sit behind a "show all" button.
- **Rows are grouped under day headings.** High-impact releases are in bold. Color isn't used, because beating or missing a number isn't inherently good or bad: a CPI miss is good news.

## Data pipeline

The browser never calls FRED or Yahoo. A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs `python/build_data.py`:
- **When:** hourly at :17, on every push to `main`, and on demand from the Actions tab.
- **What it does:**
  - fetches every series in `config/series.json`, the sector returns and the economic calendar
  - writes them to one file, `data/macro.json`, which it publishes with the site to GitHub Pages
- **Why:**
  - pages load in about a second instead of 30–60
  - the FRED key stays in a GitHub secret
  - there's no proxy to maintain
- **If a source fails,** that series keeps its last published values (flagged "stale" on the page) rather than disappearing. A run that gets no usable data at all doesn't publish.

## How to change what's shown

- **`config/series.json`** lists every series: FRED or Yahoo id, units, default view (`mode`) and optional `target` line. Add a series here and the next build fetches it.
- **Each page's `LAYOUT`** (at the end of the HTML file) sets which of those series the page shows, in what order and in which groups.
- **`SIGNAL_LIBRARY` in `js/ui.js`** defines the rule-based readings; each series' `good` setting drives its stoplight dot.
- **`css/site.css`** holds all styling.

## Sources

1. Shneiderman, B. (1996). *The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations.* Proc. IEEE Symposium on Visual Languages, 336–343.
2. Munzner, T. (2014). *Visualization Analysis and Design.* CRC Press. Ch. 12, "Facet into Multiple Views."
3. Few, S. (2013). *Information Dashboard Design: Displaying Data for At-a-Glance Monitoring* (2nd ed.). Analytics Press.
4. Cleveland, W. S., & McGill, R. (1984). Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods. *Journal of the American Statistical Association*, 79(387), 531–554.
5. Tufte, E. R. (2001). *The Visual Display of Quantitative Information* (2nd ed.). Graphics Press.
6. National Bureau of Economic Research. *US Business Cycle Expansions and Contractions.* nber.org/research/business-cycle-dating.
7. Cleveland, W. S. (1994). *The Elements of Graphing Data* (rev. ed.). Hobart Press.
8. Harrower, M., & Brewer, C. A. (2003). ColorBrewer.org: An Online Tool for Selecting Colour Schemes for Maps. *The Cartographic Journal*, 40(1), 27–37.
9. Sahm, C. (2019). Direct Stimulus Payments to Individuals. In *Recession Ready: Fiscal Policies to Stabilize the American Economy*, Hamilton Project / Brookings.
10. Federal Open Market Committee (2012; amended 2020). *Statement on Longer-Run Goals and Monetary Policy Strategy.*
11. Estrella, A., & Mishkin, F. S. (1998). Predicting U.S. Recessions: Financial Variables as Leading Indicators. *Review of Economics and Statistics*, 80(1), 45–61.
12. Gilchrist, S., & Zakrajšek, E. (2012). Credit Spreads and Business Cycle Fluctuations. *American Economic Review*, 102(4), 1692–1720.
13. W3C (2018). *Web Content Accessibility Guidelines (WCAG) 2.1.* SC 1.4.1 Use of Color; SC 1.4.3 Contrast (Minimum).
14. Okabe, M., & Ito, K. (2008). *Color Universal Design (CUD): How to make figures and presentations that are friendly to colorblind people.* J*Fly.
15. Tufte, E. R. (1990). *Envisioning Information.* Graphics Press. "Small Multiples," pp. 67–79.
16. Tufte, E. R. (2006). *Beautiful Evidence.* Graphics Press. "Sparklines: Intense, Simple, Word-Sized Graphics," pp. 46–63.
17. Müller-Brockmann, J. (1981). *Grid Systems in Graphic Design.* Niggli.
18. Nielsen Norman Group. *Proximity Principle in Visual Design.* nngroup.com/articles/gestalt-proximity/
19. Nielsen Norman Group. *The Principle of Common Region: Containers Create Groupings.* nngroup.com/articles/common-region/
