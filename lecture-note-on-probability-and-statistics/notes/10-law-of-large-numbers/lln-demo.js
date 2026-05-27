(() => {
	const xMax = 1000000;
	const target = 0.5;
	const targetPoints = 1500;
	const W = 520;
	const H = 340;
	const margin = { top: 18, right: 16, bottom: 42, left: 54 };
	const innerW = W - margin.left - margin.right;
	const innerH = H - margin.top - margin.bottom;

	function makeData() {
		const data = [];
		let sum = 0;
		const ratio = Math.pow(xMax, 1 / targetPoints);
		let nextPlot = 1;

		for (let n = 1; n <= xMax; n++) {
			sum += Math.random();
			if (n >= nextPlot) {
				data.push({ n, mean: sum / n });
				nextPlot = Math.max(n + 1, Math.floor(n * ratio) + 1);
			}
		}

		if (data[data.length - 1].n !== xMax) {
			data.push({ n: xMax, mean: sum / xMax });
		}
		return data;
	}

	function symlogTickFormat(d) {
		const y = d + target;
		const ad = Math.abs(d);
		if (ad < 1e-9) return "0.5";
		if (ad >= 0.1) return y.toFixed(1);
		if (ad >= 0.01) return y.toFixed(2);
		return y.toFixed(3);
	}

	function createChart({ id, yMode, showYLabel = true }) {
		const svg = d3.select(id);
		if (svg.empty()) return null;

		svg.selectAll("*").remove();

		const xScale = d3.scaleLog().domain([1, xMax]).range([0, innerW]);
		let yPosition;
		let yAxis;

		if (yMode === "symlog") {
			const yShifted = d3.scaleSymlog()
				.domain([-0.5, 0.5])
				.constant(0.001)
				.range([innerH, 0]);
			const yTickYs = [0, 0.4, 0.49, 0.499, 0.5, 0.501, 0.51, 0.6, 1];
			yPosition = y => yShifted(y - target);
			yAxis = d3.axisLeft(yShifted)
				.tickValues(yTickYs.map(y => y - target))
				.tickFormat(symlogTickFormat);
		} else {
			const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
			yPosition = yScale;
			yAxis = d3.axisLeft(yScale).ticks(5);
		}

		const g = svg.append("g")
			.attr("transform", `translate(${margin.left}, ${margin.top})`);

		g.append("g")
			.attr("transform", `translate(0, ${innerH})`)
			.call(d3.axisBottom(xScale).ticks(5, "~s"));
		g.append("g").call(yAxis);

		texFO(
			svg,
			margin.left + innerW / 2,
			margin.top + innerH + 26,
			140,
			18,
			"\\(n\\)（対数軸）",
			{ anchor: "topcenter", color: PROB_COLORS.text, size: "12px" }
		);

		if (showYLabel) {
			const yLabel = svg.append("g")
				.attr("transform", `translate(14, ${margin.top + innerH / 2}) rotate(-90)`);
			texFO(
				yLabel,
				0,
				0,
				54,
				18,
				"\\(\\bar{X}_n\\)",
				{ anchor: "center", color: PROB_COLORS.text, size: "12px" }
			);
		}

		g.append("line")
			.attr("x1", 0).attr("x2", innerW)
			.attr("y1", yPosition(target)).attr("y2", yPosition(target))
			.attr("stroke", PROB_COLORS.D).attr("stroke-width", 2);

		texFO(
			svg,
			margin.left + innerW - 66,
			margin.top + yPosition(target) - 20,
			66,
			18,
			"\\(E[X] = 0.5\\)",
			{ anchor: "topleft", color: PROB_COLORS.D, size: "11px" }
		);

		const clipId = `lln-clip-${id.replace("#", "")}`;
		svg.append("defs").append("clipPath")
			.attr("id", clipId)
			.append("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", innerW)
			.attr("height", innerH);

		const line = d3.line()
			.x(d => xScale(d.n))
			.y(d => yPosition(d.mean));

		const path = g.append("path")
			.attr("clip-path", `url(#${clipId})`)
			.attr("fill", "none")
			.attr("stroke", PROB_COLORS.DC)
			.attr("stroke-width", 1.2);

		return {
			svg,
			update(data) {
				path.datum(data).attr("d", line);
			},
		};
	}

	const charts = [
		createChart({ id: "#lln-svg", yMode: "linear" }),
		createChart({ id: "#lln-svg-c", yMode: "symlog", showYLabel: false }),
	].filter(Boolean);

	function runSimulation() {
		const data = makeData();
		charts.forEach(chart => chart.update(data));
	}

	runSimulation();
	typesetSvg(charts.map(chart => chart.svg));

	document.getElementById("lln-reroll").addEventListener("click", runSimulation);
})();
