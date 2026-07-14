(function () {
	"use strict";

	const BAR_COLOR = PROB_COLORS.DC;
	const BAR_OPACITY = 0.76;
	const CURVE_COLOR = PROB_COLORS.text;
	const CURVE_OPACITY = 0.65;

	function normalPdf(z) {
		return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
	}

	// ===== 静的グリッド（counts は事前計算，m=10^6 / 10^5） =====

	const GRIDS = [
		{
			svg: "clt-grid-p2",
			footer: "\\(m = 10^6\\), bins\\(\\ = 50\\)　グレーの曲線は対応する正規分布",
			panels: [
				{ id: "p2-n1", title: "\\(n=1\\)", note: "右端は範囲外の累積" },
				{ id: "p2-n10", title: "\\(n=10\\)", note: "" },
				{ id: "p2-n100", title: "\\(n=100\\)", note: "まだ正規分布から遠い" },
				{ id: "p2-n1e4", title: "\\(n=10^4\\)", note: "" }
			]
		},
		{
			svg: "clt-grid-p3",
			footer: "\\(m = 10^6\\), bins\\(\\ = 50\\)　グレーの曲線は対応する正規分布",
			panels: [
				{ id: "p3-n1", title: "\\(n=1\\)", note: "" },
				{ id: "p3-n10", title: "\\(n=10\\)", note: "" },
				{ id: "p3-n100", title: "\\(n=100\\)", note: "" },
				{ id: "p3-n1e4", title: "\\(n=10^4\\)", note: "わずかに歪みが残る" }
			]
		},
		{
			svg: "clt-grid-p4",
			footer: "\\(m = 10^6\\), bins\\(\\ = 50\\)　グレーの曲線は対応する正規分布",
			panels: [
				{ id: "p4-n1", title: "\\(n=1\\)", note: "" },
				{ id: "p4-n10", title: "\\(n=10\\)", note: "" },
				{ id: "p4-n100", title: "\\(n=100\\)", note: "まだ右に歪む" },
				{ id: "p4-n1e4", title: "\\(n=10^4\\)", note: "" }
			]
		}
	];

	const PANEL_W = 416;
	const PANEL_H = 190;
	const COL_X = [16, 456];
	const ROW_PITCH = 206;

	function drawGrids() {
		if (!window.CLT_PANELS) return;
		const byId = new Map(window.CLT_PANELS.map((p) => [p.id, p]));

		GRIDS.forEach((grid) => {
			const svg = d3.select(`#${grid.svg}`);
			if (!svg.node()) return;
			svg.selectAll("*").remove();

			grid.panels.forEach((spec, i) => {
				const panel = byId.get(spec.id);
				if (!panel) return;
				const col = i % 2;
				const row = Math.floor(i / 2);
				const g = svg.append("g")
					.attr("transform", `translate(${COL_X[col]},${14 + row * ROW_PITCH})`);
				drawGridPanel(g, panel, spec);
			});

			const rows = Math.ceil(grid.panels.length / 2);
			texFO(svg, 440, 14 + rows * ROW_PITCH + 2, 360, 18, grid.footer, {
				anchor: "topcenter",
				color: PROB_COLORS.sub,
				size: "14px"
			});
			typesetSvg(svg);
		});
	}

	function drawGridPanel(g, panel, spec) {
		const width = PANEL_W;
		const height = PANEL_H;
		const margin = { top: 30, right: 12, bottom: 32, left: 48 };
		const counts = panel.counts;
		const binsCount = counts.length;
		const binWidth = (panel.range[1] - panel.range[0]) / binsCount;
		const isMean = panel.axis === "mean";
		const mean = isMean ? panel.mu : panel.n * panel.mu;
		const sd = isMean ? Math.sqrt(panel.var / panel.n) : Math.sqrt(panel.n * panel.var);

		const x = d3.scaleLinear()
			.domain(panel.range)
			.range([margin.left, width - margin.right]);

		const curvePeak = panel.curve ? panel.m * binWidth * normalPdf(0) / sd : 0;
		const maxCount = Math.max(d3.max(counts) || 1, curvePeak);
		const y = d3.scaleLinear()
			.domain([0, maxCount])
			.nice()
			.range([height - margin.bottom, margin.top]);

		texFO(g, 10, 4, 200, 20, spec.title, { color: PROB_COLORS.text, size: "15px", align: "left" });
		if (spec.note) {
			g.append("text")
				.attr("class", "clt-panel-note")
				.attr("x", width - 10)
				.attr("y", 17)
				.attr("text-anchor", "end")
				.text(spec.note);
		}

		g.append("g")
			.attr("fill", BAR_COLOR)
			.attr("fill-opacity", BAR_OPACITY)
			.selectAll("rect")
			.data(counts)
			.join("rect")
			.attr("x", (d, i) => x(panel.range[0] + i * binWidth) + 0.4)
			.attr("width", Math.max(0.4, x(panel.range[0] + binWidth) - x(panel.range[0]) - 0.8))
			.attr("y", (d) => y(d))
			.attr("height", (d) => y(0) - y(d))
			// 右端の bin は表示範囲外の度数の累積なので，全パネルで淡くして通常の bin と区別する
			.attr("fill-opacity", (d, i) => (i === binsCount - 1) ? 0.4 : null);

		if (panel.curve) {
			const line = d3.line()
				.x((d) => x(d.x))
				.y((d) => y(d.y))
				.curve(d3.curveMonotoneX);
			const step = (panel.range[1] - panel.range[0]) / 120;
			const data = d3.range(panel.range[0], panel.range[1] + step * 0.5, step)
				.map((v) => ({
					x: v,
					y: panel.m * binWidth * normalPdf((v - mean) / sd) / sd
				}));
			g.append("path")
				.datum(data)
				.attr("fill", "none")
				.attr("stroke", CURVE_COLOR)
				.attr("stroke-opacity", CURVE_OPACITY)
				.attr("stroke-width", 2)
				.attr("d", line);
		}

		g.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).ticks(4).tickSizeOuter(0))
			.call(styleAxis)
			.attr("font-size", 13);

		g.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s")))
			.call(styleAxis)
			.attr("font-size", 13);

		texFO(g, (margin.left + width - margin.right) / 2, height - 14, 48, 18, isMean ? "\\(\\bar{X}_n\\)" : "\\(Y\\)", {
			anchor: "topcenter",
			color: PROB_COLORS.text,
			size: "13px"
		});
	}

	function drawLogLog() {
		const svg = d3.select("#clt-loglog");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const width = 540;
		const height = 300;
		const margin = { top: 16, right: 16, bottom: 42, left: 54 };
		const POWER = PROB_COLORS.DC;
		const EXPO = PROB_COLORS.D;
		const gamma = 2;
		const lambda = 0.2;
		const xMin = 1;
		const xMax = 1000;
		const yMin = 1e-6;
		const yMax = 1;

		const x = d3.scaleLog().domain([xMin, xMax]).range([margin.left, width - margin.right]);
		const y = d3.scaleLog().domain([yMin, yMax]).range([height - margin.bottom, margin.top]);

		const pts = d3.range(0, 361).map((i) => xMin * Math.pow(xMax / xMin, i / 360));
		// 表示範囲より下に落ちた点は打ち切る（指数分布は途中で切れてよい）
		const mkPath = (f) => d3.line()
			.defined((d) => f(d) >= yMin && f(d) <= yMax * 1.0001)
			.x((d) => x(d))
			.y((d) => y(Math.min(yMax, Math.max(yMin, f(d)))))(pts);

		const xTicks = [1, 10, 100, 1000];
		const yTicks = [1, 1e-2, 1e-4, 1e-6];

		// 桁位置の薄いグリッド（曲線より下層に描く）
		const grid = svg.append("g")
			.attr("stroke", PROB_COLORS.grid)
			.attr("stroke-width", 1);
		xTicks.forEach((v) => grid.append("line")
			.attr("x1", x(v)).attr("x2", x(v))
			.attr("y1", margin.top).attr("y2", height - margin.bottom));
		yTicks.forEach((v) => grid.append("line")
			.attr("x1", margin.left).attr("x2", width - margin.right)
			.attr("y1", y(v)).attr("y2", y(v)));

		svg.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).tickValues(xTicks).tickFormat(() => "").tickSizeOuter(0))
			.call(styleAxis);
		svg.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).tickValues(yTicks).tickFormat(() => "").tickSizeOuter(0))
			.call(styleAxis);

		xTicks.forEach((v) => {
			const e = Math.round(Math.log10(v));
			const tex = e <= 1 ? String(v) : `10^{${e}}`;
			texFO(svg, x(v), height - margin.bottom + 3, 46, 18, `\\(${tex}\\)`, { anchor: "topcenter", color: PROB_COLORS.text, size: "15px" });
		});
		yTicks.forEach((v) => {
			const e = Math.round(Math.log10(v));
			const tex = e === 0 ? "1" : `10^{${e}}`;
			texFO(svg, margin.left - 16, y(v), 38, 18, `\\(${tex}\\)`, { anchor: "center", color: PROB_COLORS.text, size: "15px" });
		});

		svg.append("path").attr("fill", "none").attr("stroke", EXPO).attr("stroke-width", 2)
			.attr("d", mkPath((v) => Math.exp(-lambda * (v - xMin))));
		svg.append("path").attr("fill", "none").attr("stroke", EXPO).attr("stroke-width", 2)
			.attr("stroke-dasharray", "5 4")
			.attr("d", mkPath((v) => Math.exp(-(v - xMin))));
		svg.append("path").attr("fill", "none").attr("stroke", POWER).attr("stroke-width", 2)
			.attr("d", mkPath((v) => Math.pow(v, -gamma)));

		const legend = svg.append("g").attr("transform", `translate(${width - margin.right - 166},${margin.top + 4})`);
		[
			[POWER, "\\(\\text{ベキ分布}\\ (\\gamma=2)\\)", 0, null],
			[EXPO, "\\(\\text{指数分布}\\ (\\lambda=0.2)\\)", 20, null],
			[EXPO, "\\(\\text{指数分布}\\ (\\lambda=1)\\)", 40, "5 4"]
		].forEach((row) => {
			const line = legend.append("line").attr("x1", 0).attr("x2", 18).attr("y1", row[2]).attr("y2", row[2])
				.attr("stroke", row[0]).attr("stroke-width", 2);
			if (row[3]) line.attr("stroke-dasharray", row[3]);
			texFO(legend, 24, row[2] - 9, 142, 18, row[1], { color: PROB_COLORS.text, size: "15px", align: "left" });
		});

		texFO(svg, (margin.left + width - margin.right) / 2, height - 20, 46, 18, "\\(x\\)", { anchor: "topcenter", color: PROB_COLORS.text, size: "15px" });
		texFO(svg, 12, (margin.top + height - margin.bottom) / 2, 84, 18, "\\(f(x)/f(1)\\)", { anchor: "center", color: PROB_COLORS.text, size: "15px" })
			.attr("transform", `rotate(-90 12 ${(margin.top + height - margin.bottom) / 2})`);

		typesetSvg(svg);
	}

	// heavy tail（規模×補累積確率）と long tail（ランク×規模）が縦横の入れ替えである模式図
	function drawTailViews() {
		const svg = d3.select("#clt-tail-views");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const PANEL = { w: 416, h: 300 };
		const margin = { top: 30, right: 18, bottom: 46, left: 58 };
		const ACCENT = PROB_COLORS.D;
		const XMAX = 1000;      // 規模・ランクの上限（両対数で 3 桁ぶん）
		const ELLIPSE_AT = 0.8; // 直線の右下 80% 付近を「裾」として囲む

		// 補累積 P(X≥x) ∝ x^{-1}：両対数では傾き -1 の直線（模式図）
		const sizes = d3.range(0, 61).map((i) => Math.pow(XMAX, i / 60)); // 1..XMAX を対数等間隔で

		const panels = [
			{
				x0: 16,
				title: "heavy tail の見方",
				xLabel: "売り上げ \\(\\,x\\)",
				yLabel: "\\(P(X>x)\\)",
				data: sizes.map((s) => ({ u: s, v: 1 / s })),          // (規模, 補累積確率)
				uDomain: [1, XMAX],
				vDomain: [1 / XMAX, 1],
				captionLines: ["ベストセラーが生まれる", "確率を無視できない"]
			},
			{
				x0: 456,
				title: "long tail の見方",
				xLabel: "ランク \\(\\,N_{X>x}\\)",
				yLabel: "売り上げ \\(\\,x\\)",
				data: sizes.map((s) => ({ u: XMAX / s, v: s })).reverse(), // (ランク=N·P, 規模)  ※ N=XMAX
				uDomain: [1, XMAX],
				vDomain: [1, XMAX],
				captionLines: ["売れない商品でも幅広く揃えれば", "ベストセラーに匹敵"],
				captionDX: -46 // 長い 1 行目が viewBox 右端（880）で見切れないよう左に寄せる
			}
		];

		panels.forEach((spec) => {
			const g = svg.append("g").attr("transform", `translate(${spec.x0},10)`);
			const x = d3.scaleLog().domain(spec.uDomain).range([margin.left, PANEL.w - margin.right]);
			const y = d3.scaleLog().domain(spec.vDomain).range([PANEL.h - margin.bottom, margin.top]);

			// 目盛なしの軸線（両対数の模式図）
			g.append("line")
				.attr("x1", x.range()[0]).attr("x2", x.range()[1] + 6)
				.attr("y1", y.range()[0]).attr("y2", y.range()[0])
				.attr("stroke", PROB_COLORS.sub).attr("stroke-width", 1.2);
			g.append("line")
				.attr("x1", x.range()[0]).attr("x2", x.range()[0])
				.attr("y1", y.range()[0]).attr("y2", y.range()[1] - 6)
				.attr("stroke", PROB_COLORS.sub).attr("stroke-width", 1.2);

			const line = d3.line().x((d) => x(d.u)).y((d) => y(d.v));
			g.append("path")
				.datum(spec.data)
				.attr("fill", "none")
				.attr("stroke", BAR_COLOR)
				.attr("stroke-width", 2.2)
				.attr("d", line);

			// 裾（右下）を破線の楕円で囲む ── 直線上を対数補間した点を中心に
			const A = spec.data[0];
			const B = spec.data[spec.data.length - 1];
			const lerpLog = (a, b) => Math.exp(Math.log(a) + ELLIPSE_AT * (Math.log(b) - Math.log(a)));
			const cx = x(lerpLog(A.u, B.u));
			const cy = y(lerpLog(A.v, B.v));
			g.append("ellipse")
				.attr("cx", cx).attr("cy", cy)
				.attr("rx", 50).attr("ry", 28)
				.attr("fill", "none")
				.attr("stroke", ACCENT)
				.attr("stroke-width", 1.6)
				.attr("stroke-dasharray", "6 4");

			spec.captionLines.forEach((text, i) => {
				g.append("text")
					.attr("x", cx + (spec.captionDX || 0))
					.attr("y", cy - 58 + i * 20)
					.attr("text-anchor", "middle")
					.attr("font-size", 17)
					.attr("fill", ACCENT)
					.text(text);
			});

			// この図は .clt-figure（max-width 680px）内なので縮小率 ≈0.77。実効サイズ換算で他図と揃える
			texFO(g, 10, 4, 240, 22, spec.title, { color: PROB_COLORS.text, size: "19px", align: "left" });
			texFO(g, (x.range()[0] + x.range()[1]) / 2, PANEL.h - margin.bottom + 10, 190, 20, spec.xLabel, {
				anchor: "topcenter",
				color: PROB_COLORS.text,
				size: "17px"
			});
			texFO(g, 18, (y.range()[0] + y.range()[1]) / 2 + 20, 180, 20, spec.yLabel, { anchor: "center", color: PROB_COLORS.text, size: "17px" })
				.attr("transform", `rotate(-90 18 ${(y.range()[0] + y.range()[1]) / 2})`);
		});

		typesetSvg(svg);
	}

	document.addEventListener("DOMContentLoaded", () => {
		drawLogLog();
		drawGrids();
		drawTailViews();
	});
})();
