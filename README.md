# GDP, Inequality, and Income Dashboard

Interactive D3 dashboard for exploring cross-country patterns in inequality and income over time.

- Live demo: https://jaredwalden00.github.io/GDP-Share-Graphs/
- Tech: Vanilla JavaScript, D3 v6, TopoJSON

![Dashboard preview](images/test3.png)

## Features

### 1) Five coordinated views

Use the header tabs to switch between:

- **Income share** (time-series bubble chart)
- **GDP per capita** (time-series bubble chart)
- **Median income** (time-series bubble chart)
- **Comparison** (scatter plot for selected X vs Y)
- **Map** (choropleth by country)

### 2) Multiple measures and derived metrics

The app merges three country-year datasets and computes additional indicators:

- Top 1% income share (%)
- GDP per capita (USD)
- Median income after tax (USD)
- GDP growth (YoY %; derived from GDP per capita)
- Top 1% share change (YoY percentage points; derived)

### 3) Interactive filtering and exploration

- **Year range controls** (`Years: start → end`) filter the active time-based panel
- **Brush timeline** below each time chart for direct year-range selection
- **Country search** filters all views by country name substring
- **Comparison controls** select X and Y measures
- **Map controls** select map measure and year (`Latest year` or specific year)
- **Reset view** restores default selections and map zoom

### 4) Visual behavior

- Context-aware color scales:
	- Sequential for absolute levels
	- Diverging for directional change measures
- Tooltips on chart points and map countries
- Zoom and pan on the map
- Missing map values rendered in neutral gray

### 5) Shareable state

Current UI state is written to URL query parameters, including active tab, selected measures, map year, scope, and country query.

## Data sources

Files in `data/`:

- `income-share-top-1-before-tax-wid.csv`
- `gdp-per-capita-worldbank.csv`
- `median-income-after-tax-lis.csv`
- `world.json` (country geometry)