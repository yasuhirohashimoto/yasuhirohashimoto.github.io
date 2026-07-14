(() => {
	const Z_MIN = -5;
	const Z_MAX = 5;
	const PRECISION = 6;
	const SVG_NS = "http://www.w3.org/2000/svg";
	const state = {
		zMinus: -1,
		zPlus: 1,
		pLower: 0,
		pUpper: 0
	};

	const elements = {
		preset: document.getElementById("pzc-preset"),
		chart: document.getElementById("pzc-chart"),
		zMinus: document.getElementById("pzc-z-minus"),
		zPlus: document.getElementById("pzc-z-plus"),
		pLower: document.getElementById("pzc-p-lower"),
		pUpper: document.getElementById("pzc-p-upper"),
		pMiddle: document.getElementById("pzc-p-middle"),
		live: document.getElementById("pzc-live"),
		zMinusValue: document.getElementById("pzc-z-minus-value"),
		zPlusValue: document.getElementById("pzc-z-plus-value"),
		pLowerValue: document.getElementById("pzc-p-lower-value"),
		pUpperValue: document.getElementById("pzc-p-upper-value")
	};
	let liveTimer = 0;

	const presets = {
		"sigma-1": { zMinus: -1, zPlus: 1 },
		"sigma-2": { zMinus: -2, zPlus: 2 },
		"sigma-3": { zMinus: -3, zPlus: 3 },
		"sigma-4": { zMinus: -4, zPlus: 4 },
		"sigma-5": { zMinus: -5, zPlus: 5 },
		"two-0.05": { pLower: 0.025, pUpper: 0.025 },
		"two-0.01": { pLower: 0.005, pUpper: 0.005 },
		"two-0.001": { pLower: 0.0005, pUpper: 0.0005 },
		"two-0.0001": { pLower: 0.00005, pUpper: 0.00005 },
		"one-0.05": { pLower: 0, pUpper: 0.05 },
		"one-0.01": { pLower: 0, pUpper: 0.01 },
		"one-0.001": { pLower: 0, pUpper: 0.001 },
		"one-0.0001": { pLower: 0, pUpper: 0.0001 }
	};

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function normalPdf(z) {
		return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
	}

	// 標準正規分布の累積分布関数。Hart (1968) の有理近似（West 2009）で，
	// 倍精度の限界（絶対誤差 ≈ 1e-15）まで正確 ── 表示桁（小数 6 桁・指数 3 桁）を十分満たす。
	function normalCdf(z) {
		if (z === Number.NEGATIVE_INFINITY) return 0;
		if (z === Number.POSITIVE_INFINITY) return 1;
		const zabs = Math.abs(z);
		let c;
		if (zabs > 37) {
			c = 0;
		} else {
			const e = Math.exp(-zabs * zabs / 2);
			if (zabs < 7.07106781186547) {
				let b = 3.52624965998911e-2 * zabs + 0.700383064443688;
				b = b * zabs + 6.37396220353165;
				b = b * zabs + 33.912866078383;
				b = b * zabs + 112.079291497871;
				b = b * zabs + 221.213596169931;
				b = b * zabs + 220.206867912376;
				let d = 8.83883476483184e-2 * zabs + 1.75566716318264;
				d = d * zabs + 16.064177579207;
				d = d * zabs + 86.7807322029461;
				d = d * zabs + 296.564248779674;
				d = d * zabs + 637.333633378831;
				d = d * zabs + 793.826512519948;
				d = d * zabs + 440.413735824752;
				c = e * b / d;
			} else {
				let f = zabs + 0.65;
				f = zabs + 4 / f;
				f = zabs + 3 / f;
				f = zabs + 2 / f;
				f = zabs + 1 / f;
				c = e / (f * 2.506628274631);
			}
		}
		return z > 0 ? 1 - c : c;
	}

	function inverseNormal(p) {
		if (p <= 0) return Number.NEGATIVE_INFINITY;
		if (p >= 1) return Number.POSITIVE_INFINITY;

		const a = [
			-3.969683028665376e+01,
			2.209460984245205e+02,
			-2.759285104469687e+02,
			1.383577518672690e+02,
			-3.066479806614716e+01,
			2.506628277459239e+00
		];
		const b = [
			-5.447609879822406e+01,
			1.615858368580409e+02,
			-1.556989798598866e+02,
			6.680131188771972e+01,
			-1.328068155288572e+01
		];
		const c = [
			-7.784894002430293e-03,
			-3.223964580411365e-01,
			-2.400758277161838e+00,
			-2.549732539343734e+00,
			4.374664141464968e+00,
			2.938163982698783e+00
		];
		const d = [
			7.784695709041462e-03,
			3.224671290700398e-01,
			2.445134137142996e+00,
			3.754408661907416e+00
		];
		const pLow = 0.02425;
		const pHigh = 1 - pLow;
		let q;
		let r;

		if (p < pLow) {
			q = Math.sqrt(-2 * Math.log(p));
			return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
				((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
		}

		if (p > pHigh) {
			q = Math.sqrt(-2 * Math.log(1 - p));
			return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
				((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
		}

		q = p - 0.5;
		r = q * q;
		return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
			(((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
	}

	function format(value) {
		return value.toFixed(PRECISION);
	}

	function formatZ(value) {
		if (value === Number.NEGATIVE_INFINITY) return "−∞";
		if (value === Number.POSITIVE_INFINITY) return "+∞";
		return format(value);
	}

	function formatZForSpeech(value) {
		if (value === Number.NEGATIVE_INFINITY) return "マイナス無限大";
		if (value === Number.POSITIVE_INFINITY) return "プラス無限大";
		return format(value);
	}

	function clampFiniteZ(value) {
		if (!Number.isFinite(value)) return value;
		return clamp(value, Z_MIN, Z_MAX);
	}

	// 確率の表示用: 6 桁丸めで 0.000000 に潰れる微小値（±5σ の裾など）は科学表記にする
	function formatP(value) {
		if (value > 0 && value < 1e-6) {
			return value.toExponential(2);
		}
		return value.toFixed(PRECISION);
	}

	function parseInputValue(input, fallback) {
		const text = input.value.trim().replace("−", "-");
		if (text === "") return fallback;
		if (text === "-∞" || text === "-Infinity") return Number.NEGATIVE_INFINITY;
		if (text === "∞" || text === "+∞" || text === "Infinity" || text === "+Infinity") {
			return Number.POSITIVE_INFINITY;
		}

		const value = Number(text);
		return Number.isFinite(value) ? value : fallback;
	}

	function setPresetToManual() {
		if (elements.preset.value !== "manual") {
			elements.preset.value = "manual";
		}
	}

	function syncFromZ() {
		state.zMinus = clampFiniteZ(state.zMinus);
		state.zPlus = clampFiniteZ(state.zPlus);
		if (state.zMinus > state.zPlus) {
			state.zPlus = state.zMinus;
		}
		state.pLower = normalCdf(state.zMinus);
		state.pUpper = 1 - normalCdf(state.zPlus);
		render();
	}

	function syncFromProbability(changedSide) {
		state.pLower = clamp(state.pLower, 0, 1);
		state.pUpper = clamp(state.pUpper, 0, 1);

		if (state.pLower + state.pUpper > 1) {
			if (changedSide === "lower") {
				state.pUpper = 1 - state.pLower;
			} else {
				state.pLower = 1 - state.pUpper;
			}
		}

		// 確率から得た有限の z も ±5 にクランプし，クランプが効いた場合は
		// 確率側も対応する値に合わせ直して，表示値とグラフを一致させる。
		const zmRaw = inverseNormal(state.pLower);
		const zpRaw = inverseNormal(1 - state.pUpper);
		state.zMinus = clampFiniteZ(zmRaw);
		state.zPlus = clampFiniteZ(zpRaw);
		if (state.zMinus !== zmRaw) state.pLower = normalCdf(state.zMinus);
		if (state.zPlus !== zpRaw) state.pUpper = 1 - normalCdf(state.zPlus);
		if (state.zMinus > state.zPlus) {
			const midpoint = (state.zMinus + state.zPlus) / 2;
			state.zMinus = midpoint;
			state.zPlus = midpoint;
			state.pLower = normalCdf(midpoint);
			state.pUpper = 1 - normalCdf(midpoint);
		}
		render();
	}

	function applyPreset(value) {
		const preset = presets[value];
		if (!preset) return;

		if ("zMinus" in preset) {
			state.zMinus = preset.zMinus;
			state.zPlus = preset.zPlus;
			syncFromZ();
			return;
		}

		state.pLower = preset.pLower;
		state.pUpper = preset.pUpper;
		syncFromProbability("upper");
	}

	function render() {
		const pMiddle = clamp(1 - state.pLower - state.pUpper, 0, 1);

		elements.zMinus.value = format(clamp(state.zMinus, Z_MIN, Z_MAX));
		elements.zPlus.value = format(clamp(state.zPlus, Z_MIN, Z_MAX));
		elements.zMinus.setAttribute("aria-valuetext", formatZForSpeech(state.zMinus));
		elements.zPlus.setAttribute("aria-valuetext", formatZForSpeech(state.zPlus));
		elements.pLower.value = format(state.pLower);
		elements.pUpper.value = format(state.pUpper);
		elements.pMiddle.value = formatP(pMiddle);
		elements.zMinusValue.value = formatZ(state.zMinus);
		elements.zPlusValue.value = formatZ(state.zPlus);
		elements.pLowerValue.value = formatP(state.pLower);
		elements.pUpperValue.value = formatP(state.pUpper);

		drawChart();
		scheduleLiveAnnouncement(pMiddle);
	}

	function scheduleLiveAnnouncement(pMiddle) {
		if (!elements.live) return;
		window.clearTimeout(liveTimer);
		liveTimer = window.setTimeout(() => {
			elements.live.textContent = [
				`下側の z 値 ${formatZForSpeech(state.zMinus)}`,
				`上側の z 値 ${formatZForSpeech(state.zPlus)}`,
				`下側の裾確率 ${formatP(state.pLower)}`,
				`中央部分の確率 ${formatP(pMiddle)}`,
				`上側の裾確率 ${formatP(state.pUpper)}`
			].join("，");
		}, 600);
	}

	function svgElement(name, attrs = {}) {
		const element = document.createElementNS(SVG_NS, name);
		Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
		return element;
	}

	function appendTickLabel(svg, text, x, y, anchor = "middle") {
		const label = svgElement("text", {
			class: "pzc-tick-text",
			x,
			y,
			dy: ".35em",
			"text-anchor": anchor,
			"font-size": 12,
			fill: "var(--viz-tick)"
		});
		label.textContent = text;
		svg.appendChild(label);
		return label;
	}

	let chart = null;

	// 静的層（グリッド・目盛・軸・密度曲線・軸ラベル）と
	// 動的層（面積 3 枚・境界線 2 本・z∓ ラベル）を分けて初回だけ構築する。
	// 以降の入力では動的層の属性のみを更新し，MathJax の再組版を避ける。
	function buildChart() {
		const svg = elements.chart;
		const width = 760;
		const height = 360;
		const margin = { top: 28, right: 30, bottom: 48, left: 54 };
		const plotWidth = width - margin.left - margin.right;
		const plotHeight = height - margin.top - margin.bottom;
		const yMax = 0.43;
		const x = value => margin.left + ((value - Z_MIN) / (Z_MAX - Z_MIN)) * plotWidth;
		const y = value => margin.top + (1 - value / yMax) * plotHeight;

		for (let tick = Z_MIN; tick <= Z_MAX; tick += 1) {
			svg.appendChild(svgElement("line", {
				class: "pzc-grid",
				x1: x(tick),
				y1: margin.top,
				x2: x(tick),
				y2: margin.top + plotHeight
			}));
			appendTickLabel(svg, tick === 0 ? "0" : `${String(tick).replace("-", "−")}σ`, x(tick), height - 18);
		}

		for (let tick = 0; tick <= 0.4; tick += 0.1) {
			svg.appendChild(svgElement("line", {
				class: "pzc-grid",
				x1: margin.left,
				y1: y(tick),
				x2: margin.left + plotWidth,
				y2: y(tick)
			}));
			appendTickLabel(svg, tick.toFixed(1), margin.left - 8, y(tick), "end");
		}

		const curve = [];
		const steps = 280;
		for (let i = 0; i <= steps; i += 1) {
			const value = Z_MIN + (Z_MAX - Z_MIN) * i / steps;
			curve.push([value, normalPdf(value)]);
		}

		const areaLower = svgElement("path", { class: "pzc-area-lower" });
		const areaMiddle = svgElement("path", { class: "pzc-area-middle" });
		const areaUpper = svgElement("path", { class: "pzc-area-upper" });
		svg.appendChild(areaLower);
		svg.appendChild(areaMiddle);
		svg.appendChild(areaUpper);

		svg.appendChild(svgElement("line", {
			class: "pzc-axis",
			x1: margin.left,
			y1: y(0),
			x2: margin.left + plotWidth,
			y2: y(0)
		}));
		svg.appendChild(svgElement("line", {
			class: "pzc-axis",
			x1: margin.left,
			y1: margin.top,
			x2: margin.left,
			y2: margin.top + plotHeight
		}));

		const curvePath = curve.map((point, index) => {
			const command = index === 0 ? "M" : "L";
			return `${command}${x(point[0]).toFixed(2)} ${y(point[1]).toFixed(2)}`;
		}).join(" ");
		svg.appendChild(svgElement("path", {
			class: "pzc-curve",
			d: curvePath
		}));

		const lineLower = svgElement("line", { class: "pzc-line-lower" });
		const lineUpper = svgElement("line", { class: "pzc-line-upper" });
		svg.appendChild(lineLower);
		svg.appendChild(lineUpper);
		// 数式ラベルは共通ヘルパー texFO（assets/diagram-helpers.js）で作る。
		// このページは d3 を読み込まないので，素の SVG 要素をそのまま渡す。
		const labelLower = texFO(svg, 0, 0, 54, 30, "\\(z_-\\)",
			{ anchor: "topleft", color: "var(--viz-red-text)", size: "14px" });
		labelLower.setAttribute("class", "pzc-math-label");
		const labelUpper = texFO(svg, 0, 0, 54, 30, "\\(z_+\\)",
			{ anchor: "topleft", color: "var(--viz-blue-text)", size: "14px" });
		labelUpper.setAttribute("class", "pzc-math-label");

		texFO(svg, margin.left + plotWidth - 14, height - 18, 28, 28, "\\(z\\)",
			{ anchor: "center", color: "var(--viz-tick)", size: "13px" })
			.setAttribute("class", "pzc-math-label");
		texFO(svg, margin.left, margin.top - 14, 62, 28, "\\(f(z)\\)",
			{ anchor: "center", color: "var(--viz-tick)", size: "13px" })
			.setAttribute("class", "pzc-math-label");

		chart = {
			x,
			y,
			curve,
			baseY: y(0),
			labelWidth: 54,
			labelHeight: 30,
			areaLower,
			areaMiddle,
			areaUpper,
			lineLower,
			lineUpper,
			labelLower,
			labelUpper
		};
		typesetSvg(svg); // MathJax の準備を待ってラベルを組版（共通ヘルパー）
	}

	function drawChart() {
		if (!chart) {
			buildChart();
		}

		const { x, y, curve } = chart;
		const zMinus = clamp(state.zMinus, Z_MIN, Z_MAX);
		const zPlus = clamp(state.zPlus, Z_MIN, Z_MAX);

		chart.areaLower.setAttribute("d", areaPathD(curve.filter(point => point[0] <= zMinus), Z_MIN, zMinus, x, y));
		chart.areaMiddle.setAttribute("d", areaPathD(curve.filter(point => point[0] >= zMinus && point[0] <= zPlus), zMinus, zPlus, x, y));
		chart.areaUpper.setAttribute("d", areaPathD(curve.filter(point => point[0] >= zPlus), zPlus, Z_MAX, x, y));

		updateBoundary(chart.lineLower, chart.labelLower, zMinus);
		updateBoundary(chart.lineUpper, chart.labelUpper, zPlus);
	}

	function areaPathD(points, start, end, x, y) {
		const safeStart = clamp(start, Z_MIN, Z_MAX);
		const safeEnd = clamp(end, Z_MIN, Z_MAX);
		if (safeEnd < safeStart) return "";

		const areaPoints = [[safeStart, 0]];
		if (points.length === 0 || points[0][0] > safeStart) {
			areaPoints.push([safeStart, normalPdf(safeStart)]);
		}
		areaPoints.push(...points);
		if (points.length === 0 || points[points.length - 1][0] < safeEnd) {
			areaPoints.push([safeEnd, normalPdf(safeEnd)]);
		}
		areaPoints.push([safeEnd, 0]);

		return areaPoints.map((point, index) => {
			const command = index === 0 ? "M" : "L";
			return `${command}${x(point[0]).toFixed(2)} ${y(point[1]).toFixed(2)}`;
		}).join(" ") + " Z";
	}

	function updateBoundary(line, label, z) {
		const { x, y, baseY, labelWidth, labelHeight } = chart;
		const pdf = normalPdf(z);
		const cx = x(z);
		line.setAttribute("x1", cx);
		line.setAttribute("y1", baseY);
		line.setAttribute("x2", cx);
		line.setAttribute("y2", y(pdf));
		label.setAttribute("x", cx - labelWidth / 2);
		label.setAttribute("y", y(pdf) - 13 - labelHeight / 2);
	}

	function bindEditableValue(input, commit) {
		input.addEventListener("change", commit);
		input.addEventListener("keydown", event => {
			if (event.key === "Enter") {
				event.preventDefault();
				commit();
				event.currentTarget.blur();
			} else if (event.key === "Escape") {
				event.preventDefault();
				render();
				event.currentTarget.blur();
			}
		});
	}

	elements.zMinus.addEventListener("input", event => {
		setPresetToManual();
		state.zMinus = Number(event.target.value);
		syncFromZ();
	});

	elements.zPlus.addEventListener("input", event => {
		setPresetToManual();
		state.zPlus = Number(event.target.value);
		if (state.zPlus < state.zMinus) {
			state.zMinus = state.zPlus;
		}
		syncFromZ();
	});

	elements.pLower.addEventListener("input", event => {
		setPresetToManual();
		state.pLower = Number(event.target.value);
		syncFromProbability("lower");
	});

	elements.pUpper.addEventListener("input", event => {
		setPresetToManual();
		state.pUpper = Number(event.target.value);
		syncFromProbability("upper");
	});

	bindEditableValue(elements.zMinusValue, () => {
		setPresetToManual();
		state.zMinus = parseInputValue(elements.zMinusValue, state.zMinus);
		syncFromZ();
	});

	bindEditableValue(elements.zPlusValue, () => {
		setPresetToManual();
		state.zPlus = parseInputValue(elements.zPlusValue, state.zPlus);
		if (state.zPlus < state.zMinus) {
			state.zMinus = state.zPlus;
		}
		syncFromZ();
	});

	bindEditableValue(elements.pLowerValue, () => {
		setPresetToManual();
		state.pLower = parseInputValue(elements.pLowerValue, state.pLower);
		syncFromProbability("lower");
	});

	bindEditableValue(elements.pUpperValue, () => {
		setPresetToManual();
		state.pUpper = parseInputValue(elements.pUpperValue, state.pUpper);
		syncFromProbability("upper");
	});

	elements.preset.addEventListener("change", event => {
		applyPreset(event.target.value);
	});

	syncFromZ();
})();
