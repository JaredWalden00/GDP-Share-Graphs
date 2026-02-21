const MAX_POINTS_PER_CHART = 3000;
const CHART_MARGIN = { top: 10, right: 16, bottom: 36, left: 62 };
const TIME_CHART_RADIUS_RANGE = [3.5, 11.5];
const MERGED_CHART_POINT_RADIUS = 4.8;
const MAP_ZOOM_SCALE_EXTENT = [1, 8];

const BRUSH_HEIGHT = 20;
const CONTEXT_HEIGHT = 60;

const MEASURES = {
  top1Share: {
    label: "Top 1% income share",
    axisLabel: "Top 1% income share (%)",
    formatTick: d3.format(".1f"),
    formatValue: value => `${d3.format(".2f")(value)}%`,
    colorType: "sequential",
    interpolator: d3.interpolateOrRd
  },
  gdpPerCapita: {
    label: "GDP per capita",
    axisLabel: "GDP per capita (USD)",
    formatTick: d3.format("~s"),
    formatValue: value => `$${d3.format(",.0f")(value)}`,
    colorType: "sequential",
    interpolator: d3.interpolateBlues
  },
  gdpGrowth: {
    label: "GDP growth (YoY)",
    axisLabel: "GDP growth (% year-over-year)",
    formatTick: d => `${d3.format(".1f")(d)}%`,
    formatValue: value => `${d3.format("+.2f")(value)}%`,
    colorType: "diverging",
    interpolator: d3.interpolateRdYlGn
  },
  top1ShareChange: {
    label: "Top 1% share change (YoY)",
    axisLabel: "Top 1% income share change (percentage points)",
    formatTick: d => `${d3.format("+.1f")(d)} pp`,
    formatValue: value => `${d3.format("+.2f")(value)} pp`,
    colorType: "diverging",
    interpolator: d3.interpolatePuOr
  }
};

const MEASURE_OPTIONS = [
  "top1Share",
  "gdpPerCapita",
  "gdpGrowth",
  "top1ShareChange"
];

const YEAR_SCOPE_OPTIONS = ["all", "single"];
const PANEL_OPTIONS = ["income", "gdp", "merged", "map"];

const DEFAULT_SELECTIONS = {
  leftMeasure: "top1Share",
  rightMeasure: "gdpPerCapita",
  mapMeasure: "gdpPerCapita",
  yearScope: "all",
  year: "latest",
  countryQuery: "",
  activePanel: "income"
};

let appState = null;

Promise.all([
  d3.json("data/world.json"),
  d3.csv("data/income-share-top-1-before-tax-wid.csv"),
  d3.csv("data/gdp-per-capita-worldbank.csv")
])
  .then(([geoData, incomeDataRaw, gdpDataRaw]) => {
    const incomeData = incomeDataRaw
      .map(d => ({
        Entity: d.Entity,
        Year: +d.Year,
        top1Share: +d["Share (top 1%, before tax)"]
      }))
      .filter(d => Number.isFinite(d.Year) && Number.isFinite(d.top1Share));

    const gdpData = gdpDataRaw
      .map(d => ({
        Entity: d.Entity,
        Code: d.Code,
        Year: +d.Year,
        gdpPerCapita: +d["GDP per capita"]
      }))
      .filter(d => Number.isFinite(d.Year) && Number.isFinite(d.gdpPerCapita));

    const measureRows = buildMeasureRows(incomeData, gdpData);
    const mergedYears = [...new Set(measureRows.map(d => d.Year))].sort((a, b) => a - b);

    appState = {
      geoData,
      measureRows,
      mergedYears,
      countryNames: [...new Set(measureRows.map(d => d.Entity))].sort(d3.ascending),
      selections: buildInitialSelections(mergedYears),
      mapTransform: d3.zoomIdentity,
      brushSelection: null
    };

    setupMeasureDropdowns();
    setupGlobalYearDropdown(mergedYears);
    setupCountrySearchDatalist();
    syncControlsFromState();
    bindControlEvents();
    syncUrlState();
    renderDashboard();

    window.addEventListener("resize", debounce(renderDashboard, 150));
  })
  .catch(error => {
    console.error(error);
  });

function buildMeasureRows(incomeData, gdpData) {
  const rowMap = new Map();

  const getRow = (entity, year) => {
    const key = `${entity}-${year}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        Entity: entity,
        Code: undefined,
        Year: year,
        top1Share: undefined,
        gdpPerCapita: undefined,
        gdpGrowth: undefined,
        top1ShareChange: undefined
      });
    }
    return rowMap.get(key);
  };

  gdpData.forEach(d => {
    const row = getRow(d.Entity, d.Year);
    row.gdpPerCapita = d.gdpPerCapita;
    if (d.Code) {
      row.Code = d.Code;
    }
  });

  incomeData.forEach(d => {
    getRow(d.Entity, d.Year).top1Share = d.top1Share;
  });

  const gdpByEntity = d3.groups(gdpData, d => d.Entity);
  gdpByEntity.forEach(([, rows]) => {
    const sorted = rows.slice().sort((a, b) => a.Year - b.Year);
    for (let index = 1; index < sorted.length; index += 1) {
      const current = sorted[index];
      const previous = sorted[index - 1];
      if (previous.gdpPerCapita !== 0) {
        const growth = ((current.gdpPerCapita - previous.gdpPerCapita) / previous.gdpPerCapita) * 100;
        getRow(current.Entity, current.Year).gdpGrowth = growth;
      }
    }
  });

  const incomeByEntity = d3.groups(incomeData, d => d.Entity);
  incomeByEntity.forEach(([, rows]) => {
    const sorted = rows.slice().sort((a, b) => a.Year - b.Year);
    for (let index = 1; index < sorted.length; index += 1) {
      const current = sorted[index];
      const previous = sorted[index - 1];
      const change = current.top1Share - previous.top1Share;
      getRow(current.Entity, current.Year).top1ShareChange = change;
    }
  });

  return Array.from(rowMap.values()).sort((a, b) => a.Year - b.Year || d3.ascending(a.Entity, b.Entity));
}

function setupMeasureDropdowns() {
  setupMeasureDropdown("#measureLeftDropdown", appState.selections.leftMeasure);
  setupMeasureDropdown("#measureRightDropdown", appState.selections.rightMeasure);
  setupMeasureDropdown("#mapMeasureDropdown", appState.selections.mapMeasure);
}

function setupMeasureDropdown(selector, selectedKey) {
  const dropdown = d3.select(selector);
  dropdown
    .selectAll("option")
    .data(MEASURE_OPTIONS)
    .join("option")
    .attr("value", d => d)
    .text(d => MEASURES[d].label);

  dropdown.property("value", selectedKey);
}

function setupGlobalYearDropdown(years) {
  const dropdown = d3.select("#globalYearDropdown");
  dropdown
    .selectAll("option")
    .data(["latest", ...years])
    .join("option")
    .attr("value", d => d)
    .text(d => (d === "latest" ? "Latest year" : d));
}

function setupCountrySearchDatalist() {
  const options = d3.select("#countrySearchList")
    .selectAll("option")
    .data(appState.countryNames)
    .join("option");

  options.attr("value", d => d);
}

function bindControlEvents() {
  d3.select("#measureLeftDropdown").on("change", event => {
    appState.selections.leftMeasure = event.target.value;
    syncUrlState();
    renderDashboard();
  });

  d3.select("#measureRightDropdown").on("change", event => {
    appState.selections.rightMeasure = event.target.value;
    syncUrlState();
    renderDashboard();
  });

  d3.select("#mapMeasureDropdown").on("change", event => {
    appState.selections.mapMeasure = event.target.value;
    syncUrlState();
    renderDashboard();
  });

  d3.select("#yearScopeAllCheckbox").on("change", event => {
    if (!event.target.checked) {
      syncControlsFromState();
      return;
    }
    setYearScope("all");
    syncControlsFromState();
    syncUrlState();
    renderDashboard();
  });

  d3.select("#yearScopeSingleCheckbox").on("change", event => {
    if (!event.target.checked) {
      syncControlsFromState();
      return;
    }
    setYearScope("single");
    syncControlsFromState();
    syncUrlState();
    renderDashboard();
  });

  d3.select("#globalYearDropdown").on("change", event => {
    const selectedValue = event.target.value;
    if (appState.selections.yearScope === "single" && selectedValue === "latest") {
      appState.selections.year = getDefaultLatestYear(appState.mergedYears);
      syncControlsFromState();
    } else {
      appState.selections.year = selectedValue;
    }
    syncUrlState();
    renderDashboard();
  });

  d3.select("#resetViewButton").on("click", () => {
    appState.selections = buildInitialSelections(appState.mergedYears, true);
    appState.mapTransform = d3.zoomIdentity;
    appState.brushSelection = null;
    syncControlsFromState();
    syncUrlState();
    renderDashboard();
  });

  d3.select("#countrySearchInput").on("input", debounce(event => {
    appState.selections.countryQuery = normalizeCountryQuery(event.target.value);
    syncUrlState();
    renderDashboard();
  }, 120));

  d3.selectAll(".tab-button").on("click", function () {
    const selectedPanel = this.dataset.panel;
    if (!PANEL_OPTIONS.includes(selectedPanel)) {
      return;
    }

    appState.selections.activePanel = selectedPanel;
    syncControlsFromState();
    syncUrlState();
    renderDashboard();
  });
}

function renderDashboard() {
  if (!appState) {
    return;
  }

  updatePanelVisibility();
  updatePanelTitles();

  if (appState.selections.activePanel === "income") {
    drawMeasureTimeChart("#income-chart", appState.selections.leftMeasure);
    return;
  }

  if (appState.selections.activePanel === "gdp") {
    drawMeasureTimeChart("#gdp-chart", appState.selections.rightMeasure);
    return;
  }

  if (appState.selections.activePanel === "merged") {
    renderMergedChart();
    return;
  }

  drawMapChart(appState.selections.mapMeasure);
}

function updatePanelVisibility() {
  d3.selectAll(".panel")
    .classed("is-active", false);

  d3.select(`#panel-${appState.selections.activePanel}`)
    .classed("is-active", true);

  d3.selectAll(".tab-button")
    .classed("is-active", false)
    .attr("aria-selected", "false");

  d3.select(`.tab-button[data-panel=\"${appState.selections.activePanel}\"]`)
    .classed("is-active", true)
    .attr("aria-selected", "true");
}

function updatePanelTitles() {
  const left = MEASURES[appState.selections.leftMeasure];
  const right = MEASURES[appState.selections.rightMeasure];
  const mapMeasure = MEASURES[appState.selections.mapMeasure];
  const scopeLabel = appState.selections.yearScope === "all"
    ? "all years"
    : `year ${appState.selections.year}`;
  const mapScopeLabel = appState.selections.yearScope === "all"
    ? "latest available"
    : `year ${appState.selections.year}`;
  const countryScopeLabel = appState.selections.countryQuery
    ? `, country contains \"${appState.selections.countryQuery}\"`
    : "";

  d3.select("#left-chart-title").text(`${left.label} by year (${scopeLabel}${countryScopeLabel})`);
  d3.select("#right-chart-title").text(`${right.label} by year (${scopeLabel}${countryScopeLabel})`);
  d3.select("#merged-chart-title").text(`${left.label} vs ${right.label} (${scopeLabel}${countryScopeLabel})`);
  d3.select("#map-chart-title").text(`${mapMeasure.label} map (${mapScopeLabel}${countryScopeLabel})`);
}

function drawMeasureTimeChart(containerSelector, measureKey) {
  const surface = createChartSurface(containerSelector, {
    top: CHART_MARGIN.top,
    right: CHART_MARGIN.right,
    bottom: CHART_MARGIN.bottom + CONTEXT_HEIGHT + 10,
    left: CHART_MARGIN.left
  });
  if (!surface) {
    return;
  }

  const measure = MEASURES[measureKey];
  const scopedRows = getScopedAndCountryFilteredRows();
  const data = scopedRows.filter(d => Number.isFinite(d[measureKey]));
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);

  if (sampledData.length === 0) {
    return;
  }

  const yearDomain = getSafeLinearDomain(d3.extent(sampledData, d => d.Year));
  const valueDomain = getSafeLinearDomain(d3.extent(sampledData, d => d[measureKey]));

  const xScale = d3.scaleLinear()
    .domain(yearDomain)
    .range([0, surface.innerWidth]);

  const yScale = d3.scaleLinear()
    .domain(valueDomain)
    .nice()
    .range([surface.innerHeight, 0]);

  const values = sampledData.map(d => d[measureKey]);
  const colorScale = createValueColorScale(measureKey, values);
  const radiusScale = d3.scaleSqrt()
    .domain(d3.extent(values))
    .range(TIME_CHART_RADIUS_RANGE);

  if (measure.colorType === "diverging") {
    radiusScale.domain(d3.extent(values.map(Math.abs)));
  }

  drawAxes({
    surface,
    xScale,
    yScale,
    xLabel: "Year",
    yLabel: measure.axisLabel,
    yTickFormat: measure.formatTick,
    xTickFormat: d3.format("d")
  });

  surface.chart.selectAll("circle")
    .data(sampledData)
    .join("circle")
    .attr("cx", d => xScale(d.Year))
    .attr("cy", d => yScale(d[measureKey]))
    .attr("r", d => {
      const value = measure.colorType === "diverging" ? Math.abs(d[measureKey]) : d[measureKey];
      return radiusScale(value);
    })
    .attr("fill", d => colorScale(d[measureKey]))
    .attr("opacity", 0.78)
    .attr("stroke", "#4b5563")
    .attr("stroke-width", 0.4)
    .on("mousemove", (event, d) => showTooltip(event, `
      <strong>${d.Entity}</strong><br/>
      Year: ${d.Year}<br/>
      ${measure.label}: ${measure.formatValue(d[measureKey])}
    `))
    .on("mouseleave", hideTooltip);

  // Add brush context area
  addBrushContext(surface, sampledData, measureKey, xScale);
}

function renderMergedChart() {
  const surface = createChartSurface("#merged-chart");
  if (!surface) {
    return;
  }

  const leftKey = appState.selections.leftMeasure;
  const rightKey = appState.selections.rightMeasure;
  const leftMeasure = MEASURES[leftKey];
  const rightMeasure = MEASURES[rightKey];

  const filteredByYear = getScopedAndCountryFilteredRows();

  const data = filteredByYear.filter(
    d => Number.isFinite(d[leftKey]) && Number.isFinite(d[rightKey])
  );
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);

  if (sampledData.length === 0) {
    return;
  }

  const xScale = d3.scaleLinear()
    .domain(getSafeLinearDomain(d3.extent(sampledData, d => d[leftKey])))
    .nice()
    .range([0, surface.innerWidth]);

  const yScale = d3.scaleLinear()
    .domain(getSafeLinearDomain(d3.extent(sampledData, d => d[rightKey])))
    .nice()
    .range([surface.innerHeight, 0]);

  const valuesForColor = sampledData.map(d => d[rightKey]);
  const colorScale = createValueColorScale(rightKey, valuesForColor);

  drawAxes({
    surface,
    xScale,
    yScale,
    xLabel: leftMeasure.axisLabel,
    yLabel: rightMeasure.axisLabel,
    yTickFormat: rightMeasure.formatTick,
    xTickFormat: leftMeasure.formatTick
  });

  surface.chart.selectAll("circle")
    .data(sampledData)
    .join("circle")
    .attr("cx", d => xScale(d[leftKey]))
    .attr("cy", d => yScale(d[rightKey]))
    .attr("r", MERGED_CHART_POINT_RADIUS)
    .attr("fill", d => colorScale(d[rightKey]))
    .attr("opacity", 0.75)
    .attr("stroke", "#374151")
    .attr("stroke-width", 0.35)
    .on("mousemove", (event, d) => showTooltip(event, `
      <strong>${d.Entity}</strong><br/>
      Year: ${d.Year}<br/>
      ${leftMeasure.label}: ${leftMeasure.formatValue(d[leftKey])}<br/>
      ${rightMeasure.label}: ${rightMeasure.formatValue(d[rightKey])}
    `))
    .on("mouseleave", hideTooltip);
}

function drawMapChart(measureKey) {
  const surface = createChartSurface("#map", { top: 8, right: 8, bottom: 8, left: 8 });
  if (!surface) {
    return;
  }

  const measure = MEASURES[measureKey];
  const countries = getCountriesFeatureCollection(appState.geoData);
  if (!countries || !Array.isArray(countries.features) || countries.features.length === 0) {
    return;
  }

  const projection = d3.geoMercator().fitSize([surface.innerWidth, surface.innerHeight], countries);
  const geoPath = d3.geoPath().projection(projection);
  const mapLayer = surface.chart.append("g").attr("class", "map-layer");

  const valuesByCountry = buildMeasureMapForYear(
    getCountryFilteredRows(appState.measureRows),
    measureKey,
    resolveMapYearSelection()
  );

  countries.features.forEach(feature => {
    const featureCode = typeof feature.id === "string" ? feature.id.toUpperCase() : null;
    const valueEntry =
      (featureCode ? valuesByCountry.byCode.get(featureCode) : undefined) ||
      valuesByCountry.byName.get(feature.properties.name);

    feature.properties.mapValue = valueEntry ? valueEntry.value : undefined;
    feature.properties.mapYear = valueEntry ? valueEntry.year : undefined;
  });

  const valueList = countries.features
    .map(feature => feature.properties.mapValue)
    .filter(value => Number.isFinite(value));

  const colorScale = createValueColorScale(measureKey, valueList);

  mapLayer.selectAll("path")
    .data(countries.features)
    .join("path")
    .attr("d", geoPath)
    .attr("fill", feature => {
      if (!Number.isFinite(feature.properties.mapValue)) {
        return "#e5e7eb";
      }
      return colorScale(feature.properties.mapValue);
    })
    .attr("stroke", "#c7d0dd")
    .attr("stroke-width", 0.6)
    .on("mousemove", (event, feature) => {
      const valueLabel = Number.isFinite(feature.properties.mapValue)
        ? measure.formatValue(feature.properties.mapValue)
        : "No data";
      const yearLabel = Number.isFinite(feature.properties.mapYear)
        ? feature.properties.mapYear
        : "-";
      const yearLabelTitle = appState.selections.yearScope === "all" ? "Latest year" : "Year";

      showTooltip(event, `
        <strong>${feature.properties.name}</strong><br/>
        ${measure.label}: ${valueLabel}<br/>
        ${yearLabelTitle}: ${yearLabel}
      `);
    })
    .on("mouseleave", hideTooltip);

  const zoomBehavior = d3.zoom()
    .scaleExtent(MAP_ZOOM_SCALE_EXTENT)
    .translateExtent([[0, 0], [surface.innerWidth, surface.innerHeight]])
    .extent([[0, 0], [surface.innerWidth, surface.innerHeight]])
    .on("zoom", event => {
      mapLayer.attr("transform", event.transform);
      appState.mapTransform = event.transform;
    });

  surface.svg
    .call(zoomBehavior)
    .call(zoomBehavior.transform, appState.mapTransform || d3.zoomIdentity);
}

function getCountriesFeatureCollection(geoData) {
  if (!geoData) {
    return null;
  }

  if (geoData.type === "FeatureCollection" && Array.isArray(geoData.features)) {
    return geoData;
  }

  if (geoData.type === "Topology" && geoData.objects && typeof topojson !== "undefined") {
    const objectKey = Object.keys(geoData.objects)[0];
    if (!objectKey) {
      return null;
    }
    return topojson.feature(geoData, geoData.objects[objectKey]);
  }

  return null;
}

function drawAxes({ surface, xScale, yScale, xLabel, yLabel, xTickFormat, yTickFormat }) {
  surface.chart.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${surface.innerHeight})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(xTickFormat))
    .append("text")
    .attr("x", surface.innerWidth / 2)
    .attr("y", 30)
    .attr("fill", "#111827")
    .attr("text-anchor", "middle")
    .text(xLabel);

  surface.chart.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(yTickFormat))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -surface.innerHeight / 2)
    .attr("y", -48)
    .attr("fill", "#111827")
    .attr("text-anchor", "middle")
    .text(yLabel);
}

function createValueColorScale(measureKey, values) {
  const measure = MEASURES[measureKey];
  const safeValues = values.filter(value => Number.isFinite(value));

  if (safeValues.length === 0) {
    return () => "#9ca3af";
  }

  if (measure.colorType === "diverging") {
    const maxAbs = d3.max(safeValues.map(value => Math.abs(value))) || 1;
    return d3.scaleSequential(measure.interpolator).domain([-maxAbs, maxAbs]);
  }

  let [minValue, maxValue] = d3.extent(safeValues);
  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }

  return d3.scaleSequential(measure.interpolator).domain([minValue, maxValue]);
}

function buildInitialSelections(years, forceDefaults = false) {
  const params = new URLSearchParams(window.location.search);
  const latestYear = getDefaultLatestYear(years);

  const leftMeasure = !forceDefaults && MEASURE_OPTIONS.includes(params.get("left"))
    ? params.get("left")
    : DEFAULT_SELECTIONS.leftMeasure;
  const rightMeasure = !forceDefaults && MEASURE_OPTIONS.includes(params.get("right"))
    ? params.get("right")
    : DEFAULT_SELECTIONS.rightMeasure;
  const mapMeasure = !forceDefaults && MEASURE_OPTIONS.includes(params.get("map"))
    ? params.get("map")
    : DEFAULT_SELECTIONS.mapMeasure;

  const requestedScope = forceDefaults ? null : params.get("scope");
  const yearScope = YEAR_SCOPE_OPTIONS.includes(requestedScope)
    ? requestedScope
    : DEFAULT_SELECTIONS.yearScope;

  const requestedYear = forceDefaults ? null : params.get("year");
  const parsedYear = +requestedYear;
  const validYear = Number.isFinite(parsedYear) && years.includes(parsedYear)
    ? parsedYear
    : latestYear;

  const requestedCountryQuery = forceDefaults ? "" : params.get("q");
  const countryQuery = normalizeCountryQuery(requestedCountryQuery);
  const requestedPanel = forceDefaults ? null : params.get("tab");
  const activePanel = PANEL_OPTIONS.includes(requestedPanel)
    ? requestedPanel
    : DEFAULT_SELECTIONS.activePanel;

  return {
    leftMeasure,
    rightMeasure,
    mapMeasure,
    yearScope,
    year: yearScope === "single" ? validYear : "latest",
    countryQuery,
    activePanel
  };
}

function syncControlsFromState() {
  d3.select("#measureLeftDropdown").property("value", appState.selections.leftMeasure);
  d3.select("#measureRightDropdown").property("value", appState.selections.rightMeasure);
  d3.select("#mapMeasureDropdown").property("value", appState.selections.mapMeasure);
  d3.select("#yearScopeAllCheckbox").property("checked", appState.selections.yearScope === "all");
  d3.select("#yearScopeSingleCheckbox").property("checked", appState.selections.yearScope === "single");
  d3.select("#countrySearchInput").property("value", appState.selections.countryQuery);
  d3.select("#globalYearDropdown")
    .property("value", appState.selections.year)
    .property("disabled", appState.selections.yearScope === "all");

  d3.selectAll(".tab-button")
    .classed("is-active", false)
    .attr("aria-selected", "false");

  d3.select(`.tab-button[data-panel=\"${appState.selections.activePanel}\"]`)
    .classed("is-active", true)
    .attr("aria-selected", "true");
}

function syncUrlState() {
  const params = new URLSearchParams();
  params.set("left", appState.selections.leftMeasure);
  params.set("right", appState.selections.rightMeasure);
  params.set("map", appState.selections.mapMeasure);
  params.set("scope", appState.selections.yearScope);
  params.set("tab", appState.selections.activePanel);
  if (appState.selections.countryQuery) {
    params.set("q", appState.selections.countryQuery);
  }

  if (appState.selections.yearScope === "single") {
    params.set("year", appState.selections.year);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function setYearScope(nextScope) {
  if (!YEAR_SCOPE_OPTIONS.includes(nextScope)) {
    return;
  }

  appState.selections.yearScope = nextScope;
  if (appState.selections.yearScope === "single" && appState.selections.year === "latest") {
    appState.selections.year = getDefaultLatestYear(appState.mergedYears);
  }
}

function getScopeFilteredRows(rows) {
  if (appState.selections.yearScope === "all") {
    // Apply brush filter if active
    if (appState.brushSelection) {
      const [startYear, endYear] = appState.brushSelection;
      return rows.filter(d => d.Year >= startYear && d.Year <= endYear);
    }
    return rows;
  }

  return rows.filter(d => d.Year === +appState.selections.year);
}

function getCountryFilteredRows(rows) {
  const query = appState.selections.countryQuery;
  if (!query) {
    return rows;
  }

  const normalizedQuery = query.toLowerCase();
  return rows.filter(d => String(d.Entity).toLowerCase().includes(normalizedQuery));
}

function getScopedAndCountryFilteredRows() {
  return getCountryFilteredRows(getScopeFilteredRows(appState.measureRows));
}

function normalizeCountryQuery(value) {
  return String(value || "").trim();
}

function resolveMapYearSelection() {
  if (appState.selections.yearScope === "all") {
    return "latest";
  }
  return +appState.selections.year;
}

function getDefaultLatestYear(years) {
  return years.length > 0 ? years[years.length - 1] : "latest";
}

function getSafeLinearDomain(extent) {
  let [minValue, maxValue] = extent;

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return [0, 1];
  }

  if (minValue === maxValue) {
    const padding = Math.abs(minValue || 1) * 0.1;
    minValue -= padding;
    maxValue += padding;
  }

  return [minValue, maxValue];
}

function buildLatestMeasureMap(rows, measureKey) {
  const latestByName = new Map();
  const latestByCode = new Map();

  rows.forEach(row => {
    const value = row[measureKey];
    if (!Number.isFinite(value)) {
      return;
    }

    const existingByName = latestByName.get(row.Entity);
    if (!existingByName || row.Year > existingByName.year) {
      const entry = {
        year: row.Year,
        value
      };

      latestByName.set(row.Entity, entry);

      if (row.Code) {
        latestByCode.set(row.Code.toUpperCase(), entry);
      }
    }
  });

  return {
    byName: latestByName,
    byCode: latestByCode
  };
}

function buildMeasureMapForYear(rows, measureKey, yearSelection) {
  if (yearSelection === "latest") {
    return buildLatestMeasureMap(rows, measureKey);
  }

  const year = +yearSelection;
  const mapForYearByName = new Map();
  const mapForYearByCode = new Map();

  rows.forEach(row => {
    if (row.Year !== year) {
      return;
    }

    const value = row[measureKey];
    if (!Number.isFinite(value)) {
      return;
    }

    const entry = {
      year: row.Year,
      value
    };

    mapForYearByName.set(row.Entity, entry);
    if (row.Code) {
      mapForYearByCode.set(row.Code.toUpperCase(), entry);
    }
  });

  return {
    byName: mapForYearByName,
    byCode: mapForYearByCode
  };
}

function createChartSurface(containerSelector, margin = CHART_MARGIN) {
  const container = document.querySelector(containerSelector);
  if (!container) {
    return null;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;

  d3.select(containerSelector).selectAll("svg").remove();

  const svg = d3.select(containerSelector)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const chart = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  return {
    svg,
    chart,
    innerWidth,
    innerHeight
  };
}

function limitDataPoints(data, maxPoints) {
  if (data.length <= maxPoints) {
    return data;
  }

  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function showTooltip(event, html) {
  d3.select("#tooltip")
    .style("display", "block")
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY + 10}px`)
    .html(html);
}

function hideTooltip() {
  d3.select("#tooltip").style("display", "none");
}

function addBrushContext(surface, data, measureKey, xScale) {
  const measure = MEASURES[measureKey];
  
  // Create context area below main chart
  const contextY = surface.innerHeight + 30;
  const context = surface.chart.append('g')
    .attr('class', 'context')
    .attr('transform', `translate(0, ${contextY})`);

  // Create simplified line chart for context
  const contextYScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d[measureKey]))
    .range([CONTEXT_HEIGHT, 0]);

  // Group data by entity for line chart
  const dataByEntity = d3.groups(data, d => d.Entity);
  const line = d3.line()
    .x(d => xScale(d.Year))
    .y(d => contextYScale(d[measureKey]))
    .curve(d3.curveMonotoneX);

  // Draw simplified lines for context
  context.selectAll('.context-line')
    .data(dataByEntity.slice(0, 20)) // Limit to avoid performance issues
    .join('path')
    .attr('class', 'context-line')
    .attr('d', ([, values]) => line(values.filter(d => Number.isFinite(d[measureKey]))))
    .attr('stroke', '#9ca3af')
    .attr('stroke-width', 0.5)
    .attr('fill', 'none')
    .attr('opacity', 0.3);

  // Add context axis
  context.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0, ${CONTEXT_HEIGHT})`)
    .call(d3.axisBottom(xScale).ticks(4).tickFormat(d3.format('d')));

  // Create brush group
  const brushG = context.append('g')
    .attr('class', 'brush x-brush');

  // Initialize brush component
  const brush = d3.brushX()
    .extent([[0, 0], [surface.innerWidth, CONTEXT_HEIGHT]])
    .on('brush', function(event) {
      const selection = event.selection;
      if (selection) {
        const [x0, x1] = selection;
        const yearRange = [xScale.invert(x0), xScale.invert(x1)];
        brushed(yearRange);
      }
    })
    .on('end', function(event) {
      const selection = event.selection;
      if (!selection) {
        brushed(null);
      }
    });

  // Apply brush to brush group
  brushG.call(brush);

  // Set initial brush selection if exists
  if (appState.brushSelection) {
    const [startYear, endYear] = appState.brushSelection;
    const x0 = xScale(startYear);
    const x1 = xScale(endYear);
    brushG.call(brush.move, [x0, x1]);
  }
}

function brushed(yearRange) {
  appState.brushSelection = yearRange;
  
  // Only update if in "all years" mode
  if (appState.selections.yearScope === "all") {
    // Use debounced update to prevent excessive redraws
    debouncedBrushUpdate();
  }
}

// Create debounced version of brush update
const debouncedBrushUpdate = debounce(() => {
  if (appState.selections.activePanel === "income" || appState.selections.activePanel === "gdp") {
    updateTimeChartData();
  } else if (appState.selections.activePanel === "merged") {
    updateMergedChartData();
  }
}, 50);

function updateTimeChartData() {
  const containerSelector = appState.selections.activePanel === "income" ? "#income-chart" : "#gdp-chart";
  const measureKey = appState.selections.activePanel === "income" 
    ? appState.selections.leftMeasure 
    : appState.selections.rightMeasure;
  
  const surface = d3.select(containerSelector).select("svg").select("g");
  if (surface.empty()) return;
  
  const measure = MEASURES[measureKey];
  const scopedRows = getScopedAndCountryFilteredRows();
  const data = scopedRows.filter(d => Number.isFinite(d[measureKey]));
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);
  
  if (sampledData.length === 0) return;
  
  const yearDomain = getSafeLinearDomain(d3.extent(sampledData, d => d.Year));
  const valueDomain = getSafeLinearDomain(d3.extent(sampledData, d => d[measureKey]));
  
  // Get the chart dimensions from the container
  const container = document.querySelector(containerSelector);
  const width = container.clientWidth;
  const height = container.clientHeight;
  const margin = {
    top: CHART_MARGIN.top,
    right: CHART_MARGIN.right,
    bottom: CHART_MARGIN.bottom + CONTEXT_HEIGHT + 10,
    left: CHART_MARGIN.left
  };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);
  
  const xScale = d3.scaleLinear()
    .domain(yearDomain)
    .range([0, innerWidth]);
    
  const yScale = d3.scaleLinear()
    .domain(valueDomain)
    .nice()
    .range([innerHeight, 0]);
  
  const values = sampledData.map(d => d[measureKey]);
  const colorScale = createValueColorScale(measureKey, values);
  const radiusScale = d3.scaleSqrt()
    .domain(d3.extent(values))
    .range(TIME_CHART_RADIUS_RANGE);
    
  if (measure.colorType === "diverging") {
    radiusScale.domain(d3.extent(values.map(Math.abs)));
  }
  
  // Update x-axis to reflect brushed time range
  surface.select(".axis")
    .filter(function() { return d3.select(this).attr("transform").includes(`translate(0,${innerHeight})`); })
    .transition().duration(200)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format("d")));
  
  // Update y-axis if data domain changed
  surface.select(".axis")
    .filter(function() { return !d3.select(this).attr("transform").includes("translate"); })
    .transition().duration(200)
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(measure.formatTick));
  
  // Update circles without redrawing axes or brush context
  surface.selectAll("circle")
    .data(sampledData, d => `${d.Entity}-${d.Year}`)
    .join(
      enter => enter.append("circle")
        .attr("cx", d => xScale(d.Year))
        .attr("cy", d => yScale(d[measureKey]))
        .attr("r", 0)
        .attr("fill", d => colorScale(d[measureKey]))
        .attr("opacity", 0)
        .attr("stroke", "#4b5563")
        .attr("stroke-width", 0.4)
        .call(enter => enter.transition().duration(200)
          .attr("r", d => {
            const value = measure.colorType === "diverging" ? Math.abs(d[measureKey]) : d[measureKey];
            return radiusScale(value);
          })
          .attr("opacity", 0.78)
        ),
      update => update
        .call(update => update.transition().duration(200)
          .attr("cx", d => xScale(d.Year))
          .attr("cy", d => yScale(d[measureKey]))
          .attr("r", d => {
            const value = measure.colorType === "diverging" ? Math.abs(d[measureKey]) : d[measureKey];
            return radiusScale(value);
          })
          .attr("fill", d => colorScale(d[measureKey]))
        ),
      exit => exit.call(exit => exit.transition().duration(200)
        .attr("r", 0)
        .attr("opacity", 0)
        .remove()
      )
    )
    .on("mousemove", (event, d) => showTooltip(event, `
      <strong>${d.Entity}</strong><br/>
      Year: ${d.Year}<br/>
      ${measure.label}: ${measure.formatValue(d[measureKey])}
    `))
    .on("mouseleave", hideTooltip);
}

function updateMergedChartData() {
  const surface = d3.select("#merged-chart").select("svg").select("g");
  if (surface.empty()) return;
  
  const leftKey = appState.selections.leftMeasure;
  const rightKey = appState.selections.rightMeasure;
  const leftMeasure = MEASURES[leftKey];
  const rightMeasure = MEASURES[rightKey];
  
  const filteredByYear = getScopedAndCountryFilteredRows();
  const data = filteredByYear.filter(
    d => Number.isFinite(d[leftKey]) && Number.isFinite(d[rightKey])
  );
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);
  
  if (sampledData.length === 0) return;
  
  // Get the chart dimensions from the container
  const container = document.querySelector("#merged-chart");
  const width = container.clientWidth;
  const height = container.clientHeight;
  const innerWidth = Math.max(10, width - CHART_MARGIN.left - CHART_MARGIN.right);
  const innerHeight = Math.max(10, height - CHART_MARGIN.top - CHART_MARGIN.bottom);
  
  const xScale = d3.scaleLinear()
    .domain(getSafeLinearDomain(d3.extent(sampledData, d => d[leftKey])))
    .nice()
    .range([0, innerWidth]);
    
  const yScale = d3.scaleLinear()
    .domain(getSafeLinearDomain(d3.extent(sampledData, d => d[rightKey])))
    .nice()
    .range([innerHeight, 0]);
  
  const valuesForColor = sampledData.map(d => d[rightKey]);
  const colorScale = createValueColorScale(rightKey, valuesForColor);
  
  // Update both axes to reflect new data ranges
  surface.select(".axis")
    .filter(function() { return d3.select(this).attr("transform").includes(`translate(0,${innerHeight})`); })
    .transition().duration(200)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(leftMeasure.formatTick));
  
  surface.select(".axis")
    .filter(function() { return !d3.select(this).attr("transform").includes("translate"); })
    .transition().duration(200)
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(rightMeasure.formatTick));
  
  // Update circles without redrawing axes
  surface.selectAll("circle")
    .data(sampledData, d => `${d.Entity}-${d.Year}`)
    .join(
      enter => enter.append("circle")
        .attr("cx", d => xScale(d[leftKey]))
        .attr("cy", d => yScale(d[rightKey]))
        .attr("r", 0)
        .attr("fill", d => colorScale(d[rightKey]))
        .attr("opacity", 0)
        .attr("stroke", "#374151")
        .attr("stroke-width", 0.35)
        .call(enter => enter.transition().duration(200)
          .attr("r", MERGED_CHART_POINT_RADIUS)
          .attr("opacity", 0.75)
        ),
      update => update
        .call(update => update.transition().duration(200)
          .attr("cx", d => xScale(d[leftKey]))
          .attr("cy", d => yScale(d[rightKey]))
          .attr("fill", d => colorScale(d[rightKey]))
        ),
      exit => exit.call(exit => exit.transition().duration(200)
        .attr("r", 0)
        .attr("opacity", 0)
        .remove()
      )
    )
    .on("mousemove", (event, d) => showTooltip(event, `
      <strong>${d.Entity}</strong><br/>
      Year: ${d.Year}<br/>
      ${leftMeasure.label}: ${leftMeasure.formatValue(d[leftKey])}<br/>
      ${rightMeasure.label}: ${rightMeasure.formatValue(d[rightKey])}
    `))
    .on("mouseleave", hideTooltip);
}

function debounce(fn, wait) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), wait);
  };
}
