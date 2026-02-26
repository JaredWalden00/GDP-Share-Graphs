# GDP, Inequality, and Income Dashboard

Interactive D3 dashboard for exploring cross-country patterns in income concentration and macroeconomic outcomes over time.

- Live demo: https://jaredwalden00.github.io/GDP-Share-Graphs/
- Tech: Vanilla JavaScript + D3 v6 + TopoJSON

![Dashboard preview](images/test3.png)

## What this project shows

The dashboard combines three datasets into a unified country-year table and visualizes:

- Top 1% income share (%)
- GDP per capita (USD)
- Median income after tax (USD)
- GDP growth (YoY %)
- Top 1% share change (YoY percentage points)

## Views

Use the tabs in the header to switch between five panels:

- **Income share**: Time-series bubble chart
- **GDP per capita**: Time-series bubble chart
- **Median income**: Time-series bubble chart
- **Comparison**: Scatter plot of selected X vs Y measures
- **Map**: Choropleth for a selected map measure and year

## Controls and interactions

Global controls in the header:

- **Years (start → end)**: Filters the active time-based panel with a brushed year range
- **Country search**: Text match filter on country names
- **Reset view**: Restores default measures, clears filters, and resets map zoom

Panel-specific controls:

- **Comparison tab**: choose X and Y measures
- **Map tab**: choose map measure and map year

Other behavior:

- Hover any mark/country for tooltips
- Zoom/pan is enabled on the map
- UI state is synced to URL query params for shareable views

## Color semantics

- **Sequential scales** for absolute measures (e.g., GDP per capita, top 1% share, median income)
- **Diverging scales** for directional change measures (e.g., GDP growth, top 1% share change)
- Missing map values are shown in neutral gray

## Data files

All source files are in `data/`:

- `income-share-top-1-before-tax-wid.csv`
- `gdp-per-capita-worldbank.csv`
- `median-income-after-tax-lis.csv`
- `world.json` (map geometry)