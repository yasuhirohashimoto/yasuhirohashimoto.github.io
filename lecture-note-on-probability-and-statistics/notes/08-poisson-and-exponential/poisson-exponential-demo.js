(async () => {
	const lamSlider = document.getElementById("pe-lambda");
	const lamNum = document.getElementById("pe-lambda-num");

	const W = 360, H = 240;
	const m = { top: 16, right: 18, bottom: 36, left: 50 };
	const iw = W - m.left - m.right;
	const ih = H - m.top - m.bottom;

	// === Poisson panel ===
	const psvg = d3.select("#pe-poisson");
	const pg = psvg.append("g").attr("transform", `translate(${m.left}, ${m.top})`);
	const nMax = 15;
	const pxScale = d3.scaleLinear().domain([-0.5, nMax + 0.5]).range([0, iw]);
	const pyScale = d3.scaleLinear().domain([0, 0.2]).range([ih, 0]);

	pg.append("g")
		.attr("transform", `translate(0, ${ih})`)
		.call(d3.axisBottom(pxScale).ticks(8).tickFormat(d3.format("d")))
		.call(styleAxis);
	const pyAxisG = pg.append("g");
	pyAxisG.call(d3.axisLeft(pyScale).ticks(5)).call(styleAxis);
	pg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", PROB_COLORS.sub)
		.attr("font-style", "italic").text("k");
	const pyLabelG = pg.append("g")
		.attr("transform", `translate(${-m.left + 10}, ${ih / 2}) rotate(-90)`);
	texFO(pyLabelG, 0, 0, 84, 18, "\\(P(X = k)\\)", { anchor: "center", color: PROB_COLORS.sub, size: "13px" });

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
	const eyAxisG = eg.append("g");
	eyAxisG.call(d3.axisLeft(eyScale).ticks(5)).call(styleAxis);
	eg.append("text")
		.attr("x", iw/2).attr("y", ih + 30)
		.attr("text-anchor", "middle").attr("font-size", "12px").attr("fill", PROB_COLORS.sub)
		.attr("font-style", "italic").text("x");
	const eyLabelG = eg.append("g")
		.attr("transform", `translate(${-m.left + 10}, ${ih / 2}) rotate(-90)`);
	texFO(eyLabelG, 0, 0, 56, 18, "\\(f(x)\\)", { anchor: "center", color: PROB_COLORS.sub, size: "13px" });

	const expArea = eg.append("path")
		.attr("fill", PROB_COLORS.D).attr("fill-opacity", 0.30)
		.attr("stroke", "none");
	const expCurve = eg.append("path")
		.attr("fill", "none")
		.attr("stroke", PROB_COLORS.D).attr("stroke-width", 2);
	const areaGen = d3.area()
		.x(d => exScale(d.x))
		.y0(eyScale(0))
		.y1(d => eyScale(d.y))
		.curve(d3.curveMonotoneX);
	const lineGen = d3.line()
		.x(d => exScale(d.x))
		.y(d => eyScale(d.y))
		.curve(d3.curveMonotoneX);

	function update(syncNum = true) {
		const lam = parseFloat(lamSlider.value);
		if (syncNum) lamNum.value = lam.toFixed(2);

		// Poisson bars（最大確率に合わせて縦軸を自動調整する）
		const bw = Math.max(2, pxScale(1) - pxScale(0) - 2);
		const pdata = d3.range(0, nMax + 1).map(n => ({ n, p: poissonPmf(n, lam) }));
		const pyMax = Math.max(0.2, d3.max(pdata, d => d.p) * 1.04);
		const pyTicks = d3.range(Math.floor(pyMax * 10 + 1e-9) + 1).map(i => i / 10);
		pyScale.domain([0, pyMax]);
		pyAxisG.call(d3.axisLeft(pyScale).tickValues(pyTicks).tickFormat(d3.format(".1f"))).call(styleAxis);
		const sel = barsGroup.selectAll("rect").data(pdata);
		sel.exit().remove();
		sel.enter().append("rect")
			.attr("fill", PROB_COLORS.DC)
			.attr("fill-opacity", 0.8)
			.attr("rx", 1.5)
			.merge(sel)
			.attr("x", d => pxScale(d.n) - bw/2)
			.attr("y", d => pyScale(d.p))
			.attr("width", bw)
			.attr("height", d => ih - pyScale(d.p));

		// Exponential curve（λ が 5 を超えたら縦軸の上限を λ に追従させる）
		eyScale.domain([0, Math.max(5, lam) * 1.04]);
		eyAxisG.call(d3.axisLeft(eyScale).ticks(5)).call(styleAxis);
		const xs = d3.range(0, xMax + 0.01, 0.04).map(x => ({ x, y: lam * Math.exp(-lam * x) }));
		expArea.datum(xs).attr("d", areaGen);
		expCurve.datum(xs).attr("d", lineGen);
	}

	lamSlider.addEventListener("input", () => update(true));
	lamNum.addEventListener("input", () => {
		// 入力中は書き戻さない（toFixed でカーソルが飛ぶのを防ぐ）
		const v = parseFloat(lamNum.value);
		if (!isNaN(v)) {
			const clamped = Math.max(0.5, Math.min(10, v));
			lamSlider.value = clamped;
			update(false);
		}
	});
	lamNum.addEventListener("change", () => {
		// 確定時（blur / Enter）にのみ表示を正規化する
		const v = parseFloat(lamNum.value);
		if (!isNaN(v)) {
			lamSlider.value = Math.max(0.5, Math.min(10, v));
		}
		update(true);
	});

	typesetSvg([psvg, esvg]);
	update();
})();
