console.log("Hello world");

const margin = { top: 40, right: 50, bottom: 50, left: 70 };
const width = 1000 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

d3.csv("data/income-share-top-1-before-tax-wid.csv").then(data => {

  console.log("Data loaded:", data);

  // ---- DATA PROCESSING ----
  data.forEach(d => {
    d.Year = +d.Year;
    d.Share = +d["Share (top 1%, before tax)"];
  });

  drawChart(data);

}).catch(error => {
  console.error("Error loading data:", error);
});

d3.csv("data/gdp-per-capita-worldbank.csv").then(data => {

  console.log("Data loaded:", data);

  // ---- DATA PROCESSING ----
  data.forEach(d => {
    d.Year = +d.Year;
    d.GDP = +d["GDP per capita"];
  });

  drawChart2(data);

}).catch(error => {
  console.error("Error loading data:", error);
});

Promise.all([
  d3.csv("data/income-share-top-1-before-tax-wid.csv"),
  d3.csv("data/gdp-per-capita-worldbank.csv")
]).then(([incomeData, gdpData]) => {

  incomeData.forEach(d => {
    d.Year = +d.Year;
    d.Share = +d["Share (top 1%, before tax)"];
  });

  gdpData.forEach(d => {
    d.Year = +d.Year;
    d.GDP = +d["GDP per capita"];
  });

  const mergedData = mergeDatasets(incomeData, gdpData);
  console.log("Merged data:", mergedData);

  drawMergedChart(mergedData);
});
  //COUNTRY STUFF
  
Promise.all([
  d3.json('data/africa.json'),
  d3.csv("data/gdp-per-capita-worldbank.csv")
]).then(data => {
  const geoData = data[0];
  const countryData = data[1];

  console.log("Sample CSV data:", countryData[0]); // Debug

  // Combine both datasets by adding GDP to the TopoJSON file
  geoData.objects.collection.geometries.forEach(d => {
    for (let i = 0; i < countryData.length; i++) {
      if (d.properties.name == countryData[i].Entity) {
        // FIX: Access countryData[i] and use "GDP per capita" column
        d.properties.GDP = +countryData[i]["GDP per capita"];
      }
    }
  });

  const projection = d3.geoMercator();
  const geoPath = d3.geoPath().projection(projection);
  
  // Convert compressed TopoJSON to GeoJSON format
  const countries = topojson.feature(geoData, geoData.objects.collection);

  // Scale of projection
  projection.fitSize([width, height], countries);
  
  const GDPExtent = d3.extent(geoData.objects.collection.geometries, d => d.properties.GDP);
  console.log("GDP Extent:", GDPExtent); // Debug - should not be [undefined, undefined]

  // Initialize scale
  const colorScale = d3.scaleLinear()
    .range(['#cfe2f2', '#0d306b'])
    .domain(GDPExtent)
    .interpolate(d3.interpolateHcl);

  // Create the SVG and chart elements
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

function mergeDatasets(incomeData, gdpData) {

  // Create lookup: "Entity-Year" → GDP value
  const gdpMap = new Map();

  gdpData.forEach(d => {
    gdpMap.set(`${d.Entity}-${d.Year}`, d.GDP);
  });

  // Merge GDP into income records
  const merged = incomeData
    .filter(d => gdpMap.has(`${d.Entity}-${d.Year}`)) // keep only matches
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

  // ---- SCALES ----
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

  // ---- AXES ----
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

  // ---- POINTS ----
  const circles = svg.selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.GDP))
    .attr("cy", d => yScale(d.Share))
    .attr("r", 5)
    .attr("fill", d => colorScale(d.Entity))
    .attr("opacity", 0.7);

  // ---- TOOLTIP ----
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

  // ---- SCALES ----
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

  // ---- AXES ----
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

  // ---- CIRCLES ----
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

  // ---- SCALES ----
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

  // ---- AXES ----
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

  // ---- CIRCLES ----
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