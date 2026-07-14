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
		svg.appendChild(el("text", {
			x: 16,
			y: y - 16,
			"font-size": 13,
			"font-weight": 700,
			fill: colors.text
		}, label));
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

	function drawCenterLine(svg, value, y0, y1, color, label, textColor) {
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
		svg.appendChild(el("text", {
			x,
			y: y0 - 6,
			"text-anchor": "middle",
			"font-size": 13,
			"font-weight": 700,
			fill: textColor || color
		}, label));
	}

	function drawDeviationRows(svg, sample, center, yBase, color, label, value, textColor) {
		const rowCount = sample.length;
		const rowSpan = 36;
		const rowGap = rowCount > 1 ? rowSpan / (rowCount - 1) : 0;
		const centerX = xScale(center);
		drawCenterLine(svg, center, yBase - 10, yBase + rowSpan + 4, color, label.includes("μ") ? "μ" : "X̄", textColor);
		sample.forEach((value, i) => {
			const y = yBase + i * rowGap;
			const x = xScale(value);
			svg.appendChild(el("line", {
				x1: Math.min(centerX, x),
				y1: y,
				x2: Math.max(centerX, x),
				y2: y,
				stroke: color,
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
		// 段ラベルは最後に描き，背後に背景色の rect を敷いて偏差線・点との重なりを防ぐ
		const labelNode = el("text", {
			x: 16,
			y: yBase + rowSpan / 2 + 4,
			"font-size": 12,
			"font-weight": 700,
			fill: colors.text
		}, `${label} = ${fmt(value)}`);
		svg.appendChild(labelNode);
		const box = labelNode.getBBox();
		svg.insertBefore(el("rect", {
			x: box.x - 4,
			y: box.y - 2,
			width: box.width + 8,
			height: box.height + 4,
			style: "fill: var(--bg)"
		}), labelNode);
	}

	function updateStats() {
		const popVar = state.population.length > 0
			? varianceAround(state.population, mean(state.population))
			: NaN;
		const avgS2 = state.trials > 0 ? state.sumS2 / state.trials : NaN;
		const avgU2 = state.trials > 0 ? state.sumU2 / state.trials : NaN;
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
		const n = Number(document.getElementById("variance-demo-n").value);
		const hasSample = state.sample.length === n;
		const xbar = hasSample ? mean(state.sample) : NaN;
		const s2 = hasSample ? varianceAround(state.sample, xbar) : NaN;
		const u2 = hasSample ? n / (n - 1) * s2 : NaN;
		const qMu = hasSample ? varianceAround(state.sample, mu) : NaN;

		drawAxis(svg, 58, "母集団");
		drawRug(svg, state.population, 45, {
			color: colors.pop,
			height: 22,
			width: 1,
			opacity: 0.42
		});
		drawCenterLine(svg, mu, 24, 60, colors.mu, "μ", colors.muText);
		svg.appendChild(el("text", {
			x: plotRight,
			y: 26,
			"text-anchor": "end",
			"font-size": 12,
			fill: colors.muted
		}, `母分散 σ² = ${fmt(popVar)}`));

		drawAxis(svg, 126, hasSample ? "標本（最新の 1 回）" : "標本");
		if (hasSample) {
			drawRug(svg, state.sample, 113, {
				color: colors.sample,
				height: 22,
				width: 3,
				opacity: 0.9
			});
			drawCenterLine(svg, xbar, 90, 128, colors.xbar, "X̄", colors.xbarText);
		}
		svg.appendChild(el("text", {
			x: plotRight,
			y: 94,
			"text-anchor": "end",
			"font-size": 12,
			fill: colors.muted
		}, `最新の標本：S² = ${fmt(s2)}，s² = ${fmt(u2)}`));

		if (hasSample) {
			drawDeviationRows(svg, state.sample, mu, 174, colors.lineMu, "μ 中心の平均二乗偏差", qMu, colors.muText);

			drawDeviationRows(svg, state.sample, xbar, 236, colors.lineXbar, "X̄ 中心の平均二乗偏差 S²", s2, colors.xbarText);
		}

		updateStats();
	}

	function drawSample(addToStats = true) {
		const n = Number(document.getElementById("variance-demo-n").value);
		state.sample = sampleFromPopulation(n);
		const xbar = mean(state.sample);
		const s2 = varianceAround(state.sample, xbar);
		const u2 = n / (n - 1) * s2;
		if (addToStats) {
			state.trials += 1;
			state.sumS2 += s2;
			state.sumU2 += u2;
		}
		render();
	}

	function resetStats() {
		state.trials = 0;
		state.sumS2 = 0;
		state.sumU2 = 0;
		state.sample = [];
		render();
	}

	function batchDraw(times) {
		const n = Number(document.getElementById("variance-demo-n").value);
		for (let i = 0; i < times; i++) {
			state.sample = sampleFromPopulation(n);
			const xbar = mean(state.sample);
			const s2 = varianceAround(state.sample, xbar);
			const u2 = n / (n - 1) * s2;
			state.trials += 1;
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
		document.getElementById("variance-demo-n").addEventListener("change", resetStats);
		drawSample(true);
	}

	document.addEventListener("DOMContentLoaded", init);
})();
