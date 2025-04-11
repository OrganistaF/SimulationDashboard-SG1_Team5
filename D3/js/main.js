// Define your custom colors for each workstation
const workstationColors = {
    workstation1: 'red',   // Workstation 1 = red
    workstation2: 'blue',  // Workstation 2 = blue
    workstation3: 'green',
    workstation4: 'purple',
    workstation5: 'orange',
    workstation6: 'yellow'
};

document.getElementById('workstationFilter').addEventListener('change', function () {
    const selectedWorkstation = this.value;
    const colorBox = document.getElementById('workstationColor');
    
    // If "all" is selected (or no color indicator is desired), set transparent
    if (selectedWorkstation === 'all') {
        colorBox.style.backgroundColor = 'transparent';
    } else {
        colorBox.style.backgroundColor = workstationColors[selectedWorkstation];
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Set up dimensions and margins for the main chart
    const margin = { left: 80, right: 150, top: 50, bottom: 100 };
    const width = 1200 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    // Create SVG container for the main chart
    const svg = d3.select("#chart-area")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top + 30})`);

    // Add axis groups
    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${height})`);

    const yAxis = svg.append("g")
        .attr("class", "y-axis");

    // Add axis labels
    svg.append("text")
        .attr("class", "axis-label x-axis-label")
        .attr("x", width / 2)
        .attr("y", height + margin.bottom - 40)
        .style("text-anchor", "middle")
        .text("Workstation Downtime (hours)");

    svg.append("text")
        .attr("class", "axis-label y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 30)
        .attr("x", -height / 2)
        .style("text-anchor", "middle")
        .text("Workstation Occupancy (hours)");

    // Add date label
    const dateLabel = svg.append("text")
        .attr("class", "date-label")
        .attr("x", 600)
        .attr("y", -60)
        .style("text-anchor", "end");

    // Tooltip
    const tooltip = d3.select("#tooltip");

    // Ensure additional visualization containers exist; if not, create them.
    if (d3.select("#info-table").empty()) {
        d3.select("body").append("div").attr("id", "info-table");
    }
    if (d3.select("#production-bar-chart").empty()) {
        d3.select("body").append("div").attr("id", "production-bar-chart");
    }
    if (d3.select("#defects-pie-chart").empty()) {
        d3.select("body").append("div").attr("id", "defects-pie-chart");
    }

    // Load and process data
    d3.json("data/data.json").then(function(rawData) {
        // Transform data structure
        const formattedData = rawData.map((dateEntry) => {
            const workstations = Object.entries(dateEntry.resultados["Workstations occupancy"]).map(([num, occupancy]) => {
                return {
                    workstation: num,
                    occupancy: occupancy,
                    downtime: dateEntry.resultados["Workstation downtime"][num],
                    finalProduction: dateEntry.resultados["Final production"],
                    rejectedProductions: dateEntry.resultados["Rejected productions"],
                    totalFixTime: dateEntry.resultados["Total fix time"],
                    bottleneckDelay: dateEntry.resultados["Average bottleneck delay"],
                    faultyRate: dateEntry.resultados["Faulty Products Rate"]
                };
            });

            return {
                date: new Date(dateEntry.fecha),
                // Also keep the original object for the table and other graphs
                resultados: dateEntry.resultados,
                workstations: workstations.filter(ws => 
                    ws.occupancy != null && 
                    ws.downtime != null &&
                    ws.finalProduction != null
                ).map(ws => ({
                    ...ws,
                    occupancy: +ws.occupancy,
                    downtime: +ws.downtime,
                    finalProduction: +ws.finalProduction
                }))
            };
        });

        // For the bar and line charts, use data with date formatted as "YYYY-MM-DD"
        formattedData.forEach(d => d.formattedDate = d.date.toISOString().split('T')[0]);

        // Get unique workstation IDs
        const allWorkstations = Array.from(new Set(
            formattedData.flatMap(d => d.workstations.map(w => w.workstation))
        )).sort();

        // Populate workstation filter (the select with id "workstationFilter")
        const workstationFilter = d3.select("#workstationFilter");
        allWorkstations.forEach(ws => {
            workstationFilter.append("option")
                .attr("value", ws)
                .text(`Workstation ${ws}`);
        });

        // --- Populate the indicator legend below the filter ---
        populateWorkstationIndicator(allWorkstations);

        // Set up scales for main chart (xScale: downtime; yScale: occupancy)
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.downtime)))])
            .range([0, width]);

        const areaScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.finalProduction)))])
            .range([10 * Math.PI, 300 * Math.PI]);

        const colorScale = d3.scaleOrdinal()
            .domain(allWorkstations)
            .range(d3.schemePastel1);

        // Create axes generators
        const xAxisCall = d3.axisBottom(xScale)
            .tickFormat(d => `${d}h`);

        const yAxisCall = d3.axisLeft();

        ///////////////////////////
        // Additional visualization functions
        ///////////////////////////

        // 1. Update information table (daily summary)
        function updateInfoTable(dayData, dateStr) {
            const cont = d3.select("#info-table");
            cont.html(""); // clear contents

            const resumen = dayData.resultados;
            const table = cont.append("table").attr("class", "table");
            const tbody = table.append("tbody");

            const rows = [
                ["Date", dateStr],
                ["Final Production", resumen["Final production"]],
                ["Rejected Units", resumen["Rejected productions"]],
                ["Accidents", resumen["Accidents"]],
                ["Defect Rate", (resumen["Faulty Products Rate"] * 100).toFixed(2) + "%"],
                ["Total Repair Time", resumen["Total fix time"].toFixed(2)],
                ["Average Delay (Bottleneck)", resumen["Average bottleneck delay"].toFixed(2)]
            ];

            rows.forEach(([label, value]) => {
                const tr = tbody.append("tr");
                tr.append("td").text(label);
                tr.append("td").text(value);
            });
        }

        // 2. Draw daily production bar chart
        function drawProductionBarChart(data) {
            const marginBar = { top: 20, right: 20, bottom: 60, left: 60 };
            const barWidth = 600 - marginBar.left - marginBar.right;
            const barHeight = 300 - marginBar.top - marginBar.bottom;

            d3.select("#production-bar-chart").html("");

            const svgBar = d3.select("#production-bar-chart")
                .append("svg")
                .attr("width", barWidth + marginBar.left + marginBar.right)
                .attr("height", barHeight + marginBar.top + marginBar.bottom)
                .append("g")
                .attr("transform", `translate(${marginBar.left},${marginBar.top})`);

            const xBar = d3.scaleBand()
                .domain(data.map(d => d.formattedDate))
                .range([0, barWidth])
                .padding(0.3);

            const yBar = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.resultados["Final production"])])
                .nice()
                .range([barHeight, 0]);

            svgBar.append("g")
                .call(d3.axisLeft(yBar));

            svgBar.append("g")
                .attr("transform", `translate(0, ${barHeight})`)
                .call(d3.axisBottom(xBar).tickFormat(d => d.slice(5)).tickSizeOuter(0))
                .selectAll("text")
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end");

            svgBar.selectAll("rect")
                .data(data)
                .enter().append("rect")
                .attr("x", d => xBar(d.formattedDate))
                .attr("y", d => yBar(d.resultados["Final production"]))
                .attr("width", xBar.bandwidth())
                .attr("height", d => barHeight - yBar(d.resultados["Final production"]))
                .attr("fill", "#69b3a2");

            svgBar.append("text")
                .attr("x", barWidth / 2)
                .attr("y", -10)
                .style("text-anchor", "middle")
                .text("Daily production");
        }

        // 3. Draw defects pie chart
        function updateDefectPieChart(dayData) {
            const dataPie = Object.entries(dayData.resultados["Deffect products pero work station"]);
            const pieWidth = 300, pieHeight = 300, radius = Math.min(pieWidth, pieHeight) / 2;
        
            const defectsContainer = d3.select("#defects-pie-chart");
            defectsContainer.html("");
        
            defectsContainer.append("h3")
                .attr("class", "chart-title")
                .text("Workstations defects demonstration");
        
            const chartLegendContainer = defectsContainer.append("div")
                .attr("class", "chart-legend-container")
                .style("display", "flex")
                .style("align-items", "center");
        
            const svgContainer = chartLegendContainer.append("div")
                .attr("class", "svg-container");
        
            const svgPie = svgContainer.append("svg")
                .attr("width", pieWidth)
                .attr("height", pieHeight)
                .style("background", "none")
                .style("border", "none")
                .append("g")
                .attr("transform", `translate(${pieWidth / 2}, ${pieHeight / 2})`);
                            
            const colorPie = d3.scaleOrdinal()
                .domain(dataPie.map(d => d[0]))
                .range(d3.schemeSet2);
        
            const legendContainer = chartLegendContainer.append("div")
                .attr("class", "legend-container")
                .style("margin-left", "20px");
        
            dataPie.forEach(([ws, value]) => {
                legendContainer.append("div")
                    .attr("class", "legend-item")
                    .html(`<span class="legend-color" style="display:inline-block;width:12px;height:12px;background:${colorPie(ws)};margin-right:6px;"></span>
                           WS ${ws}: ${value}`);
            });
        
            const pieGen = d3.pie().value(d => d[1]);
            const arcGen = d3.arc().innerRadius(0).outerRadius(radius);
        
            const arcs = svgPie.selectAll(".arc")
                .data(pieGen(dataPie))
                .enter().append("g")
                .attr("class", "arc");
        
            arcs.append("path")
                .attr("d", arcGen)
                .attr("fill", d => colorPie(d.data[0]));
        
            arcs.append("text")
                .attr("transform", d => `translate(${arcGen.centroid(d)})`)
                .attr("text-anchor", "middle")
                .attr("font-size", "10px")
                .text(d => d.data[1] > 0 ? `WS ${d.data[0]}: ${d.data[1]}` : "");
        }

        ///////////////////////////
        // Main update function (called when the day or filter changes)
        ///////////////////////////
        function update(transition = true) {
            const currentDayData = filteredData[currentIndex];
            const dateStr = currentDayData.date.toISOString().split('T')[0];

            dateLabel.text(`Date: ${dateStr}`);
            d3.select("#dateValue").text(dateStr);
            d3.select("#dateSlider").property("value", currentIndex);

            const workstationFilterValue = d3.select("#workstationFilter").property("value");
            const displayData = workstationFilterValue === 'all' 
                ? currentDayData.workstations 
                : currentDayData.workstations.filter(w => w.workstation === workstationFilterValue);

            xAxis.call(xAxisCall.scale(xScale));

            const yValues = displayData.map(d => d.occupancy);
            const yMin = d3.min(yValues);
            const yMax = d3.max(yValues);
            const marginY = 50;

            const yScaleDynamic = d3.scaleLinear()
                .domain([Math.max(0, yMin - marginY), yMax + marginY])
                .range([height, 0]);
            yAxisCall.scale(yScaleDynamic);
            yAxis.transition().duration(transition ? 500 : 0).call(yAxisCall);

            const circles = svg.selectAll("circle")
                .data(displayData, d => d.workstation);

            circles.exit()
                .transition().duration(transition ? 500 : 0)
                .attr("r", 0)
                .remove();

            const enter = circles.enter()
                .append("circle")
                .attr("cx", d => xScale(d.downtime))
                .attr("cy", d => yScaleDynamic(d.occupancy))
                .attr("r", 0)
                .attr("fill", d => colorScale(d.workstation))
                .on("mouseover", function(event, d) {
                    tooltip.transition()
                        .duration(200)
                        .style("opacity", 0.9);
                    tooltip.html(`
                        <strong>Workstation ${d.workstation}</strong><br>
                        Date: ${dateStr}<br>
                        Downtime: ${d.downtime.toFixed(2)}h<br>
                        Occupancy: ${d.occupancy.toFixed(2)}h<br>
                        Production: ${d.finalProduction}<br>
                        Rejects: ${d.rejectedProductions}
                    `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function() {
                    tooltip.transition()
                        .duration(500)
                        .style("opacity", 0);
                });

            enter.merge(circles)
                .transition().duration(transition ? 500 : 0)
                .attr("cx", d => xScale(d.downtime))
                .attr("cy", d => yScaleDynamic(d.occupancy))
                .attr("r", d => Math.sqrt(areaScale(d.finalProduction) / Math.PI));

            updateInfoTable(currentDayData, dateStr);
            updateDefectPieChart(currentDayData);
        }

        ///////////////////////////
        // Control functions for animation and filters
        ///////////////////////////
        let currentIndex = 0;
        let isPlaying = false;
        let animationInterval;
        let filteredData = formattedData;

        function togglePlayPause() {
            isPlaying = !isPlaying;
            d3.select("#playPause").text(isPlaying ? 'Pause' : 'Play');
            if (isPlaying) {
                animationInterval = setInterval(() => {
                    currentIndex = (currentIndex + 1) % filteredData.length;
                    update();
                    if (currentIndex === 0) clearInterval(animationInterval);
                }, 1000);
            } else {
                clearInterval(animationInterval);
            }
        }

        function reset() {
            currentIndex = 0;
            isPlaying = false;
            clearInterval(animationInterval);
            d3.select("#playPause").text('Play');
            update(false);
        }

        function applyFilter() {
            const workstation = d3.select("#workstationFilter").property("value");
            if (workstation === 'all') {
                filteredData = formattedData;
            } else {
                filteredData = formattedData.map(dateData => ({
                    date: dateData.date,
                    resultados: dateData.resultados,
                    workstations: dateData.workstations.filter(w => w.workstation === workstation)
                }));
            }
            currentIndex = Math.min(currentIndex, filteredData.length - 1);
            update(false);
        }

        function handleSliderChange() {
            currentIndex = +d3.select("#dateSlider").property("value");
            isPlaying = false;
            clearInterval(animationInterval);
            d3.select("#playPause").text('Play');
            update();
        }

        d3.select("#playPause").on("click", togglePlayPause);
        d3.select("#reset").on("click", reset);
        d3.select("#workstationFilter").on("change", applyFilter);
        d3.select("#dateSlider").on("input", handleSliderChange);

        d3.select("#dateSlider").attr("max", formattedData.length - 1);

        drawProductionBarChart(formattedData);
        update(false);
    }).catch(function(error) {
        console.error("Error loading the data: ", error);
    });
});

// --- This function populates the indicator legend below the filter box ---
function populateWorkstationIndicator(allWorkstations) {
    // Select the container (which must exist in your HTML)
    const indicatorContainer = d3.select("#workstationIndicator");
    indicatorContainer.html(""); // clear if any previous content

    // Style the container via inline styles (or use CSS classes)
    indicatorContainer.style("display", "flex")
                      .style("flex-wrap", "wrap")
                      .style("gap", "10px")
                      .style("margin-top", "10px");

    // For each workstation (assuming the value is something like "1", "2", etc.)
    allWorkstations.forEach(ws => {
        // Construct key string to find the color in your workstationColors object.
        const key = 'workstation' + ws;
        const color = workstationColors[key] || "#ccc"; // fallback if not defined

        indicatorContainer.append("div")
            .attr("class", "workstation-indicator")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "5px")
            .html(`<span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:50%;"></span>
                   <span>WS ${ws}</span>`);
    });
}
