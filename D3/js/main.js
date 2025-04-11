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

    // Asegurarse de que existan los contenedores de las visualizaciones adicionales; si no, se crean.
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
                // Además, mantenemos el objeto original para la tabla y otros gráficos
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

        // Para el gráfico de barras y líneas usaremos los datos con la fecha en formato "YYYY-MM-DD"
        formattedData.forEach(d => d.formattedDate = d.date.toISOString().split('T')[0]);

        // Get unique workstation IDs
        const allWorkstations = Array.from(new Set(
            formattedData.flatMap(d => d.workstations.map(w => w.workstation))
        )).sort();

        // Populate workstation filter (en tu control HTML, el select tiene id "workstationFilter")
        const workstationFilter = d3.select("#workstationFilter");
        allWorkstations.forEach(ws => {
            workstationFilter.append("option")
                .attr("value", ws)
                .text(`Workstation ${ws}`);
        });

        // Set up scales for main chart (xScale: downtime; yScale: occupancy)
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.downtime)))])
            .range([0, width]);

        // La escala Y se actualizará dinámicamente en cada update() segun los datos del día actual.

        const areaScale = d3.scaleLinear()
            .domain([0, d3.max(formattedData.flatMap(d => d.workstations.map(w => w.finalProduction)))])
            .range([10 * Math.PI, 300 * Math.PI]);

        const colorScale = d3.scaleOrdinal()
            .domain(allWorkstations)
            .range(d3.schemePastel1);

        // Create axes generators
        const xAxisCall = d3.axisBottom(xScale)
            .tickFormat(d => `${d}h`);

        const yAxisCall = d3.axisLeft();  // se actualizará con la escala dinámica en update()

        ////////////////////////
        // Funciones adicionales de visualización
        ////////////////////////

        // 1. Función para actualizar la tabla de información (resumen del día)
        function updateInfoTable(dayData, dateStr) {
            const cont = d3.select("#info-table");
            cont.html(""); // limpiar contenido

            const resumen = dayData.resultados;
            const table = cont.append("table").attr("class", "table");
            const tbody = table.append("tbody");

            const rows = [
                ["Fecha", dateStr],
                ["Producción final", resumen["Final production"]],
                ["Rechazos", resumen["Rejected productions"]],
                ["Accidentes", resumen["Accidents"]],
                ["Tasa de defectos", (resumen["Faulty Products Rate"] * 100).toFixed(2) + "%"],
                ["Tiempo total de reparación", resumen["Total fix time"].toFixed(2)],
                ["Retraso promedio (cuello de botella)", resumen["Average bottleneck delay"].toFixed(2)]
            ];

            rows.forEach(([label, value]) => {
                const tr = tbody.append("tr");
                tr.append("td").text(label);
                tr.append("td").text(value);
            });
        }

        // 2. Función para dibujar el gráfico de barras de producción diaria
        function drawProductionBarChart(data) {
            // Configuración de dimensiones
            const marginBar = { top: 20, right: 20, bottom: 60, left: 60 };
            const barWidth = 600 - marginBar.left - marginBar.right;
            const barHeight = 300 - marginBar.top - marginBar.bottom;

            // Limpiar contenedor
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

            // Agregar título
            svgBar.append("text")
                .attr("x", barWidth / 2)
                .attr("y", -10)
                .style("text-anchor", "middle")
                .text("Producción Final Diaria");
        }

        function updateDefectPieChart(dayData) {
            const dataPie = Object.entries(dayData.resultados["Deffect products pero work station"]);
            const pieWidth = 300, pieHeight = 300, radius = Math.min(pieWidth, pieHeight) / 2;
        
            // Seleccionar y limpiar el contenedor del pie chart
            const defectsContainer = d3.select("#defects-pie-chart");
            defectsContainer.html("");
        
            // Agregar título
            defectsContainer.append("h3")
                .attr("class", "chart-title")
                .text("Demostración de defectos por Workstation");
        
            // Crear un contenedor flex para el gráfico y la leyenda
            const chartLegendContainer = defectsContainer.append("div")
                .attr("class", "chart-legend-container")
                .style("display", "flex")
                .style("align-items", "center");
        
            // Contenedor para el SVG (pie chart)
            const svgContainer = chartLegendContainer.append("div")
                .attr("class", "svg-container");
        
            // Crear el SVG para el pie chart
            const svgPie = svgContainer.append("svg")
            .attr("width", pieWidth)
            .attr("height", pieHeight)
            .style("background", "none")  // quitar fondo blanco
            .style("border", "none")        // quitar el recuadro o borde
            .append("g")
            .attr("transform", `translate(${pieWidth / 2}, ${pieHeight / 2})`);
                        
            // Definir la escala de colores para que sea consistente en el gráfico y la leyenda
            const colorPie = d3.scaleOrdinal()
                .domain(dataPie.map(d => d[0]))
                .range(d3.schemeSet2);
        
            // Contenedor para la leyenda, ubicado a la derecha del gráfico
            const legendContainer = chartLegendContainer.append("div")
                .attr("class", "legend-container")
                .style("margin-left", "20px");
        
            // Crear la leyenda: para cada par [workstation, value] agregar un bloque
            dataPie.forEach((item) => {
                const ws = item[0];
                const value = item[1];
                legendContainer.append("div")
                    .attr("class", "legend-item")
                    .html(`<span class="legend-color" style="display:inline-block;width:12px;height:12px;background:${colorPie(ws)};margin-right:6px;"></span>
                           WS ${ws}: ${value}`);
            });
        
            // Generadores para el pie chart
            const pieGen = d3.pie().value(d => d[1]);
            const arcGen = d3.arc().innerRadius(0).outerRadius(radius);
        
            // Dibujar los arcos del pie chart
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
        
        

        ////////////////////////
        // Update function principal (se ejecuta al cambiar día o filtro)
        ////////////////////////
        function update(transition = true) {
            const currentDayData = filteredData[currentIndex];
            const dateStr = currentDayData.date.toISOString().split('T')[0];

            // Actualizar elementos de UI
            dateLabel.text(`Date: ${dateStr}`);
            d3.select("#dateValue").text(dateStr);
            d3.select("#dateSlider").property("value", currentIndex);

            // Filtrar datos según la opción del filtro
            const workstationFilterValue = d3.select("#workstationFilter").property("value");
            const displayData = workstationFilterValue === 'all' 
                ? currentDayData.workstations 
                : currentDayData.workstations.filter(w => w.workstation === workstationFilterValue);

            // Actualizar eje X (fijo)
            xAxis.call(xAxisCall.scale(xScale));

            // Actualizar eje Y de manera dinámica basado en "occupancy" del día actual
            const yValues = displayData.map(d => d.occupancy);
            const yMin = d3.min(yValues);
            const yMax = d3.max(yValues);
            const marginY = 50; // margen extra para la escala

            const yScaleDynamic = d3.scaleLinear()
                .domain([Math.max(0, yMin - marginY), yMax + marginY])
                .range([height, 0]);
            yAxisCall.scale(yScaleDynamic);
            yAxis.transition().duration(transition ? 500 : 0).call(yAxisCall);

            // Unir datos con círculos en el gráfico principal
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

            // Actualizar visualizaciones adicionales basadas en el día actual
            updateInfoTable(currentDayData, dateStr);
            updateDefectPieChart(currentDayData);
        }

        ////////////////////////
        // Funciones de control de animación y filtros
        ////////////////////////
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

        // Asignar eventos para controles
        d3.select("#playPause").on("click", togglePlayPause);
        d3.select("#reset").on("click", reset);
        d3.select("#workstationFilter").on("change", applyFilter);
        d3.select("#dateSlider").on("input", handleSliderChange);

        // Configurar slider de fecha según la cantidad de días
        d3.select("#dateSlider").attr("max", formattedData.length - 1);

        // Dibujar el gráfico de barras de producción final para todos los días (una sola vez)
        drawProductionBarChart(formattedData);

        // Inicializar la visualización principal
        update(false);
    }).catch(function(error) {
        console.error("Error loading the data: ", error);
    });
});
