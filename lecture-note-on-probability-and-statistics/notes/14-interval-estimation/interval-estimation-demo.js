(async () => {
	{
		const svg = d3.select("#ci-left");
		const xScale = d3.scaleLinear().domain([-3, 3]).range([20, 260]);
		const yScale = d3.scaleLinear().domain([0, 0.45]).range([170, 30]);
		const pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
		const curveData = d3.range(-3, 3.001, 0.05).map(x => [x, pdf(x)]);
		const cL = -1.5;
		const cU = 1.5;
		const centralData = curveData.filter(d => d[0] >= cL && d[0] <= cU);
		const leftTailData = curveData.filter(d => d[0] <= cL);
		const rightTailData = curveData.filter(d => d[0] >= cU);

		const areaGen = d3.area()
			.x(d => xScale(d[0]))
			.y0(yScale(0))
			.y1(d => yScale(d[1]))
			.curve(d3.curveBasis);
		const lineGen = d3.line()
			.x(d => xScale(d[0]))
			.y(d => yScale(d[1]))
			.curve(d3.curveBasis);

		svg.append("path")
			.attr("d", areaGen(centralData))
			.attr("fill", "rgba(44,110,166,0.18)");
		svg.append("path")
			.attr("d", areaGen(leftTailData))
			.attr("fill", "rgba(194,91,42,0.22)");
		svg.append("path")
			.attr("d", areaGen(rightTailData))
			.attr("fill", "rgba(194,91,42,0.22)");
		svg.append("path")
			.attr("d", lineGen(curveData))
			.attr("fill", "none")
			.attr("stroke", "#2c6ea6")
			.attr("stroke-width", 2);

		svg.append("line")
			.attr("x1", 15)
			.attr("y1", 170)
			.attr("x2", 265)
			.attr("y2", 170)
			.attr("stroke", "#666")
			.attr("stroke-width", 1);
		svg.append("polygon")
			.attr("points", "270,170 262,166 262,174")
			.attr("fill", "#666");

		svg.append("line")
			.attr("x1", xScale(cL))
			.attr("y1", 170)
			.attr("x2", xScale(cL))
			.attr("y2", yScale(pdf(cL)))
			.attr("stroke", "#666")
			.attr("stroke-width", 1)
			.attr("stroke-dasharray", "3,2");
		svg.append("line")
			.attr("x1", xScale(cU))
			.attr("y1", 170)
			.attr("x2", xScale(cU))
			.attr("y2", yScale(pdf(cU)))
			.attr("stroke", "#666")
			.attr("stroke-width", 1)
			.attr("stroke-dasharray", "3,2");

		texFO(svg, xScale(cL), 188, 40, 18, "\\(c_L\\)", { anchor: "center", size: "13px", color: "#333" });
		texFO(svg, xScale(cU), 188, 40, 18, "\\(c_U\\)", { anchor: "center", size: "13px", color: "#333" });
		texFO(svg, 145, 100, 80, 22, "\\(1 - \\alpha\\)", { anchor: "center", size: "14px", color: "#1d4f7a" });
		texFO(svg, 49, 188, 40, 18, "\\(\\alpha/2\\)", { anchor: "center", size: "11px", color: "#8a3d1f" });
		texFO(svg, 241, 188, 40, 18, "\\(\\alpha/2\\)", { anchor: "center", size: "11px", color: "#8a3d1f" });
		texFO(svg, 272, 186, 20, 18, "\\(T\\)", { anchor: "center", size: "13px", color: "#666" });

		await typesetSvg(svg);
	}

	{
		const svg = d3.select("#ci-right");

		svg.append("line")
			.attr("x1", 15)
			.attr("y1", 100)
			.attr("x2", 265)
			.attr("y2", 100)
			.attr("stroke", "#666")
			.attr("stroke-width", 1);
		svg.append("polygon")
			.attr("points", "270,100 262,96 262,104")
			.attr("fill", "#666");

		svg.append("line")
			.attr("x1", 90)
			.attr("y1", 100)
			.attr("x2", 220)
			.attr("y2", 100)
			.attr("stroke", "rgba(44,110,166,0.4)")
			.attr("stroke-width", 12)
			.attr("stroke-linecap", "round");

		svg.append("line")
			.attr("x1", 90)
			.attr("y1", 86)
			.attr("x2", 90)
			.attr("y2", 114)
			.attr("stroke", "#1d4f7a")
			.attr("stroke-width", 2);
		svg.append("line")
			.attr("x1", 220)
			.attr("y1", 86)
			.attr("x2", 220)
			.attr("y2", 114)
			.attr("stroke", "#1d4f7a")
			.attr("stroke-width", 2);

		svg.append("line")
			.attr("x1", 155)
			.attr("y1", 80)
			.attr("x2", 155)
			.attr("y2", 120)
			.attr("stroke", "#c25b2a")
			.attr("stroke-width", 1.5)
			.attr("stroke-dasharray", "2,2");
		svg.append("circle")
			.attr("cx", 155)
			.attr("cy", 100)
			.attr("r", 5)
			.attr("fill", "#c25b2a")
			.attr("stroke", "white")
			.attr("stroke-width", 1.5);

		texFO(svg, 90, 135, 30, 18, "\\(L\\)", { anchor: "center", size: "13px", color: "#1d4f7a" });
		texFO(svg, 220, 135, 30, 18, "\\(U\\)", { anchor: "center", size: "13px", color: "#1d4f7a" });
		texFO(svg, 155, 68, 34, 22, "\\(\\theta_0\\)", { anchor: "center", size: "15px", color: "#8a3d1f" });
		texFO(svg, 272, 105, 20, 18, "\\(\\theta\\)", { anchor: "center", size: "13px", color: "#666" });

		await typesetSvg(svg);
	}
})();
