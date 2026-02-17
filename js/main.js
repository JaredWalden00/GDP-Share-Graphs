const MAX_POINTS_PER_CHART = 1200;
const CHART_MARGIN = { top: 10, right: 16, bottom: 36, left: 62 };
const TIME_CHART_RADIUS_RANGE = [3.5, 11.5];
const MERGED_CHART_POINT_RADIUS = 4.8;

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

let appState = null;

Promise.all([
  d3.json("data/africa.json"),
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
      selections: {
        leftMeasure: "top1Share",
        rightMeasure: "gdpPerCapita",
        mapMeasure: "gdpPerCapita",
        mergedYear: "all"
      }
    };

    setupMeasureDropdowns();
    setupYearDropdown(mergedYears);
    bindControlEvents();
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
    getRow(d.Entity, d.Year).gdpPerCapita = d.gdpPerCapita;
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

function setupYearDropdown(years) {
  const dropdown = d3.select("#yearDropdown");
  dropdown
    .selectAll("option")
    .data(["all", ...years])
    .join("option")
    .attr("value", d => d)
    .text(d => (d === "all" ? "All years" : d));

  dropdown.property("value", appState.selections.mergedYear);
}

function bindControlEvents() {
  d3.select("#measureLeftDropdown").on("change", event => {
    appState.selections.leftMeasure = event.target.value;
    renderDashboard();
  });

  d3.select("#measureRightDropdown").on("change", event => {
    appState.selections.rightMeasure = event.target.value;
    renderDashboard();
  });

  d3.select("#mapMeasureDropdown").on("change", event => {
    appState.selections.mapMeasure = event.target.value;
    renderDashboard();
  });

  d3.select("#yearDropdown").on("change", event => {
    appState.selections.mergedYear = event.target.value;
    renderMergedChart();
  });
}

function renderDashboard() {
  if (!appState) {
    return;
  }

  updatePanelTitles();
  drawMeasureTimeChart("#income-chart", appState.selections.leftMeasure);
  drawMeasureTimeChart("#gdp-chart", appState.selections.rightMeasure);
  renderMergedChart();
  drawMapChart(appState.selections.mapMeasure);
}

function updatePanelTitles() {
  const left = MEASURES[appState.selections.leftMeasure];
  const right = MEASURES[appState.selections.rightMeasure];
  const mapMeasure = MEASURES[appState.selections.mapMeasure];

  d3.select("#left-chart-title").text(`${left.label} by year`);
  d3.select("#right-chart-title").text(`${right.label} by year`);
  d3.select("#merged-chart-title").text(`${left.label} vs ${right.label}`);
  d3.select("#map-chart-title").text(`Latest ${mapMeasure.label} map`);
}

function drawMeasureTimeChart(containerSelector, measureKey) {
  const surface = createChartSurface(containerSelector);
  if (!surface) {
    return;
  }

  const measure = MEASURES[measureKey];
  const data = appState.measureRows.filter(d => Number.isFinite(d[measureKey]));
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);

  if (sampledData.length === 0) {
    return;
  }

  const xScale = d3.scaleLinear()
    .domain(d3.extent(sampledData, d => d.Year))
    .range([0, surface.innerWidth]);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(sampledData, d => d[measureKey]))
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

  const filteredByYear = appState.selections.mergedYear === "all"
    ? appState.measureRows
    : appState.measureRows.filter(d => d.Year === +appState.selections.mergedYear);

  const data = filteredByYear.filter(
    d => Number.isFinite(d[leftKey]) && Number.isFinite(d[rightKey])
  );
  const sampledData = limitDataPoints(data, MAX_POINTS_PER_CHART);

  if (sampledData.length === 0) {
    return;
  }

  const xScale = d3.scaleLinear()
    .domain(d3.extent(sampledData, d => d[leftKey]))
    .nice()
    .range([0, surface.innerWidth]);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(sampledData, d => d[rightKey]))
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
  const countries = topojson.feature(appState.geoData, appState.geoData.objects.collection);
  const projection = d3.geoMercator().fitSize([surface.innerWidth, surface.innerHeight], countries);
  const geoPath = d3.geoPath().projection(projection);

  const latestValuesByCountry = buildLatestMeasureMap(appState.measureRows, measureKey);

  countries.features.forEach(feature => {
    const latest = latestValuesByCountry.get(feature.properties.name);
    feature.properties.mapValue = latest ? latest.value : undefined;
    feature.properties.mapYear = latest ? latest.year : undefined;
  });

  const valueList = countries.features
    .map(feature => feature.properties.mapValue)
    .filter(value => Number.isFinite(value));

  const colorScale = createValueColorScale(measureKey, valueList);

  surface.chart.selectAll("path")
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

      showTooltip(event, `
        <strong>${feature.properties.name}</strong><br/>
        ${measure.label}: ${valueLabel}<br/>
        Latest year: ${yearLabel}
      `);
    })
    .on("mouseleave", hideTooltip);
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

function buildLatestMeasureMap(rows, measureKey) {
  const latestMap = new Map();

  rows.forEach(row => {
    const value = row[measureKey];
    if (!Number.isFinite(value)) {
      return;
    }

    const existing = latestMap.get(row.Entity);
    if (!existing || row.Year > existing.year) {
      latestMap.set(row.Entity, {
        year: row.Year,
        value
      });
    }
  });

  return latestMap;
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

function debounce(fn, wait) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), wait);
  };
}
