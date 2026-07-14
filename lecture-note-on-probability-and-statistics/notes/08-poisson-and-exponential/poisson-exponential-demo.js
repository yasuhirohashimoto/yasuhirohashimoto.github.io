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
		.call(d3.axisBottom(pxScale).ticks(8).tickFormat(d3.format("d")))
		.call(styleAxis);
	pg.append("g").call(d3.axisLeft(pyScale).ticks(5)).call(styleAxis);
	pg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", PROB_COLORS.sub)
		.attr("font-style", "italic").text("k");
	pg.append("text")
		.attr("x", -m.left + 2).attr("y", -4)
		.attr("font-size", "13px").attr("fill", PROB_COLORS.sub)
		.text("P(X=k)");

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
		.call(d3.axisBottom(exScale).ticks(5))
		.call(styleAxis);
	eg.append("g").call(d3.axisLeft(eyScale).ticks(5)).call(styleAxis);
	eg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", PROB_COLORS.sub)
		.attr("font-style", "italic").text("x");
	eg.append("text")
		.attr("x", -m.left + 2).attr("y", -4)
		.attr("font-size", "13px").attr("fill", PROB_COLORS.sub)
		.text("f(x)");

	const expCurve = eg.append("path")
		.attr("fill", PROB_COLORS.D).attr("fill-opacity", 0.30)
		.attr("stroke", PROB_COLORS.D).attr("stroke-width", 2);
	const areaGen = d3.area()
		.x(d => exScale(d.x))
		.y0(eyScale(0))
		.y1(d => eyScale(d.y))
		.curve(d3.curveMonotoneX);

	function update(syncNum = true) {
		const lam = parseFloat(lamSlider.value);
		if (syncNum) lamNum.value = lam.toFixed(2);

		// Poisson bars
		const bw = Math.max(2, pxScale(1) - pxScale(0) - 2);
		const pdata = d3.range(0, nMax + 1).map(n => ({ n, p: poissonPmf(n, lam) }));
		const sel = barsGroup.selectAll("rect").data(pdata);
		sel.exit().remove();
		sel.enter().append("rect")
			.attr("fill", PROB_COLORS.DC)
			.attr("fill-opacity", 0.8)
			.attr("rx", 1.5)
			.merge(sel)
			.attr("x", d => pxScale(d.n) - bw/2)
			.attr("y", d => pyScale(Math.min(d.p, 0.7)))
			.attr("width", bw)
			.attr("height", d => ih - pyScale(Math.min(d.p, 0.7)));

		// Exponential curve
		const xs = d3.range(0, xMax + 0.01, 0.04).map(x => ({ x, y: lam * Math.exp(-lam * x) }));
		expCurve.datum(xs).attr("d", areaGen);
	}

	lamSlider.addEventListener("input", () => update(true));
	lamNum.addEventListener("input", () => {
		// 入力中は書き戻さない（toFixed でカーソルが飛ぶのを防ぐ）
		const v = parseFloat(lamNum.value);
		if (!isNaN(v)) {
			const clamped = Math.max(0.5, Math.min(5, v));
			lamSlider.value = clamped;
			update(false);
		}
	});
	lamNum.addEventListener("change", () => {
		// 確定時（blur / Enter）にのみ表示を正規化する
		const v = parseFloat(lamNum.value);
		if (!isNaN(v)) {
			lamSlider.value = Math.max(0.5, Math.min(5, v));
		}
		update(true);
	});

	update();
})();
