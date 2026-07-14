(function () {
	"use strict";

	const BINOM = PROB_COLORS.DC;  // 二項分布（青の棒） ── サイト共通のヒストグラム色
	const POISSON = PROB_COLORS.D; // ポアソン近似（橙の線）
	const NORMAL = PROB_COLORS.text; // 正規近似（黒の曲線）

	// ===== 数値計算（対数を経由して大きな n でも安定に） =====

	// Lanczos 近似による log Γ(x)
	const LANCZOS = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028,
		771.32342877765313, -176.61502916214059, 12.507343278686905,
		-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
	];
	function lgamma(x) {
		if (x < 0.5) {
			return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
		}
		x -= 1;
		let a = LANCZOS[0];
		const t = x + 7.5;
		for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i);
		return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
	}
	const logFact = (k) => lgamma(k + 1);
	function logChoose(n, m) {
		return logFact(n) - logFact(m) - logFact(n - m);
	}

	function normalPdf(x, mean, sd) {
		const z = (x - mean) / sd;
		return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
	}

	// 表示に必要な m の窓（平均 ±8σ を [0,n] にクランプ）
	function windowRange(n, p) {
		const mean = n * p;
		const sd = Math.sqrt(n * p * (1 - p));
		let lo = Math.max(0, Math.floor(mean - 8 * sd) - 1);
		let hi = Math.min(n, Math.ceil(mean + 8 * sd) + 1);
		if (hi - lo < 4) {
			lo = Math.max(0, Math.floor(mean) - 3);
			hi = Math.min(n, Math.ceil(mean) + 3);
		}
		return [lo, hi];
	}

	// ===== グラフ描画 =====

	// 動的層（棒・曲線・軸）。軸ラベルの texFO は静的層として初回のみ描画し，
	// スライダー入力のたびの MathJax 再組版を避ける。
	let plot = null;

	function drawChart(n, p) {
		const svg = d3.select("#ba-chart");
		if (!svg.node()) return;

		const width = 640;
		const height = 320;
		const margin = { top: 14, right: 16, bottom: 40, left: 60 };

		if (!plot) {
			plot = svg.append("g");
			texFO(svg, (margin.left + width - margin.right) / 2, height - 20, 120, 18, "\\(k\\ (\\text{成功回数})\\)", {
				anchor: "topcenter", size: "12px"
			});
			texFO(svg, 16, (margin.top + height - margin.bottom) / 2, 42, 18, "\\(\\text{確率}\\)", {
				anchor: "center", size: "12px"
			}).attr("transform", `rotate(-90 16 ${(margin.top + height - margin.bottom) / 2})`);
			typesetSvg(svg);
		}
		plot.selectAll("*").remove();

		// p を (0,1) の内側へクランプ（p=0/1 での log(0)・σ=0 による NaN を防ぐ防御）
		const pc = Math.min(1 - 1e-12, Math.max(1e-12, p));
		const lambda = n * pc;
		const mean = lambda;
		const sd = Math.max(1e-9, Math.sqrt(n * pc * (1 - pc)));
		const [lo, hi] = windowRange(n, pc);
		const logP = Math.log(pc);
		const logQ = Math.log(1 - pc);
		const logLambda = Math.log(lambda);

		const ms = d3.range(lo, hi + 1);
		const binom = ms.map((m) => Math.exp(logChoose(n, m) + m * logP + (n - m) * logQ));
		const poisson = ms.map((m) => Math.exp(m * logLambda - logFact(m) - lambda));

		const yMaxData = Math.max(d3.max(binom) || 0, d3.max(poisson) || 0, normalPdf(mean, mean, sd));
		const yMax = yMaxData * 1.08 || 1;

		// x は m を「棒の中心」として左右に 0.5 の余白をとる
		const x = d3.scaleLinear()
			.domain([lo - 0.5, hi + 0.5])
			.range([margin.left, width - margin.right]);
		const y = d3.scaleLinear()
			.domain([0, yMax])
			.nice()
			.range([height - margin.bottom, margin.top]);

		// --- 二項分布：青の棒 ---
		const barW = Math.max(0.6, (x(1) - x(0)) - 0.8);
		plot.append("g")
			.attr("fill", BINOM)
			.attr("fill-opacity", 0.72)
			.selectAll("rect")
			.data(ms)
			.join("rect")
			.attr("x", (m) => x(m) - barW / 2)
			.attr("width", barW)
			.attr("y", (m, i) => y(binom[i]))
			.attr("height", (m, i) => y(0) - y(binom[i]));

		// --- 正規近似：黒の滑らかな曲線 ---
		const curveStep = (hi - lo) / 200;
		// x ドメイン全体（lo-0.5 〜 hi+0.5）で描き，平均が小さいとき正規曲線が
		// k=0 を越えて左（負の側）まで続く様子が見えるようにする。
		const gaussData = d3.range(lo - 0.5, hi + 0.5 + curveStep * 0.5, curveStep)
			.map((v) => ({ x: v, y: normalPdf(v, mean, sd) }));
		plot.append("path")
			.datum(gaussData)
			.attr("fill", "none")
			.attr("stroke", NORMAL)
			.attr("stroke-opacity", 0.7)
			.attr("stroke-width", 2)
			.attr("d", d3.line().x((d) => x(d.x)).y((d) => y(d.y)).curve(d3.curveMonotoneX));

		// --- ポアソン近似：橙の折れ線（離散分布なので補間せず整数点を直線でつなぐ。点は少数のときだけ） ---
		const poisData = ms.map((m, i) => ({ x: m, y: poisson[i] }));
		plot.append("path")
			.datum(poisData)
			.attr("fill", "none")
			.attr("stroke", POISSON)
			.attr("stroke-width", 2.2)
			.attr("d", d3.line().x((d) => x(d.x)).y((d) => y(d.y)));
		if (ms.length <= 45) {
			plot.append("g")
				.attr("fill", POISSON)
				.selectAll("circle")
				.data(poisData)
				.join("circle")
				.attr("cx", (d) => x(d.x))
				.attr("cy", (d) => y(d.y))
				.attr("r", 3.8)
				.attr("stroke", PROB_COLORS.node)
				.attr("stroke-width", 1);
		}

		// --- 軸（スケール更新で毎回描き直すので styleAxis も毎回適用する） ---
		plot.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).ticks(8).tickSizeOuter(0).tickFormat(d3.format(",d")))
			.call(styleAxis);
		plot.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~g")))
			.call(styleAxis);
	}

	// ===== 近似の関係図 =====

	function drawTriangle() {
		const svg = d3.select("#ba-triangle");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const GRAY = PROB_COLORS.sub; // この図での「正規分布」の役割色

		const defs = svg.append("defs");
		[["arrow-p", POISSON], ["arrow-n", GRAY]].forEach(([id, color]) => {
			defs.append("marker")
				.attr("id", id)
				.attr("viewBox", "0 0 10 10")
				.attr("refX", 8).attr("refY", 5)
				.attr("markerWidth", 7).attr("markerHeight", 7)
				.attr("orient", "auto-start-reverse")
				.append("path")
				.attr("d", "M0,0 L10,5 L0,10 z")
				.attr("fill", color);
		});

		// 3 つのノード。w は中の式の長さに合わせる。label（分布名）はボックス外，tex（式）はボックス内に白抜きで置く。
		const boxes = [
			{ id: "bin",  cx: 310, cy: 54,  w: 128, h: 46, color: BINOM,   textColor: PROB_COLORS.DCText, tex: "\\(\\mathrm{Bin}(n,p)\\)",           label: "二項分布",     labelPos: "above" },
			{ id: "pois", cx: 148, cy: 228, w: 128, h: 46, color: POISSON, textColor: PROB_COLORS.DText,  tex: "\\(\\mathrm{Po}(\\lambda)\\)",        label: "ポアソン分布", labelPos: "below" },
			{ id: "norm", cx: 472, cy: 228, w: 128, h: 46, color: GRAY,    textColor: GRAY,               tex: "\\(\\mathcal{N}(np,\\,np(1-p))\\)", label: "正規分布",     labelPos: "below" }
		];
		const byId = {};
		boxes.forEach((b) => (byId[b.id] = b));

		// 矢印は縁で止める（ボックス中心を結ぶ直線とボックス外周の交点）
		function edgePoint(box, tx, ty) {
			const dx = tx - box.cx;
			const dy = ty - box.cy;
			const hx = box.w / 2 + 6;
			const hy = box.h / 2 + 6;
			const sx = dx === 0 ? Infinity : hx / Math.abs(dx);
			const sy = dy === 0 ? Infinity : hy / Math.abs(dy);
			const s = Math.min(sx, sy);
			return [box.cx + dx * s, box.cy + dy * s];
		}

		function arrow(fromId, toId, marker) {
			const a = byId[fromId];
			const b = byId[toId];
			const [x1, y1] = edgePoint(a, b.cx, b.cy);
			const [x2, y2] = edgePoint(b, a.cx, a.cy);
			svg.append("line")
				.attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2)
				.attr("stroke", marker === "arrow-p" ? POISSON : GRAY)
				.attr("stroke-width", 1.8)
				.attr("marker-end", `url(#${marker})`);
			return [(x1 + x2) / 2, (y1 + y2) / 2];
		}

		// 矢印（Bin→ポアソンは橙，Bin→正規・ポアソン→正規はグレー）
		arrow("bin", "pois", "arrow-p");
		arrow("bin", "norm", "arrow-n");
		const midPN = arrow("pois", "norm", "arrow-n");

		// Bin → ポアソン のキャプション（矢印の左外側・中央揃え）
		texFO(svg, 148, 106, 162, 20, "\\(\\lambda=np\\,\\) を固定して \\(\\,n\\to\\infty\\)", { anchor: "topcenter", color: PROB_COLORS.DText, size: "12px", align: "center" });
		texFO(svg, 148, 128, 162, 18, "（少数の法則）", { anchor: "topcenter", color: PROB_COLORS.DText, size: "12px", align: "center" });

		// Bin → 正規 のキャプション（矢印の右外側・中央揃え）
		texFO(svg, 476, 106, 170, 20, "\\(p\\,\\) を固定して \\(\\,n\\to\\infty\\)", { anchor: "topcenter", color: GRAY, size: "12px", align: "center" });
		texFO(svg, 476, 128, 170, 18, "（ド・モアブル＝ラプラス）", { anchor: "topcenter", color: GRAY, size: "12px", align: "center" });

		// ポアソン → 正規（λ→∞）。矢印の中点で水平中央・線の少し上。
		texFO(svg, midPN[0], midPN[1] - 26, 80, 18, "\\(\\lambda\\to\\infty\\)", { anchor: "topcenter", color: GRAY, size: "12px", align: "center" });
		// この経路の到達点は N(λ,λ)。正規ボックスの式は Bin 側パラメータなので，矢印の下に補足する。
		texFO(svg, midPN[0], midPN[1] + 6, 120, 18, "\\(\\approx\\mathcal{N}(\\lambda,\\lambda)\\)", { anchor: "topcenter", color: GRAY, size: "11px", align: "center" });

		// ボックスを最後に描く（矢印の上）。特徴色で塗り，式は白抜き，分布名はボックス外に置く。
		boxes.forEach((b) => {
			const g = svg.append("g");
			g.append("rect")
				.attr("x", b.cx - b.w / 2).attr("y", b.cy - b.h / 2)
				.attr("width", b.w).attr("height", b.h)
				.attr("rx", 9)
				.attr("fill", b.color);
			const ly = b.labelPos === "above" ? b.cy - b.h / 2 - 7 : b.cy + b.h / 2 + 16;
			g.append("text")
				.attr("x", b.cx).attr("y", ly)
				.attr("text-anchor", "middle")
				.attr("font-size", 13)
				.attr("fill", b.textColor)
				.attr("font-weight", "bold")
				.text(b.label);
			texFO(g, b.cx, b.cy, b.w - 10, 28, b.tex, { anchor: "center", color: PROB_COLORS.node, size: "14.5px" });
		});

		typesetSvg(svg);
	}

	// ===== デモの制御 =====

	function setupDemo() {
		const nSlider = document.getElementById("ba-n");
		const pSlider = document.getElementById("ba-p");
		const lambdaSlider = document.getElementById("ba-lambda");
		const pRow = document.getElementById("ba-p-row");
		const lambdaRow = document.getElementById("ba-lambda-row");
		const liveOut = document.getElementById("ba-live");
		const modeRadios = Array.from(document.querySelectorAll('input[name="ba-mode"]'));
		if (!nSlider || !pSlider || !lambdaSlider) return;
		let liveTimer = 0;

		const out = {
			n: document.getElementById("ba-n-out"),
			p: document.getElementById("ba-p-out"),
			lambda: document.getElementById("ba-lambda-out"),
			rN: document.getElementById("ba-r-n"),
			rP: document.getElementById("ba-r-p"),
			rLambda: document.getElementById("ba-r-lambda"),
			rSd: document.getElementById("ba-r-sd")
		};

		const fmtInt = d3.format(",d");
		const fmtP = (v) => (v >= 0.01 ? d3.format(".3~f")(v) : d3.format(".2~e")(v));
		const fmtG = d3.format(".3~g");

		function mode() {
			return modeRadios.find((r) => r.checked).value;
		}

		function update(announceDelay = 600) {
			let n = Math.max(2, Math.round(10 ** nSlider.valueAsNumber));
			let p, lambda;
			if (mode() === "poisson") {
				lambda = 10 ** lambdaSlider.valueAsNumber;
				// 二項分布には n ≥ λ が必要。n がそれを下回るときは n を引き上げ，
				// 選んだ λ を保ったまま p = λ/n ≤ 1 とする（λ を黙って書き換えない）。
				n = Math.max(n, Math.ceil(lambda / 0.999));
				p = lambda / n;
			} else {
				p = 10 ** pSlider.valueAsNumber;
				lambda = n * p;
			}

			const sd = Math.sqrt(n * p * (1 - p));
			out.n.textContent = fmtInt(n);
			out.p.textContent = fmtP(p);
			out.lambda.textContent = fmtG(lambda);
			out.rN.textContent = fmtInt(n);
			out.rP.textContent = fmtP(p);
			out.rLambda.textContent = fmtG(lambda);
			out.rSd.textContent = fmtG(sd);
			nSlider.setAttribute("aria-valuetext", fmtInt(n));
			pSlider.setAttribute("aria-valuetext", fmtP(p));
			lambdaSlider.setAttribute("aria-valuetext", fmtG(lambda));

			drawChart(n, p);
			if (liveOut) {
				window.clearTimeout(liveTimer);
				liveTimer = window.setTimeout(() => {
					liveOut.textContent = [
						`試行回数 n は ${fmtInt(n)}`,
						`成功確率 p は ${fmtP(p)}`,
						`lambda は ${fmtG(lambda)}`,
						`標準偏差は ${fmtG(sd)}`
					].join("，");
				}, announceDelay);
			}
		}

		function applyMode() {
			const poisson = mode() === "poisson";
			pRow.hidden = poisson;
			lambdaRow.hidden = !poisson;
			update(0);
		}

		// 初期値は HTML の data-init-* から読む（プレーン値 → log スケールのスライダー位置へ変換）
		const demo = document.querySelector(".ba-demo");
		if (demo) {
			const setLog = (slider, v) => { if (Number.isFinite(v) && v > 0) slider.value = Math.log10(v); };
			setLog(nSlider, parseFloat(demo.dataset.initN));
			setLog(pSlider, parseFloat(demo.dataset.initP));
			setLog(lambdaSlider, parseFloat(demo.dataset.initLambda));
			if (demo.dataset.initMode) {
				modeRadios.forEach((r) => (r.checked = r.value === demo.dataset.initMode));
			}
		}

		nSlider.addEventListener("input", () => update());
		pSlider.addEventListener("input", () => update());
		lambdaSlider.addEventListener("input", () => update());
		modeRadios.forEach((r) => r.addEventListener("change", applyMode));

		applyMode();
	}

	document.addEventListener("DOMContentLoaded", () => {
		setupDemo();
		drawTriangle();
	});
})();
