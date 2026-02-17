console.log("Hello world");

const margin = { top: 40, right: 50, bottom: 50, left: 70 };
const width = 1000 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;
const MAX_POINTS_PER_CHART = 3000;

Promise.all([
  d3.json('data/africa.json'),
  d3.csv("data/income-share-top-1-before-tax-wid.csv"),
  d3.csv("data/gdp-per-capita-worldbank.csv")
]).then(([geoData, incomeDataRaw, gdpDataRaw]) => {
  const incomeData = incomeDataRaw.map(d => ({
    ...d,
    Year: +d.Year,
    Share: +d["Share (top 1%, before tax)"]
  }));

  const gdpData = gdpDataRaw.map(d => ({
    ...d,
    Year: +d.Year,
    GDP: +d["GDP per capita"]
  }));

  drawChart(limitDataPoints(incomeData, MAX_POINTS_PER_CHART));
  drawChart2(limitDataPoints(gdpData, MAX_POINTS_PER_CHART));

  const mergedData = mergeDatasets(incomeData, gdpData);
  drawMergedChart(limitDataPoints(mergedData, MAX_POINTS_PER_CHART));

  const latestGDPByCountry = buildLatestGDPMap(gdpData);

  geoData.objects.collection.geometries.forEach(d => {
    d.properties.GDP = latestGDPByCountry.get(d.properties.name);
  });

  const projection = d3.geoMercator();
  const geoPath = d3.geoPath().projection(projection);
  
  const countries = topojson.feature(geoData, geoData.objects.collection);

  projection.fitSize([width, height], countries);
  
  const GDPExtent = d3.extent(geoData.objects.collection.geometries, d => d.properties.GDP);
  console.log("GDP Extent:", GDPExtent);

  const colorScale = d3.scaleLinear()
    .range(['#cfe2f2', '#0d306b'])
    .domain(GDPExtent)
    .interpolate(d3.interpolateHcl);

  const svg = d3.select('#map')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const chart = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const countryPath = chart.selectAll('.country')
    .data(countries.features)
    .join('path')
    .attr('class', 'country')
    .attr('d', geoPath)
    .attr('fill', d => {
      if (d.properties.GDP) {
        return colorScale(d.properties.GDP);
      } else {
        return 'url(#lightstripe)';
      }
    });

  countryPath.on('mousemove', (event, d) => {
    const GDP = d.properties.GDP ? 
      `<strong>$${d3.format(",")(d.properties.GDP)}</strong> GDP per capita` : 
      'No data available';

    d3.select('#tooltip')
      .style('display', 'block')
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY + 10) + 'px')
      .html(`<div class="tooltip-title">${d.properties.name}</div> <div>${GDP}</div>`);
  }).on('mouseleave', () => {
    d3.select('#tooltip').style('display', 'none');
  });

})
.catch(error => console.error(error));

function limitDataPoints(data, maxPoints) {
  if (data.length <= maxPoints) {
    return data;
  }

  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, index) => index % step === 0);
}

function buildLatestGDPMap(gdpData) {
  const latestByCountry = new Map();

  gdpData.forEach(d => {
    const existing = latestByCountry.get(d.Entity);
    if (!existing || d.Year > existing.Year) {
      latestByCountry.set(d.Entity, { Year: d.Year, GDP: d.GDP });
    }
  });

  return new Map(
    Array.from(latestByCountry.entries()).map(([country, value]) => [country, value.GDP])
  );
}

function mergeDatasets(incomeData, gdpData) {

  const gdpMap = new Map();

  gdpData.forEach(d => {
    gdpMap.set(`${d.Entity}-${d.Year}`, d.GDP);
  });

  const merged = incomeData
    .filter(d => gdpMap.has(`${d.Entity}-${d.Year}`))
    .map(d => ({
      Entity: d.Entity,
      Year: d.Year,
      Share: d.Share,
      GDP: gdpMap.get(`${d.Entity}-${d.Year}`)
    }));

  return merged;
}

function drawMergedChart(data) {

  const svg = d3.select("body")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.GDP))
    .nice()
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.Share))
    .nice()
    .range([height, 0]);

  const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
    .domain([...new Set(data.map(d => d.Entity))]);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("GDP per Capita (USD)");

  svg.append("g")
    .call(d3.axisLeft(yScale))
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Top 1% Income Share (%)");

  const circles = svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.GDP))
    .attr("cy", d => yScale(d.Share))
    .attr("r", 5)
    .attr("fill", d => colorScale(d.Entity))
    .attr("opacity", 0.7);

  circles
    .on("mouseover", (event, d) => {
      d3.select("#tooltip")
        .style("display", "block")
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px")
        .html(`
          <strong>${d.Entity}</strong><br/>
          Year: ${d.Year}<br/>
          GDP per capita: $${d3.format(",")(d.GDP)}<br/>
          Top 1% income share: ${d.Share}%
        `);
    })
    .on("mouseleave", () => {
      d3.select("#tooltip").style("display", "none");
    });
}

function drawChart(data) {

  const svg = d3.select("body")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.Year))
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([
      d3.min(data, d => d.Share),
      d3.max(data, d => d.Share)
    ])
    .nice()
    .range([height, 0]);

  const rScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.Share))
    .range([4, 20]);

  const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
    .domain([...new Set(data.map(d => d.Entity))]);

  const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
  const yAxis = d3.axisLeft(yScale);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Year");

  svg.append("g")
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Share of Income (Top 1%)");

  const circles = svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.Year))
    .attr("cy", d => yScale(d.Share))
    .attr("r", d => rScale(d.Share))
    .attr("fill", d => colorScale(d.Entity))
    .attr("opacity", 0.8)
    .attr("stroke", "gray")
    .attr("stroke-width", 1.5);
    
      circles
  .on("mouseover", (event, d) => {
    d3.select("#tooltip")
      .style("display", "block")
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY + 10) + "px")
      .html(`
        <strong>${d.Entity}</strong><br/>
        Year: ${d.Year}<br/>
        GDP per capita: $${d3.format(",")(d.GDP)}
      `);
  })
  .on("mouseleave", () => {
    d3.select("#tooltip").style("display", "none");
  });

}


function drawChart2(data) {

  const svg = d3.select("body")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.Year))
    .range([0, width]);

  const yScale = d3.scaleLinear()
    .domain([
      d3.min(data, d => d.GDP),
      d3.max(data, d => d.GDP)
    ])
    .nice()
    .range([height, 0]);

  const rScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.GDP))
    .range([4, 20]);

  const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
    .domain([...new Set(data.map(d => d.Entity))]);

  const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
  const yAxis = d3.axisLeft(yScale);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .append("text")
    .attr("x", width / 2)
    .attr("y", 40)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("Year");

  svg.append("g")
    .call(yAxis)
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("fill", "black")
    .attr("text-anchor", "middle")
    .text("GDP per Capita (USD)");

  const circles = svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.Year))
    .attr("cy", d => yScale(d.GDP))
    .attr("r", d => rScale(d.GDP))
    .attr("fill", d => colorScale(d.Entity))
    .attr("opacity", 0.8)
    .attr("stroke", "gray")
    .attr("stroke-width", 1.5);

  circles
  .on("mouseover", (event, d) => {
    d3.select("#tooltip")
      .style("display", "block")
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY + 10) + "px")
      .html(`
        <strong>${d.Entity}</strong><br/>
        Year: ${d.Year}<br/>
        GDP per capita: $${d3.format(",")(d.GDP)}
      `);
  })
  .on("mouseleave", () => {
    d3.select("#tooltip").style("display", "none");
  });

}