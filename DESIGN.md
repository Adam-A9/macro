# Macro — design notes

This dashboard answers one question per page: *where is the economy now, and how does that compare with history?* Every design decision below traces to published work on data visualization, dashboard design, or macroeconomic indicators. Sources are listed at the end.

## 1. Layout: overview first, then detail

**Each module shows the full history beside the recent window.** The left chart covers everything FRED or Yahoo has (CPI since 1947, unemployment since 1948). The right chart zooms into the last 1–10 years, and the stretch it covers is highlighted on the left chart. This is Shneiderman's information-seeking mantra, *"overview first, zoom and filter, then details on demand"* [1]: the overview is the left chart, the zoom is the right chart with its range buttons, and the details are the hover tooltip, the 12-reading table, and *About this measure*. Munzner calls this pattern *overview + detail* [2]. It answers "historical trend vs. current trend" without a mode switch.

**The default zoom shortens as the comparison shortens.** Level and YoY open at 5 years, MoM at 3 and QoQ at 2. A month-over-month series is noisy, so a long window hides its current direction. Five years (rather than ten) also keeps the 2020 spike from flattening the recent trend.

**One module type everywhere.** FRED series, stocks, commodities and the dollar all use the same component, controls and layout. Few's first rule for dashboards is that consistency lets a reader learn the display once [3].

**Rows grouped by meaning.** Modules are grouped and ordered by economic relationship (for example, Construction: permits → starts → sales → supply), following Few's guidance to group related measures and place them in sequence [3].

## 2. Content: only the measures that matter

The overview's **signal strip** reduces the economy's state to five rule-based readings, each with a citable threshold:

| Signal | Measure | Threshold | Source |
|---|---|---|---|
| Recession signal | Sahm rule (`SAHMREALTIME`) | ≥ 0.50 pp triggers | Sahm (2019) [9] |
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
- **Status colors** (green/amber/red) appear only on the signal strip, and always with an icon and a word ("✓ Not triggered"). Meaning is never carried by color alone (WCAG 2.1, SC 1.4.1 [13]).
- **No beat/miss coloring in the calendar.** A CPI "miss" is good news, so red/green there would mislead.
- **Bars use one color for positive and negative values.** The bar's position relative to the zero line already shows the sign.

**The palette was checked with a contrast and color-vision validator, not by eye.** The series blues (`#2a78d6` light, `#3987e5` dark) pass the lightness band, chroma floor and ≥ 3:1 contrast on their surfaces. Paired with the next palette slot they also pass color-vision-deficiency separation (ΔE ≥ 8, OKLab) under protanopia, deuteranopia and tritanopia. This follows the approach of Brewer's ColorBrewer [8] and Okabe & Ito [14]. Body text meets WCAG AA contrast (4.5:1) in both themes.

**Light and dark themes are each designed separately, not inverted.** The site follows the operating system's setting, and the header button pins either theme. Charts read the same CSS tokens as the page, so they switch together.

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

## How to change what's shown

Each page ends with two editable lists:
- **`LAYOUT`** sets the order and grouping of modules.
- **`SERIES`** sets each series' FRED or Yahoo id, units, default view (`mode`), and optional `target` line.

The overview's signals are defined in `SIGNAL_LIBRARY` in `js/ui.js`. All styling is in `css/site.css`.

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
