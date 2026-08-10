(function () {
	"use strict";

	const svgNS = "http://www.w3.org/2000/svg";
	const width = 820;
	const margin = { left: 70, right: 34 };
	const plotLeft = margin.left;
	const plotRight = width - margin.right;
	const axisMin = 0;
	const axisMax = 1;
	const populationSize = 360;
	const sampleSize = 10;
	const colors = {
		pop: "var(--viz-axis)",
		sample: "var(--viz-blue)",
		mu: "var(--viz-orange)",
		xbar: "var(--viz-green)",
		muText: "var(--viz-orange-text)",
		xbarText: "var(--viz-green-text)",
		lineMu: "var(--viz-orange)",
		lineXbar: "var(--viz-green)",
		axis: "var(--viz-axis)",
		muted: "var(--viz-tick)",
		text: "var(--viz-label)",
		node: "var(--bg)"
	};

	const state = {
		population: [],
		sample: [],
		trials: 0,
		sumQmu: 0,
		sumS2: 0,
		sumU2: 0
	};

	function mulberry32(seed) {
		let t = seed >>> 0;
		return function () {
			t += 0x6D2B79F5;
			let r = Math.imul(t ^ (t >>> 15), t | 1);
			r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
	}

	const rng = mulberry32(20260527);

	function randn() {
		let u = 0;
		let v = 0;
		while (u === 0) u = rng();
		while (v === 0) v = rng();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	function createPopulation() {
		const values = [];
		for (let i = 0; i < populationSize; i++) {
			const center = rng() < 0.55 ? 0.38 : 0.67;
			values.push(clamp(center + 0.11 * randn(), axisMin, axisMax));
		}
		return values;
	}

	function mean(values) {
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	}

	function varianceAround(values, center) {
		return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
	}

	function sampleFromPopulation(n) {
		const sample = [];
		for (let i = 0; i < n; i++) {
			sample.push(state.population[Math.floor(rng() * state.population.length)]);
		}
		return sample;
	}

	function xScale(value) {
		return plotLeft + (value - axisMin) / (axisMax - axisMin) * (plotRight - plotLeft);
	}

	function fmt(value) {
		return Number.isFinite(value) ? value.toFixed(4) : "--";
	}

	function el(name, attrs = {}, text = "") {
		const node = document.createElementNS(svgNS, name);
		Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
		if (text) node.textContent = text;
		return node;
	}

	function clear(svg) {
		while (svg.firstChild) svg.removeChild(svg.firstChild);
	}

	function drawAxis(svg, y, label) {
		svg.appendChild(el("line", {
			x1: plotLeft,
			y1: y,
			x2: plotRight,
			y2: y,
			stroke: colors.axis,
			"stroke-width": 1
		}));
		for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
			const x = xScale(tick);
			svg.appendChild(el("line", {
				x1: x,
				y1: y,
				x2: x,
				y2: y + 5,
				stroke: colors.axis,
				"stroke-width": 1
			}));
			svg.appendChild(el("text", {
				x,
				y: y + 19,
				"text-anchor": "middle",
				"font-size": 13,
				fill: colors.muted
			}, tick.toFixed(tick === 0 || tick === 1 ? 0 : 2)));
		}
		if (label) {
			svg.appendChild(el("text", {
				x: 16,
				y: y - 16,
				"font-size": 13,
				"font-weight": 700,
				fill: colors.text
			}, label));
		}
	}

	function drawRug(svg, values, y, options) {
		const { color, height: tickHeight, width: tickWidth, opacity } = options;
		values.forEach((value) => {
			const x = xScale(value);
			const y0 = y - tickHeight / 2;
			const y1 = y + tickHeight / 2;
			svg.appendChild(el("line", {
				x1: x,
				y1: y0,
				x2: x,
				y2: y1,
				stroke: color,
				"stroke-width": tickWidth,
				"stroke-opacity": opacity,
				"stroke-linecap": "butt"
			}));
		});
	}

	function drawCenterLine(svg, value, y0, y1, color, tex, textColor) {
		const x = xScale(value);
		svg.appendChild(el("line", {
			x1: x,
			y1: y0,
			x2: x,
			y2: y1,
			stroke: color,
			"stroke-width": 2,
			"stroke-dasharray": "5 4"
		}));
		texFO(svg, x, y0 - 20, 40, 20, "\\(" + tex + "\\)", {
			anchor: "topcenter",
			color: textColor || color,
			size: "15px"
		});
	}

	// 各標本点から μ（上・橙）と X̄（下・緑）の両方へ線分を伸ばすペア表示
	function drawPairedDeviationRows(svg, sample, mu, xbar, yBase, rowSpan) {
		const rowCount = sample.length;
		const rowGap = rowCount > 1 ? rowSpan / (rowCount - 1) : 0;
		const muX = xScale(mu);
		const xbarX = xScale(xbar);
		const pairOffset = 2.2;
		svg.appendChild(el("line", {
			x1: muX,
			y1: yBase - 8,
			x2: muX,
			y2: yBase + rowSpan + 8,
			stroke: colors.mu,
			"stroke-width": 2,
			"stroke-dasharray": "5 4"
		}));
		svg.appendChild(el("line", {
			x1: xbarX,
			y1: yBase - 8,
			x2: xbarX,
			y2: yBase + rowSpan + 8,
			stroke: colors.xbar,
			"stroke-width": 2,
			"stroke-dasharray": "5 4"
		}));
		sample.forEach((value, i) => {
			const y = yBase + i * rowGap;
			const x = xScale(value);
			svg.appendChild(el("line", {
				x1: Math.min(muX, x),
				y1: y - pairOffset,
				x2: Math.max(muX, x),
				y2: y - pairOffset,
				stroke: colors.lineMu,
				"stroke-width": 2,
				"stroke-opacity": 0.45,
				"stroke-linecap": "round"
			}));
			svg.appendChild(el("line", {
				x1: Math.min(xbarX, x),
				y1: y + pairOffset,
				x2: Math.max(xbarX, x),
				y2: y + pairOffset,
				stroke: colors.lineXbar,
				"stroke-width": 2,
				"stroke-opacity": 0.45,
				"stroke-linecap": "round"
			}));
			svg.appendChild(el("circle", {
				cx: x,
				cy: y,
				r: 4,
				fill: colors.sample,
				"fill-opacity": 0.9,
				stroke: colors.node,
				"stroke-width": 1
			}));
		});
	}

	function updateStats(latest) {
		const popVar = state.population.length > 0
			? varianceAround(state.population, mean(state.population))
			: NaN;
		const avgQmu = state.trials > 0 ? state.sumQmu / state.trials : NaN;
		const avgS2 = state.trials > 0 ? state.sumS2 / state.trials : NaN;
		const avgU2 = state.trials > 0 ? state.sumU2 / state.trials : NaN;
		document.getElementById("variance-demo-avg-qmu").textContent = fmt(avgQmu);
		document.getElementById("variance-demo-qmu").textContent = fmt(latest.qMu);
		document.getElementById("variance-demo-s2").textContent = fmt(latest.s2);
		document.getElementById("variance-demo-u2").textContent = fmt(latest.u2);
		document.getElementById("variance-demo-count").textContent = String(state.trials);
		document.getElementById("variance-demo-popvar").textContent = fmt(popVar);
		document.getElementById("variance-demo-avg-s2").textContent = fmt(avgS2);
		document.getElementById("variance-demo-avg-u2").textContent = fmt(avgU2);
	}

	function render() {
		const svg = document.getElementById("variance-demo-svg");
		if (!svg) return;
		clear(svg);

		const mu = mean(state.population);
		const popVar = varianceAround(state.population, mu);
		const n = sampleSize;
		const hasSample = state.sample.length === n;
		const xbar = hasSample ? mean(state.sample) : NaN;
		const s2 = hasSample ? varianceAround(state.sample, xbar) : NaN;
		const u2 = hasSample ? n / (n - 1) * s2 : NaN;
		const qMu = hasSample ? varianceAround(state.sample, mu) : NaN;

		// 上段：母集団（グレー）と最新の標本（青）を同じ数直線に重ねる。
		// 色の凡例は図中に置かず本文で説明する。
		drawAxis(svg, 70, "");
		drawRug(svg, state.population, 56, {
			color: colors.pop,
			height: 22,
			width: 1,
			opacity: 0.42
		});
		if (hasSample) {
			drawRug(svg, state.sample, 56, {
				color: colors.sample,
				height: 26,
				width: 3,
				opacity: 0.9
			});
		}
		// μ と X̄ のラベルは行を分けて，2 本が近接しても衝突しないようにする
		drawCenterLine(svg, mu, 32, 72, colors.mu, "\\mu", colors.muText);
		if (hasSample) {
			drawCenterLine(svg, xbar, 46, 72, colors.xbar, "\\bar{X}", colors.xbarText);
		}
		// 下段：各標本点から μ と X̄ の両方へ伸びる偏差のペア。
		// イベントプロットの直下に置き，同じ x 位置で上下の対応が読めるようにする。
		// 数値はすべて図の外（最新の標本／累積の 2 行）に出す。
		if (hasSample) {
			drawPairedDeviationRows(svg, state.sample, mu, xbar, 104, 90);
		}

		typesetSvg(svg);
		updateStats({ qMu, s2, u2 });
	}

	function drawSample(addToStats = true) {
		const n = sampleSize;
		state.sample = sampleFromPopulation(n);
		const mu = mean(state.population);
		const xbar = mean(state.sample);
		const qMu = varianceAround(state.sample, mu);
		const s2 = varianceAround(state.sample, xbar);
		const u2 = n / (n - 1) * s2;
		if (addToStats) {
			state.trials += 1;
			state.sumQmu += qMu;
			state.sumS2 += s2;
			state.sumU2 += u2;
		}
		render();
	}

	function resetStats() {
		state.trials = 0;
		state.sumQmu = 0;
		state.sumS2 = 0;
		state.sumU2 = 0;
		state.sample = [];
		render();
	}

	function batchDraw(times) {
		const n = sampleSize;
		const mu = mean(state.population);
		for (let i = 0; i < times; i++) {
			state.sample = sampleFromPopulation(n);
			const xbar = mean(state.sample);
			const qMu = varianceAround(state.sample, mu);
			const s2 = varianceAround(state.sample, xbar);
			const u2 = n / (n - 1) * s2;
			state.trials += 1;
			state.sumQmu += qMu;
			state.sumS2 += s2;
			state.sumU2 += u2;
		}
		render();
	}

	function init() {
		const root = document.getElementById("variance-demo");
		if (!root) return;
		state.population = createPopulation();
		document.getElementById("variance-demo-reroll").addEventListener("click", () => drawSample(true));
		document.getElementById("variance-demo-batch").addEventListener("click", () => batchDraw(100));
		document.getElementById("variance-demo-reset").addEventListener("click", resetStats);
		render();
	}

	document.addEventListener("DOMContentLoaded", init);
})();
