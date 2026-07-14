(async () => {
	// 手書き風の分布曲線（「正規分布とは限らない」ことを伝える意図的な形状・変更しない）。
	// 片側図は右に歪んだ分布、両側図は左右対称な分布。
	const ONE_SIDED_CURVE = "M70 260 C88 260 100 252 111 232 C126 204 138 127 164 88 C185 56 214 58 238 92 C263 126 278 171 312 205 C342 235 382 253 435 260";
	const TWO_SIDED_CURVE = "M70 260 C90 260 105 255 120 240 C140 215 150 160 170 120 C190 80 210 70 230 70 C250 70 270 80 290 120 C310 160 320 215 340 240 C355 255 370 260 390 260";

	const BOUNDARY_RED = PROB_COLORS.redText;
	const PVALUE_BLUE = PROB_COLORS.DC;
	const CURVE_INK = PROB_COLORS.text;
	const BASE_FILL = "var(--bg)";

	// Arrow handles: M = start, Q = bend point, final pair = arrow tip.
	const alphaArrows = [
		{ id: "alpha-arrow-left", d: "M205 300 Q160 292 130 246" },
		{ id: "alpha-arrow-right", d: "M255 300 Q300 292 330 246" },
	];
	const pValueArrows = [
		{ id: "pvalue-arrow-left", d: "M190 300 Q140 292 108 258" },
		{ id: "pvalue-arrow-right", d: "M270 300 Q320 292 352 258" },
	];

	const setAttrs = (selection, attrs) => {
		Object.entries(attrs).forEach(([name, value]) => selection.attr(name, value));
		return selection;
	};

	const arrowMarker = (svg, id, color) => {
		svg.append("defs").html(`
			<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"></path>
			</marker>
		`);
	};

	// 1パネル分の共通部（横軸・地塗り・分布曲線・曲線下クリップ）を描画し、
	// パネル固有の要素を足すためのヘルパー一式を返す。
	const setupPanel = (svg, curve, { axisEnd, clipId }) => {
		const line = attrs => setAttrs(svg.append("line")
			.attr("class", "axis")
			.attr("stroke", PROB_COLORS.line)
			.attr("stroke-width", 1.2), attrs);
		const path = (d, attrs = {}) => setAttrs(svg.append("path").attr("d", d), attrs);

		svg.append("defs").html(`
			<clipPath id="${clipId}">
				<path d="${curve} L70 260 Z"></path>
			</clipPath>
		`);
		line({ x1: 60, y1: 260, x2: axisEnd, y2: 260 });
		path(`${curve} L70 260 Z`, { fill: BASE_FILL });
		// クリップ群を曲線より先に挿入しておくと、あとから足す面も曲線の下に描かれる。
		const clip = svg.append("g").attr("clip-path", `url(#${clipId})`);
		path(curve, { fill: "none", stroke: CURVE_INK, "stroke-width": 2, "stroke-linecap": "round" });

		return {
			// 曲線下の面（面積＝確率）
			area: (x, width, fill, opacity) => clip.append("rect")
				.attr("x", x).attr("y", 55).attr("width", width).attr("height", 215)
				.attr("fill", fill).attr("opacity", opacity),
			// αの境界（赤破線）
			alphaBoundary: (x, yTop) => line({ x1: x, y1: yTop, x2: x, y2: 264 })
				.attr("stroke", BOUNDARY_RED).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 5"),
			// 観測された検定統計量 T（青破線）
			tMarker: (x, yTop) => line({ x1: x, y1: yTop, x2: x, y2: 264 })
				.attr("stroke", PROB_COLORS.DC).attr("stroke-width", 2.2).attr("stroke-dasharray", "6 4"),
			distributionLabel: (cx, cy) => texFO(svg, cx, cy, 170, 20, "\\(H_0\\ \\) のもとでの分布",
				{ anchor: "center", size: "14px", color: PROB_COLORS.sub }),
			boundaryLabel: (cx, cy) => texFO(svg, cx, cy, 85, 18, "\\(\\alpha\\ \\) の境界",
				{ anchor: "center", size: "14px", color: PROB_COLORS.redText }),
			// 日本語のみのラベルは素の SVG text で置く
			rejectionLabel: (x, y, anchor = "middle") => svg.append("text")
				.attr("x", x).attr("y", y).attr("text-anchor", anchor)
				.attr("font-size", 14).attr("fill", PROB_COLORS.redText).text("棄却域"),
			arrow: (parent, d, color, markerId) => setAttrs(parent.append("path"), {
				d, fill: "none", stroke: color,
				"stroke-width": 1.7, "stroke-linecap": "round",
				"marker-end": `url(#${markerId})`,
			}),
		};
	};

	const oneAlphaSvg = d3.select("#ht-one-sided-alpha");
	const onePValueSvg = d3.select("#ht-one-sided-pvalue");
	const twoAlphaSvg = d3.select("#ht-significance-alpha");
	const twoPValueSvg = d3.select("#ht-significance-pvalue");

	// 片側検定・左パネル: 有意水準α
	if (!oneAlphaSvg.empty()) {
		const p = setupPanel(oneAlphaSvg, ONE_SIDED_CURVE, { axisEnd: 440, clipId: "ht-one-alpha-area" });
		p.area(350, 85, PROB_COLORS.red, .42);
		p.alphaBoundary(350, 118);
		p.distributionLabel(210, 184);
		p.boundaryLabel(350, 108);
		p.rejectionLabel(391, 220);
		texFO(oneAlphaSvg, 380, 276, 160, 22, "赤い面積 \\(\\,= \\alpha\\)", { anchor: "center", size: "14px", color: PROB_COLORS.redText });
	}

	// 片側検定・右パネル: p値
	if (!onePValueSvg.empty()) {
		const p = setupPanel(onePValueSvg, ONE_SIDED_CURVE, { axisEnd: 440, clipId: "ht-one-pvalue-area" });
		arrowMarker(onePValueSvg, "ht-one-arrow-blue", PROB_COLORS.DC);
		p.area(375, 60, PVALUE_BLUE, .5);
		p.alphaBoundary(350, 118);
		p.tMarker(375, 96);
		p.distributionLabel(210, 184);
		p.boundaryLabel(350, 108);
		texFO(onePValueSvg, 375, 57, 110, 18, "今回の結果 \\(\\,T\\)", { anchor: "topcenter", size: "14px", color: PROB_COLORS.DC });
		p.arrow(onePValueSvg, "M375 78 Q375 86 375 95", PROB_COLORS.DC, "ht-one-arrow-blue");
		texFO(onePValueSvg, 380, 276, 150, 22, "青い面積 \\(\\,= p\\ \\) 値", { anchor: "center", size: "14px", color: PROB_COLORS.DC });
	}

	// 両側検定・左パネル: 有意水準α
	if (!twoAlphaSvg.empty()) {
		const p = setupPanel(twoAlphaSvg, TWO_SIDED_CURVE, { axisEnd: 400, clipId: "ht-two-alpha-area" });
		arrowMarker(twoAlphaSvg, "ht-arrow-red", BOUNDARY_RED);
		p.area(70, 75, PROB_COLORS.red, .42);
		p.area(315, 75, PROB_COLORS.red, .42);
		p.alphaBoundary(145, 100);
		p.alphaBoundary(315, 100);
		p.distributionLabel(230, 185);
		p.boundaryLabel(315, 90);
		p.rejectionLabel(126, 218, "end");
		p.rejectionLabel(334, 218, "start");
		texFO(twoAlphaSvg, 230, 310, 160, 22, "赤い面積の合計 \\(\\,= \\alpha\\)", { anchor: "center", size: "14px", color: PROB_COLORS.redText });
		const alphaArrowGroup = twoAlphaSvg.append("g").attr("id", "editable-alpha-arrows");
		alphaArrows.forEach(arrow => p.arrow(alphaArrowGroup, arrow.d, BOUNDARY_RED, "ht-arrow-red").attr("id", arrow.id));
	}

	// 両側検定・右パネル: p値
	if (!twoPValueSvg.empty()) {
		const p = setupPanel(twoPValueSvg, TWO_SIDED_CURVE, { axisEnd: 400, clipId: "ht-two-pvalue-area" });
		arrowMarker(twoPValueSvg, "ht-arrow-blue", PROB_COLORS.DC);
		p.area(70, 75, PROB_COLORS.red, .18);
		p.area(315, 75, PROB_COLORS.red, .18);
		p.area(70, 45, PVALUE_BLUE, .5);
		p.area(345, 45, PVALUE_BLUE, .5);
		p.alphaBoundary(145, 100);
		p.alphaBoundary(315, 100);
		p.tMarker(115, 100);
		p.tMarker(345, 82);
		p.distributionLabel(230, 185);
		p.boundaryLabel(315, 90);
		texFO(twoPValueSvg, 345, 46, 110, 18, "今回の結果 \\(\\,T\\)", { anchor: "topcenter", size: "14px", color: PROB_COLORS.DC });
		p.arrow(twoPValueSvg, "M345 66 Q345 72 345 82", PROB_COLORS.DC, "ht-arrow-blue");
		texFO(twoPValueSvg, 230, 310, 190, 22, "左右の青い面積の合計 \\(\\,= p\\ \\) 値", { anchor: "center", size: "14px", color: PROB_COLORS.DC });
		const pArrowGroup = twoPValueSvg.append("g").attr("id", "editable-pvalue-arrows");
		pValueArrows.forEach(arrow => p.arrow(pArrowGroup, arrow.d, PROB_COLORS.DC, "ht-arrow-blue").attr("id", arrow.id));
	}

	const typesetTargets = [oneAlphaSvg, onePValueSvg, twoAlphaSvg, twoPValueSvg].filter(selection => !selection.empty());
	await typesetSvg(typesetTargets);
})();
