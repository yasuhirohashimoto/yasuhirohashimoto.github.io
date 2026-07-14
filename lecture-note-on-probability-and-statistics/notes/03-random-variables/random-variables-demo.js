(async () => {
	const svg = d3.select("#density-area-svg");

	const phi = (x, mu, sigma) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
	const pdf = x =>
		0.35 * phi(x, -1.3, 0.65) +
		0.45 * phi(x,  0.8, 0.90) +
		0.20 * phi(x,  2.4, 0.55);

	const W = 500, H = 200;
	const margin = { top: 14, right: 18, bottom: 32, left: 18 };
	const innerW = W - margin.left - margin.right;
	const innerH = H - margin.top - margin.bottom;

	const xMin = -4, xMax = 4.2;
	const a = -0.4, b = 1.9;

	const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]);
	const pts = d3.range(xMin, xMax + 0.02, 0.02).map(x => ({ x, p: pdf(x) }));
	const pMax = d3.max(pts, d => d.p);
	const yScale = d3.scaleLinear().domain([0, pMax * 1.18]).range([innerH, 0]);

	const g = svg.append("g")
		.attr("transform", `translate(${margin.left}, ${margin.top})`);

	// baseline (x-axis line)
	g.append("line")
		.attr("x1", 0).attr("x2", innerW)
		.attr("y1", innerH).attr("y2", innerH)
		.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1);

	// shaded area between a and b
	const seg = pts.filter(p => p.x >= a && p.x <= b);
	const areaGen = d3.area()
		.x(d => xScale(d.x))
		.y0(innerH)
		.y1(d => yScale(d.p));
	g.append("path")
		.datum(seg)
		.attr("fill", PROB_COLORS.D)
		.attr("fill-opacity", 0.30)
		.attr("d", areaGen);

	// PDF curve
	const lineGen = d3.line()
		.x(d => xScale(d.x))
		.y(d => yScale(d.p))
		.curve(d3.curveCatmullRom.alpha(0.5));
	g.append("path")
		.datum(pts)
		.attr("fill", "none")
		.attr("stroke", PROB_COLORS.text)
		.attr("stroke-width", 1.5)
		.attr("d", lineGen);

	// a, b tick marks
	[a, b].forEach(xv => {
		g.append("line")
			.attr("x1", xScale(xv)).attr("x2", xScale(xv))
			.attr("y1", innerH - 3).attr("y2", innerH + 5)
			.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1);
	});

	texFO(g, xScale(a), innerH + 6, 28, 22, "\\(a\\)", { anchor: "topcenter", size: "13px" });
	texFO(g, xScale(b), innerH + 6, 28, 22, "\\(b\\)", { anchor: "topcenter", size: "13px" });

	const labelX = 3.0;
	texFO(g, xScale(labelX) + 20, yScale(pdf(labelX)) - 24, 56, 22, "\\(f_X(x)\\)", { anchor: "topcenter", color: PROB_COLORS.text, size: "13px" });

	texFO(g, xScale((a + b) / 2), innerH - 60, 170, 24, "\\(P(a \\leq X \\leq b)\\)", { anchor: "topcenter", color: PROB_COLORS.DText, size: "13px" });

	await typesetSvg(svg);
})();

(async () => {
	function erf(x) {
		const a1 =  0.254829592;
		const a2 = -0.284496736;
		const a3 =  1.421413741;
		const a4 = -1.453152027;
		const a5 =  1.061405429;
		const p  =  0.3275911;
		const sign = x < 0 ? -1 : 1;
		x = Math.abs(x);
		const t = 1.0 / (1.0 + p * x);
		const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
		return sign * y;
	}
	const phiN = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
	const PhiN = (x, mu, s) => 0.5 * (1 + erf((x - mu) / (s * Math.sqrt(2))));

	const distributions = {
		normal: {
			kind: "continuous",
			xMin: -5, xMax: 5,
			sliderMin: -5, sliderMax: 5, step: 0.05,
			defaultX: 0,
			pdf: x => phiN(x, 0, 1),
			cdf: x => PhiN(x, 0, 1),
			pdfMaxHint: phiN(0, 0, 1),
			pdfLabel: "\\(f_X(x)\\,\\) ── PDF",
		},
		dice: {
			kind: "discrete",
			xMin: 0, xMax: 6.5,
			sliderMin: 0, sliderMax: 6, step: 1,
			defaultX: 3,
			values: [1, 2, 3, 4, 5, 6],
			pmf: 1 / 6,
			cdf: x => {
				if (x < 1) return 0;
				if (x >= 6) return 1;
				return Math.floor(x) / 6;
			},
			pdfMaxHint: 1 / 6,
			pdfLabel: "\\(P(X=x)\\,\\) ── PMF",
		},
		bimodal: {
			kind: "continuous",
			xMin: -5, xMax: 5,
			sliderMin: -5, sliderMax: 5, step: 0.05,
			defaultX: 0,
			pdf: x => 0.5 * phiN(x, -2, 0.7) + 0.5 * phiN(x, 2, 0.7),
			cdf: x => 0.5 * PhiN(x, -2, 0.7) + 0.5 * PhiN(x, 2, 0.7),
			pdfMaxHint: 0.5 * phiN(0, 0, 0.7),
			pdfLabel: "\\(f_X(x)\\,\\) ── PDF",
		},
	};

	const CDF_FILL = d3.color(PROB_COLORS.DC).copy({ opacity: 0.36 }).formatRgb();
	const CDF_STROKE = PROB_COLORS.DCText;
	const CCDF_FILL = d3.color(PROB_COLORS.D).copy({ opacity: 0.30 }).formatRgb();
	const CCDF_STROKE = PROB_COLORS.DText;

	const distSelect = document.getElementById("rv-dist-select");
	const xSlider = document.getElementById("rv-x");
	const xLabel  = document.getElementById("rv-x-val");
	const resultDiv = document.getElementById("rv-result");
	const liveDiv = document.getElementById("rv-live");
	let liveTimer = null;
	// スクリーンリーダー向けの通知。スライダー連続操作で読み上げが氾濫しないよう，操作が止まってから書き込む
	function announce(text) {
		if (!liveDiv) return;
		clearTimeout(liveTimer);
		liveTimer = setTimeout(() => { liveDiv.textContent = text; }, 600);
	}

	const svg = d3.select("#rv-svg");
	const W = 560, H = 400;
	const margin = { top: 16, right: 24, bottom: 28, left: 48 };
	const innerW = W - margin.left - margin.right;
	const panelH = (H - margin.top - margin.bottom - 30) / 2;

	const xScale = d3.scaleLinear().range([0, innerW]);
	const yPdf = d3.scaleLinear().range([panelH, 0]);
	const yCdf = d3.scaleLinear().domain([0, 1.05]).range([panelH, 0]);

	// PDF panel: persistent containers
	const pdfG = svg.append("g")
		.attr("transform", `translate(${margin.left}, ${margin.top})`);
	const pdfAxisX = pdfG.append("g").attr("transform", `translate(0, ${panelH})`);
	const pdfAxisY = pdfG.append("g");
	const pdfTitleFO = texFO(pdfG, 14, 2, 200, 20, "", { color: PROB_COLORS.sub, size: "14px", align: "left" });
	const pdfShade = pdfG.append("g");   // continuous shaded area
	const pdfDraw  = pdfG.append("g");   // curve OR bars

	const pdfX = pdfG.append("line")
		.attr("stroke", PROB_COLORS.sub).attr("stroke-width", 1.2)
		.attr("stroke-dasharray", "4 3")
		.attr("y1", 0).attr("y2", panelH);
	const pdfXLabel = texFO(pdfG, 0, -18, 28, 18, "\\(x\\)", { color: PROB_COLORS.sub });

	// CDF panel: persistent containers
	const cdfG = svg.append("g")
		.attr("transform", `translate(${margin.left}, ${margin.top + panelH + 30})`);
	const cdfAxisX = cdfG.append("g").attr("transform", `translate(0, ${panelH})`);
	const cdfAxisY = cdfG.append("g");
	texFO(cdfG, 14, 2, 180, 20, "\\(F_X(x)\\,\\) ── CDF", { color: PROB_COLORS.sub, size: "14px", align: "left" });
	const cdfDraw = cdfG.append("g");
	const cdfMarkers = cdfG.append("g");

	let dist = distributions.normal;

	function drawDist() {
		xScale.domain([dist.xMin, dist.xMax]);
		yPdf.domain([0, dist.pdfMaxHint * 1.25]);

		if (dist.kind === "discrete") {
			pdfAxisX.call(d3.axisBottom(xScale).tickValues(dist.values).tickFormat(d3.format("d")).tickSizeOuter(0)).call(styleAxis);
			cdfAxisX.call(d3.axisBottom(xScale).tickValues(dist.values).tickFormat(d3.format("d")).tickSizeOuter(0)).call(styleAxis);
			const N = dist.values.length;
			const fracFmt = v => v === 0 ? "0" : `${Math.round(v * N)}/${N}`;
			pdfAxisY.call(d3.axisLeft(yPdf).tickValues([0, dist.pmf]).tickFormat(fracFmt).tickSizeOuter(0)).call(styleAxis);
			cdfAxisY.call(d3.axisLeft(yCdf).tickValues(dist.values.map(k => k / N)).tickFormat(fracFmt).tickSizeOuter(0)).call(styleAxis);
		} else {
			pdfAxisX.call(d3.axisBottom(xScale).ticks(7).tickSizeOuter(0)).call(styleAxis);
			cdfAxisX.call(d3.axisBottom(xScale).ticks(7).tickSizeOuter(0)).call(styleAxis);
			pdfAxisY.call(d3.axisLeft(yPdf).ticks(4).tickSizeOuter(0)).call(styleAxis);
			cdfAxisY.call(d3.axisLeft(yCdf).ticks(5).tickSizeOuter(0)).call(styleAxis);
		}

		pdfTitleFO.select("div").html(dist.pdfLabel);

		pdfShade.selectAll("*").remove();
		pdfDraw.selectAll("*").remove();
		cdfDraw.selectAll("*").remove();

		if (dist.kind === "continuous") {
			const pts = d3.range(dist.xMin, dist.xMax + 0.02, 0.02)
				.map(x => ({ x, p: dist.pdf(x), F: dist.cdf(x) }));
			const lineGen = d3.line()
				.x(d => xScale(d.x))
				.y(d => yPdf(d.p));
			pdfDraw.append("path")
				.datum(pts)
				.attr("fill", "none")
				.attr("stroke", PROB_COLORS.text)
				.attr("stroke-width", 1.5)
				.attr("d", lineGen);

			const cdfLine = d3.line()
				.x(d => xScale(d.x))
				.y(d => yCdf(d.F));
			cdfDraw.append("path")
				.datum(pts)
				.attr("fill", "none")
				.attr("stroke", PROB_COLORS.text)
				.attr("stroke-width", 1.5)
				.attr("d", cdfLine);
		} else {
			// PMF as bars
			const barW = 0.6;
			pdfDraw.selectAll("rect")
				.data(dist.values)
				.enter()
				.append("rect")
				.attr("x", k => xScale(k - barW / 2))
				.attr("y", () => yPdf(dist.pmf))
				.attr("width", k => xScale(k + barW / 2) - xScale(k - barW / 2))
				.attr("height", () => panelH - yPdf(dist.pmf))
				.attr("rx", 1.5)
				.attr("fill", PROB_COLORS.node)
				.attr("stroke", PROB_COLORS.sub)
				.attr("stroke-width", 1);

			// step CDF
			const stepPts = [{ x: dist.xMin, F: 0 }]
				.concat(dist.values.map(k => ({ x: k, F: dist.cdf(k) })))
				.concat([{ x: dist.xMax, F: 1 }]);
			const cdfLine = d3.line()
				.x(d => xScale(d.x))
				.y(d => yCdf(d.F))
				.curve(d3.curveStepAfter);
			cdfDraw.append("path")
				.datum(stepPts)
				.attr("fill", "none")
				.attr("stroke", PROB_COLORS.text)
				.attr("stroke-width", 1.5)
				.attr("d", cdfLine);
			// small open/filled circles at jump points
			dist.values.forEach(k => {
				// 左極限（ジャンプ直前の値）は白抜き丸で表す
				cdfDraw.append("circle")
					.attr("cx", xScale(k)).attr("cy", yCdf(dist.cdf(k) - dist.pmf))
					.attr("r", 3.5).attr("fill", PROB_COLORS.node)
					.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1.2);
				cdfDraw.append("circle")
					.attr("cx", xScale(k)).attr("cy", yCdf(dist.cdf(k)))
					.attr("r", 3.5).attr("fill", PROB_COLORS.text);
			});
		}
	}

	function update() {
		const xValue = parseFloat(xSlider.value);
		const fmt = dist.kind === "discrete" ? (v => v.toFixed(0)) : (v => v.toFixed(2));
		const F = Math.max(0, Math.min(1, dist.cdf(xValue)));
		const Fbar = 1 - F;
		const xPos = xScale(xValue);

		xLabel.textContent = fmt(xValue);
		pdfX.attr("x1", xPos).attr("x2", xPos);
		pdfXLabel.attr("x", Math.max(0, Math.min(innerW - 28, xPos - 14)));

		// PDF/PMF shading: left side is CDF, right side is CCDF.
		if (dist.kind === "continuous") {
			pdfShade.selectAll("*").remove();
			const areaGen = d3.area()
				.x(d => xScale(d.x))
				.y0(panelH)
				.y1(d => yPdf(d.p));
			const boundary = Math.max(dist.xMin, Math.min(dist.xMax, xValue));
			if (boundary > dist.xMin) {
				const left = d3.range(dist.xMin, boundary, 0.02).map(x => ({ x, p: dist.pdf(x) }));
				left.push({ x: boundary, p: dist.pdf(boundary) });
				pdfShade.append("path")
					.attr("fill", CDF_FILL)
					.attr("d", areaGen(left));
			}
			if (boundary < dist.xMax) {
				const right = [{ x: boundary, p: dist.pdf(boundary) }]
					.concat(d3.range(boundary + 0.02, dist.xMax + 0.02, 0.02).map(x => ({ x, p: dist.pdf(x) })));
				pdfShade.append("path")
					.attr("fill", CCDF_FILL)
					.attr("d", areaGen(right));
			}
		} else {
			pdfDraw.selectAll("rect")
				.attr("fill", k => k <= xValue ? CDF_FILL : CCDF_FILL);
		}

		// CDF/CCDF markers
		cdfMarkers.selectAll("*").remove();
		cdfMarkers.append("line")
			.attr("x1", 0).attr("x2", xPos)
			.attr("y1", yCdf(F)).attr("y2", yCdf(F))
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1)
			.attr("stroke-dasharray", "3 3");
		cdfMarkers.append("line")
			.attr("x1", xPos).attr("x2", xPos)
			.attr("y1", panelH).attr("y2", yCdf(1))
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1)
			.attr("stroke-dasharray", "3 3");
		cdfMarkers.append("circle")
			.attr("cx", xPos).attr("cy", yCdf(F))
			.attr("r", 4.5).attr("fill", PROB_COLORS.sub);

		const barW = 12;
		const barX = Math.max(0, Math.min(innerW - barW, xPos - barW / 2));
		const yTop = yCdf(1);
		const yMid = yCdf(F);
		const yBottom = yCdf(0);
		cdfMarkers.append("rect")
			.attr("x", barX).attr("y", yTop)
			.attr("width", barW).attr("height", Math.max(yMid - yTop, 0))
			.attr("fill", CCDF_FILL);
		cdfMarkers.append("rect")
			.attr("x", barX).attr("y", yMid)
			.attr("width", barW).attr("height", Math.max(yBottom - yMid, 0))
			.attr("fill", CDF_FILL);
		cdfMarkers.append("rect")
			.attr("x", barX).attr("y", yTop)
			.attr("width", barW).attr("height", yBottom - yTop)
			.attr("fill", "none")
			.attr("stroke", PROB_COLORS.sub)
			.attr("stroke-width", 0.8);
		cdfMarkers.append("line")
			.attr("x1", barX).attr("x2", barX + barW)
			.attr("y1", yMid).attr("y2", yMid)
			.attr("stroke", PROB_COLORS.sub)
			.attr("stroke-width", 0.8);

		if (yMid - yTop > 14) {
			cdfMarkers.append("text")
				.attr("x", barX + barW + 6).attr("y", (yTop + yMid) / 2 + 4)
				.attr("fill", CCDF_STROKE)
				.attr("font-size", 13)
				.attr("font-weight", 700)
				.attr("text-anchor", "start")
				.text("CCDF");
		}
		if (yBottom - yMid > 14) {
			cdfMarkers.append("text")
				.attr("x", barX - 6).attr("y", (yMid + yBottom) / 2 + 4)
				.attr("fill", CDF_STROKE)
				.attr("font-size", 13)
				.attr("font-weight", 700)
				.attr("text-anchor", "end")
				.text("CDF");
		}

		// 図の塗り（CDF=青，CCDF=橙）と対応する色を値に付ける
		resultDiv.innerHTML =
			`\\[\\begin{aligned}` +
			`F_X(${fmt(xValue)}) &= P(X \\leq ${fmt(xValue)}) \\approx \\color{${PROB_COLORS.DCText}}{${F.toFixed(3)}}\\\\` +
			`\\bar{F}_X(${fmt(xValue)}) &= P(X > ${fmt(xValue)}) \\approx \\color{${PROB_COLORS.DText}}{${Fbar.toFixed(3)}}` +
			`\\end{aligned}\\]`;
		announce(`x = ${fmt(xValue)} のとき，累積確率はおよそ ${F.toFixed(3)}，補累積確率はおよそ ${Fbar.toFixed(3)}`);
		typesetSvg([resultDiv, pdfTitleFO]);
	}

	function setDist(name) {
		dist = distributions[name];
		const sMin = dist.sliderMin ?? dist.xMin;
		const sMax = dist.sliderMax ?? dist.xMax;
		xSlider.min = sMin;
		xSlider.max = sMax;
		xSlider.step = dist.step;
		xSlider.value = dist.defaultX ?? (sMin + sMax) / 2;
		drawDist();
		update();
	}

	distSelect.addEventListener("change", () => setDist(distSelect.value));
	xSlider.addEventListener("input", update);

	setDist("normal");

	await typesetSvg(svg);
})();


(async () => {
	const svg = d3.select("#conditional-area-svg");
	if (svg.empty()) return;

	const phi = (x, mu, sigma) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
	const pdf = x =>
		0.35 * phi(x, -1.3, 0.65) +
		0.45 * phi(x,  0.8, 0.90) +
		0.20 * phi(x,  2.4, 0.55);

	const W = 500, H = 200;
	const margin = { top: 14, right: 18, bottom: 32, left: 18 };
	const innerW = W - margin.left - margin.right;
	const innerH = H - margin.top - margin.bottom;

	const xMin = -4, xMax = 4.2;
	const xc = 1.5;  // 条件 X <= x の x

	const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]);
	const pts = d3.range(xMin, xMax + 0.02, 0.02).map(x => ({ x, p: pdf(x) }));
	const pMax = d3.max(pts, d => d.p);
	const yScale = d3.scaleLinear().domain([0, pMax * 1.18]).range([innerH, 0]);

	const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

	// baseline
	g.append("line")
		.attr("x1", 0).attr("x2", innerW)
		.attr("y1", innerH).attr("y2", innerH)
		.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1);

	const areaGen = d3.area()
		.x(d => xScale(d.x))
		.y0(innerH)
		.y1(d => yScale(d.p));

	// 条件 X >= 0 のもとで，対象となる 0 <= X <= x の面積。
	const targetSeg = pts.filter(p => p.x >= 0 && p.x <= xc);
	g.append("path")
		.datum(targetSeg)
		.attr("fill", PROB_COLORS.D)
		.attr("fill-opacity", 0.38)
		.attr("d", areaGen);

	// 条件 X >= 0 のうち，対象に入らない X > x の面積。
	const blueOnly = pts.filter(p => p.x >= xc);
	g.append("path")
		.datum(blueOnly)
		.attr("fill", PROB_COLORS.DC)
		.attr("fill-opacity", 0.36)
		.attr("d", areaGen);

	// PDF カーブ outline
	const lineGen = d3.line()
		.x(d => xScale(d.x))
		.y(d => yScale(d.p))
		.curve(d3.curveCatmullRom.alpha(0.5));
	g.append("path")
		.datum(pts)
		.attr("fill", "none")
		.attr("stroke", PROB_COLORS.text)
		.attr("stroke-width", 1.5)
		.attr("d", lineGen);

	// 0 と x の目盛り
	[0, xc].forEach(xv => {
		g.append("line")
			.attr("x1", xScale(xv)).attr("x2", xScale(xv))
			.attr("y1", innerH - 3).attr("y2", innerH + 5)
			.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1);
	});

	texFO(g, xScale(0),  innerH + 6, 28, 22, "\\(0\\)", { anchor: "topcenter", size: "13px" });
	texFO(g, xScale(xc), innerH + 6, 28, 22, "\\(x\\)", { anchor: "topcenter", size: "13px" });

	// f_X(x) ラベル
	const labelX = 3.0;
	texFO(g, xScale(labelX) + 20, yScale(pdf(labelX)) - 24, 56, 22, "\\(f_X(x)\\)", { anchor: "topcenter", color: PROB_COLORS.text, size: "13px" });

	await typesetSvg(svg);
})();
