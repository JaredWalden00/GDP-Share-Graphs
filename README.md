# GDP and Income Share Dashboard

Hosted at: https://jaredwalden00.github.io/GDP-Share-Graphs/

![Chart preview](images/test2.png)

## Thematic focus

This dashboard uses an economic inequality + macroeconomic performance theme for different countries.

Quantitative measures available to users:
- Top 1% income share (%)
- GDP per capita (USD)
- GDP growth (year-over-year %)
- Top 1% share change (year-over-year percentage points)

## Layout sketch (before coding)

I used a one-page dashboard layout so all related views stay visible at the same time and users can compare attributes without scrolling.

```
┌───────────────────────────────┬───────────────────────────────┐
│ Income Share by Year          │ GDP per Capita by Year        │
│ (bubble chart, x=year)        │ (bubble chart, x=year)        │
├───────────────────────────────┼───────────────────────────────┤
│ GDP vs Top 1% Share           │ Latest GDP per Capita Map     │
│ (scatter, selectable year)    │ (choropleth)                  │
└───────────────────────────────┴───────────────────────────────┘
```

Intentional layout choices:
- The two time-series bubble charts are adjacent so the two attributes can be compared quickly year-to-year.
- The merged scatterplot sits directly below to support cross-attribute comparison in one view.
- The map remains visible as a geographic context panel without pushing analytical charts off screen.
- The full dashboard is constrained to viewport height (`100vh`) with no page scrolling.

## User interaction guidance

Controls are placed in the top header for clear, global access:
- **Left chart measure**: chooses the measure shown in the top-left chart.
- **Right chart measure**: chooses the measure shown in the top-right chart.
- **Map measure**: chooses the measure encoded on the choropleth map.
- **Year** (in merged chart panel): filters the bottom-left comparison chart to a specific year or all years.

How views update:
- Changing left/right measure updates the top charts and the merged scatter axis labels + data.
- Changing map measure updates map fill colors and tooltip values.
- Changing merged year filters only the merged comparison chart for focused cross-attribute comparison.

## Color scheme and rationale

### 1) Sequential palettes for absolute measures
- **GDP per capita** uses `d3.interpolateBlues` (light = lower, dark = higher).
- **Top 1% income share** uses `d3.interpolateOrRd` (light = lower, dark = higher).
- These are absolute-value indicators, so monotonic light-to-dark scales communicate magnitude well.

### 2) Diverging palettes for change measures
- **GDP growth (YoY %)** uses `d3.interpolateRdYlGn` with a zero-centered domain.
- **Top 1% share change (YoY pp)** uses `d3.interpolatePuOr` with a zero-centered domain.
- Diverging schemes are used because both measures have meaningful positive and negative directions.

### 3) Missing data treatment
- Missing values are encoded as neutral gray on the map and omitted from scatter/bubble point layers.
- This avoids suggesting false quantitative rankings.

This strategy aligns color semantics with data semantics: absolute measures use sequential intensity, while directional change measures use diverging color around zero.