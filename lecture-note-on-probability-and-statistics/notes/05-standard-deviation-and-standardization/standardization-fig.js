// 標準化は分布の形を変えない ── 同じ形の分布を X の目盛りと Z の目盛りで読み直す静的図。
(async () => {
	const svg = d3.select("#standardization-fig-svg");

	// 緩い二峰性の混合正規分布。平均と標準偏差を解析的に求めて標準化し，
	// 図中の ±1 の幅が，描いた密度の標準偏差 1 個分と正確に一致するようにする。
	const comps = [
		{ w: 0.55, m: -1.1, s: 0.65 },
		{ w: 0.45, m:  1.2, s: 0.72 },
	];
	const phi = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
	const fX = x => d3.sum(comps, c => c.w * phi(x, c.m, c.s));
	const mean = d3.sum(comps, c => c.w * c.m);
	const sd = Math.sqrt(d3.sum(comps, c => c.w * (c.s ** 2 + c.m ** 2)) - mean ** 2);
	const fZ = z => sd * fX(mean + sd * z);

	const W = 440, H = 188; // .fig-narrow（440px）に等倍で収める
	const top = 30, bottom = 34;
	const innerH = H - top - bottom;
	const panelW = 176;
	// 2 つのパネルはまったく同じ曲線を描き，ラベルだけを変える。
	const panels = [
		{ x0: 8,   stroke: PROB_COLORS.DC, text: PROB_COLORS.DCText,
		  title: "\\(X\\,\\) の分布", center: "\\(\\mu_X\\)", band: "\\(\\pm\\sigma_X\\)" },
		{ x0: 256, stroke: PROB_COLORS.D,  text: PROB_COLORS.DText,
		  title: "\\(Z\\,\\) の分布", center: "\\(0\\)", band: "\\(\\pm 1\\)" },
	];

	const zMin = -2.8, zMax = 2.8;
	const zScale = d3.scaleLinear().domain([zMin, zMax]).range([0, panelW]);
	const pts = d3.range(zMin, zMax + 0.02, 0.02).map(z => ({ z, p: fZ(z) }));
	const pMax = d3.max(pts, d => d.p);
	const yScale = d3.scaleLinear().domain([0, pMax * 1.12]).range([innerH, 0]);

	const areaGen = d3.area().x(d => zScale(d.z)).y0(innerH).y1(d => yScale(d.p));
	const lineGen = d3.line().x(d => zScale(d.z)).y(d => yScale(d.p));

	for (const p of panels) {
		const g = svg.append("g").attr("transform", `translate(${p.x0}, ${top})`);

		g.append("path").datum(pts)
			.attr("fill", p.stroke).attr("fill-opacity", 0.25).attr("d", areaGen);
		g.append("path").datum(pts)
			.attr("fill", "none").attr("stroke", p.stroke).attr("stroke-width", 1.8).attr("d", lineGen);

		// 横軸の基線（y 軸は描かない）
		g.append("line")
			.attr("x1", 0).attr("x2", panelW)
			.attr("y1", innerH).attr("y2", innerH)
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1);

		// 分布の中心：基線上の目盛りとラベル
		g.append("line")
			.attr("x1", zScale(0)).attr("x2", zScale(0))
			.attr("y1", innerH - 4).attr("y2", innerH + 5)
			.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1);
		texFO(g, zScale(0), innerH + 6, 60, 22, p.center, { anchor: "topcenter", size: "13px" });

		// 標準偏差 1 個分の幅（中心の左右に 1 個分ずつ，両矢印で示す）
		const yBand = innerH - 16;
		const xL = zScale(-1), xR = zScale(1);
		g.append("line")
			.attr("x1", xL + 6).attr("x2", xR - 6)
			.attr("y1", yBand).attr("y2", yBand)
			.attr("stroke", p.text).attr("stroke-width", 1.4);
		g.append("path")
			.attr("d", `M ${xL} ${yBand} l 7 -4 v 8 Z M ${xR} ${yBand} l -7 -4 v 8 Z`)
			.attr("fill", p.text);
		for (const x of [xL, xR]) {
			g.append("line")
				.attr("x1", x).attr("x2", x)
				.attr("y1", yBand - 8).attr("y2", innerH)
				.attr("stroke", p.text).attr("stroke-width", 1);
		}
		texFO(g, zScale(0), yBand - 27, 80, 22, p.band, { anchor: "topcenter", color: p.text, size: "13px" });

		// パネル題（主要ラベル：実効 ≈15px）
		texFO(g, zScale(0), -28, 140, 22, p.title, { anchor: "topcenter", color: p.text, size: "15px" });
	}

	// 左から右への「標準化」矢印
	const yArrow = top + innerH * 0.45;
	svg.append("line")
		.attr("x1", 192).attr("x2", 240)
		.attr("y1", yArrow).attr("y2", yArrow)
		.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1.6);
	svg.append("path")
		.attr("d", `M 250 ${yArrow} l -11 -5.5 v 11 Z`)
		.attr("fill", PROB_COLORS.text);
	texFO(svg, 220, yArrow - 28, 70, 22, "標準化", { anchor: "topcenter", size: "15px" });

	await typesetSvg(svg);
})();
