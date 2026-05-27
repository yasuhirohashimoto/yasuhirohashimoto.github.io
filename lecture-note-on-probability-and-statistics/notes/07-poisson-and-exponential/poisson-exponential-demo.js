(async () => {
	const lamSlider = document.getElementById("pe-lambda");
	const lamNum = document.getElementById("pe-lambda-num");

	const W = 360, H = 240;
	const m = { top: 16, right: 18, bottom: 36, left: 42 };
	const iw = W - m.left - m.right;
	const ih = H - m.top - m.bottom;

	// === Poisson panel ===
	const psvg = d3.select("#pe-poisson");
	const pg = psvg.append("g").attr("transform", `translate(${m.left}, ${m.top})`);
	const nMax = 15;
	const pxScale = d3.scaleLinear().domain([-0.5, nMax + 0.5]).range([0, iw]);
	const pyScale = d3.scaleLinear().domain([0, 0.7]).range([ih, 0]);

	pg.append("g")
		.attr("transform", `translate(0, ${ih})`)
		.call(d3.axisBottom(pxScale).ticks(8).tickFormat(d3.format("d")));
	pg.append("g").call(d3.axisLeft(pyScale).ticks(5));
	pg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", "#555")
		.attr("font-style", "italic").text("n");

	const barsGroup = pg.append("g");

	function poissonPmf(n, lam) {
		let p = Math.exp(-lam);
		for (let k = 1; k <= n; k++) p *= lam / k;
		return p;
	}

	// === Exponential panel ===
	const esvg = d3.select("#pe-exp");
	const eg = esvg.append("g").attr("transform", `translate(${m.left}, ${m.top})`);
	const xMax = 8;
	const exScale = d3.scaleLinear().domain([0, xMax]).range([0, iw]);
	const eyScale = d3.scaleLinear().domain([0, 5.2]).range([ih, 0]);

	eg.append("g")
		.attr("transform", `translate(0, ${ih})`)
		.call(d3.axisBottom(exScale).ticks(5));
	eg.append("g").call(d3.axisLeft(eyScale).ticks(5));
	eg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", "#555")
		.attr("font-style", "italic").text("x");

	const expCurve = eg.append("path").attr("fill", "rgba(217,121,4,0.30)").attr("stroke", "#d97904").attr("stroke-width", 1.6);
	const areaGen = d3.area()
		.x(d => exScale(d.x))
		.y0(eyScale(0))
		.y1(d => eyScale(d.y))
		.curve(d3.curveBasis);

	function update() {
		const lam = parseFloat(lamSlider.value);
		lamNum.value = lam.toFixed(2);

		// Poisson bars
		const bw = Math.max(2, pxScale(1) - pxScale(0) - 2);
		const pdata = d3.range(0, nMax + 1).map(n => ({ n, p: poissonPmf(n, lam) }));
		const sel = barsGroup.selectAll("rect").data(pdata);
		sel.exit().remove();
		sel.enter().append("rect")
			.attr("fill", "rgba(44,110,166,0.40)")
			.attr("stroke", "#2c6ea6")
			.attr("stroke-width", 1)
			.merge(sel)
			.attr("x", d => pxScale(d.n) - bw/2)
			.attr("y", d => pyScale(Math.min(d.p, 0.7)))
			.attr("width", bw)
			.attr("height", d => ih - pyScale(Math.min(d.p, 0.7)));

		// Exponential curve
		const xs = d3.range(0, xMax + 0.01, 0.04).map(x => ({ x, y: lam * Math.exp(-lam * x) }));
		expCurve.datum(xs).attr("d", areaGen);
	}

	lamSlider.addEventListener("input", update);
	lamNum.addEventListener("input", () => {
		const v = parseFloat(lamNum.value);
		if (!isNaN(v)) {
			const clamped = Math.max(0.5, Math.min(5, v));
			lamSlider.value = clamped;
			update();
		}
	});

	update();
})();
