document.addEventListener('DOMContentLoaded', function() {
    // Set up dimensions and margins
    const margin = { left: 80, right: 150, top: 50, bottom: 100 };
    const width = 1200 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    // Create SVG container
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
        .attr("y", -margin.left + 10)
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

        // Get unique workstation IDs
        const allWorkstations = Array.from(new Set(
            formattedData.flatMap(d => d.workstations.map(w => w.workstation))
        )).sort();

        // Populate workstation filter
        const workstationFilter = d3.select("#workstationFilter");
        allWorkstations.forEach(ws => {
            workstationFilter.append("option")
                .attr("value", ws)
                .text(`Workstation ${ws}`);
        });

        // Set up scales
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.downtime)))])
            .range([0, width]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.occupancy)))])
            .range([height, 0]);

        const areaScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.finalProduction)))])
            .range([10 * Math.PI, 300 * Math.PI]);

        const colorScale = d3.scaleOrdinal()
            .domain(allWorkstations)
            .range(d3.schemePastel1);

        // Create axes
        const xAxisCall = d3.axisBottom(xScale)
            .tickFormat(d => `${d}h`);

        const yAxisCall = d3.axisLeft(yScale)
            .tickFormat(d => `${d}h`);

        // Add legend
        const legend = svg.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(${width + 20}, 20)`);

        const legendEntries = legend.selectAll(".legend-entry")
            .data(allWorkstations)
            .enter().append("g")
            .attr("class", "legend-entry")
            .attr("transform", (d, i) => `translate(0, ${i * 20})`);

        legendEntries.append("rect")
            .attr("width", 18)
            .attr("height", 18)
            .attr("fill", d => colorScale(d));

        legendEntries.append("text")
            .attr("x", 24)
            .attr("y", 9)
            .attr("dy", "0.35em")
            .text(d => `WS ${d}`);

        // Animation control variables
        let currentIndex = 0;
        let isPlaying = false;
        let animationInterval;
        let filteredData = formattedData;

        // Update function
        function update(transition = true) {
            const currentDateData = filteredData[currentIndex];
            const dateStr = currentDateData.date.toISOString().split('T')[0];

            

            // Update UI
            dateLabel.text(`Date: ${dateStr}`);
            d3.select("#dateValue").text(dateStr);
            d3.select("#dateSlider").property("value", currentIndex);

            // Filter data based on selected workstation
            const workstationFilterValue = d3.select("#workstationFilter").property("value");
            const displayData = workstationFilterValue === 'all' 
                ? currentDateData.workstations 
                : currentDateData.workstations.filter(w => w.workstation === workstationFilterValue);

            // Update axes
            xAxis.call(xAxisCall.scale(xScale));

            const yValues = displayData.map(d => d.occupancy);
            const yMin = d3.min(yValues);
            const yMax = d3.max(yValues);

            // Definir margen de espacio visual
            const marginY = 100;

            // Actualizar escala Y con dominio dinámico
            const yScale = d3.scaleLinear()
                .domain([Math.max(0, yMin - marginY), yMax + marginY])
                .range([height, 0]);

            // Actualizar eje Y
            yAxis.call(yAxisCall.scale(yScale));

            //yAxis.call(yAxisCall.scale(yScale));

            // Join data with circles
            const circles = svg.selectAll("circle")
                .data(displayData, d => d.workstation);

            // Exit
            circles.exit()
                .transition().duration(transition ? 500 : 0)
                .attr("r", 0)
                .remove();

            // Enter
            const enter = circles.enter()
                .append("circle")
                .attr("cx", d => xScale(d.downtime))
                .attr("cy", d => yScale(d.occupancy))
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

            // Update + merge
            enter.merge(circles)
                .transition().duration(transition ? 500 : 0)
                .attr("cx", d => xScale(d.downtime))
                .attr("cy", d => yScale(d.occupancy))
                .attr("r", d => Math.sqrt(areaScale(d.finalProduction) / Math.PI));
        }

        // Control functions
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

        // Event listeners for controls
        d3.select("#playPause").on("click", togglePlayPause);
        d3.select("#reset").on("click", reset);
        d3.select("#workstationFilter").on("change", applyFilter);
        d3.select("#dateSlider").on("input", handleSliderChange);

        // Initialize slider max based on data length
        d3.select("#dateSlider").attr("max", formattedData.length - 1);
        update(false);
    }).catch(function(error) {
        console.error("Error loading the data: ", error);
    });
});
