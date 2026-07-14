// Uncorrelated-but-not-independent scatter + histogram demo.
// Same machinery as the marginal-probability demo (WebGL 2 scatter that scales
// to N ~ 10^6, SVG histograms / ticks / labels / overlays, cancellable chunked
// generation, hit-band hover) but the distribution is different:
//   θ ~ Uniform(0, 2π),  r = 1 + σ_r · Z   (Z standard normal),
//   X = r cos θ,  Y = r sin θ.
// Points scatter around the unit circle. E[X] = E[Y] = 0 and Cov(X, Y) = 0
// (uncorrelated), yet X and Y are clearly dependent — the conditional
// distribution of Y given X is bimodal near ±√(1 − x²).

(async () => {
	"use strict";

	const TAU = Math.PI * 2;

	// === DOM ===
	const sigmaRSlider = document.getElementById("sigmaR");
	const sigmaRNum    = document.getElementById("sigmaR-num");
	const nSlider      = document.getElementById("n");
	const nNum         = document.getElementById("n-num");
	const liveStatus   = document.getElementById("circle-live");
	const container    = document.querySelector(".circle-viz");
	const canvas       = document.getElementById("circle-canvas");
	const svgEl        = document.getElementById("circle-svg");

	// === Layout (matches SVG viewBox 480x480) ===
	const VB_W = 480, VB_H = 480;
	const HIST_SIZE = 60;
	const M = { top: 10, right: 10, bottom: 30, left: 30 };
	const SCATTER_X = M.left;                              //  30
	const SCATTER_Y = M.top + HIST_SIZE;                   //  70
	const SCATTER_W = VB_W - M.left - M.right - HIST_SIZE; // 380
	const SCATTER_H = VB_H - M.top - M.bottom - HIST_SIZE; // 380

	const N_BINS = 80;
	const HOVER_THRESHOLD_PX = 8;
	let liveTimer = 0;
	let pendingLiveMessage = "";

	function scheduleLiveAnnouncement(message) {
		if (!liveStatus || !message) return;
		pendingLiveMessage = message;
		window.clearTimeout(liveTimer);
		liveStatus.textContent = "";
		liveTimer = window.setTimeout(() => {
			liveStatus.textContent = pendingLiveMessage;
		}, 600);
	}

	function cancelLiveAnnouncement() {
		window.clearTimeout(liveTimer);
		pendingLiveMessage = "";
		if (liveStatus) liveStatus.textContent = "";
	}

	function colorToRgb(color) {
		const hex = color.startsWith("#") ? color.slice(1) : color;
		if (/^[0-9a-f]{6}$/i.test(hex)) {
			return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
		}
		const match = color.match(/[\d.]+/g);
		return match ? match.slice(0, 3).map(Number) : [0, 0, 0];
	}
	function cssToken(name, fallback) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
	}

	const COLOR_NORMAL_RGB = colorToRgb(PROB_COLORS.text).map(v => v / 255);
	const COLOR_HOVER_RGB  = colorToRgb(PROB_COLORS.D).map(v => v / 255);
	const COLOR_BAR        = PROB_COLORS.DC;
	const COLOR_BAR_HOVER  = PROB_COLORS.D;
	const COLOR_BAR_FADED  = PROB_COLORS.DCLight;
	const COLOR_BACKGROUND = cssToken("--bg", PROB_COLORS.node);

	// === WebGL 2 setup ===
	const gl = canvas.getContext("webgl2", {
		antialias: true,
		alpha: true,
		premultipliedAlpha: false,
	});
	if (!gl) {
		container.innerHTML = '<p style="text-align:center;color:var(--viz-red-text)">' +
			'このブラウザは WebGL 2 をサポートしていません。Chrome / Firefox / Safari 15+ などで試してください。' +
			'</p>';
		return;
	}

	const VS = `#version 300 es
		in vec2 a_position;
		uniform vec4 u_view;            // (xmin, ymin, xmax, ymax) in data coords
		uniform float u_binWidth;
		uniform float u_pointSize;
		uniform float u_pointSizeHover;
		uniform vec3  u_colorNormal;
		uniform vec3  u_colorHover;
		uniform float u_alphaNormal;
		uniform float u_alphaHover;
		uniform int   u_hoverMode;      // 0=none, 1=point, 2=xbar, 3=ybar
		uniform int   u_hoverIndex;     // 1: vertex id; 2: xi; 3: yi
		uniform int   u_passMode;       // 0=base pass; 1=overlay pass (positions buffer = hover only)
		out vec4 v_color;
		void main() {
			vec2 norm = (a_position - u_view.xy) / (u_view.zw - u_view.xy);
			vec2 clip = norm * 2.0 - 1.0;
			gl_Position = vec4(clip, 0.0, 1.0);

			if (u_passMode == 1) {
				v_color = vec4(u_colorHover, u_alphaHover);
				gl_PointSize = u_pointSizeHover;
				return;
			}

			bool isHover = false;
			if (u_hoverMode == 1) {
				isHover = (gl_VertexID == u_hoverIndex);
			} else if (u_hoverMode == 2) {
				int xi = int(floor((a_position.x - u_view.x) / u_binWidth));
				isHover = (xi == u_hoverIndex);
			} else if (u_hoverMode == 3) {
				int yi = int(floor((a_position.y - u_view.y) / u_binWidth));
				isHover = (yi == u_hoverIndex);
			}
			if (isHover) {
				v_color = vec4(u_colorHover, u_alphaHover);
				gl_PointSize = u_pointSizeHover;
			} else {
				v_color = vec4(u_colorNormal, u_alphaNormal);
				gl_PointSize = u_pointSize;
			}
		}`;

	const FS = `#version 300 es
		precision mediump float;
		in vec4 v_color;
		out vec4 outColor;
		void main() {
			vec2 c = gl_PointCoord - vec2(0.5);
			if (length(c) > 0.5) discard;
			outColor = v_color;
		}`;

	function compile(type, src) {
		const s = gl.createShader(type);
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
			console.error(gl.getShaderInfoLog(s));
			throw new Error("Shader compile failed");
		}
		return s;
	}
	const prog = gl.createProgram();
	gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
	gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
		console.error(gl.getProgramInfoLog(prog));
		throw new Error("Program link failed");
	}
	gl.useProgram(prog);

	const A_POSITION       = gl.getAttribLocation(prog, "a_position");
	const U_VIEW           = gl.getUniformLocation(prog, "u_view");
	const U_BIN_WIDTH      = gl.getUniformLocation(prog, "u_binWidth");
	const U_POINT_SIZE     = gl.getUniformLocation(prog, "u_pointSize");
	const U_POINT_SIZE_HOV = gl.getUniformLocation(prog, "u_pointSizeHover");
	const U_COLOR_NORMAL   = gl.getUniformLocation(prog, "u_colorNormal");
	const U_COLOR_HOVER    = gl.getUniformLocation(prog, "u_colorHover");
	const U_ALPHA_NORMAL   = gl.getUniformLocation(prog, "u_alphaNormal");
	const U_ALPHA_HOVER    = gl.getUniformLocation(prog, "u_alphaHover");
	const U_HOVER_MODE     = gl.getUniformLocation(prog, "u_hoverMode");
	const U_HOVER_INDEX    = gl.getUniformLocation(prog, "u_hoverIndex");
	const U_PASS_MODE      = gl.getUniformLocation(prog, "u_passMode");

	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.enableVertexAttribArray(A_POSITION);
	gl.vertexAttribPointer(A_POSITION, 2, gl.FLOAT, false, 0, 0);
	const hoverPosBuffer = gl.createBuffer();

	gl.uniform3f(U_COLOR_NORMAL, ...COLOR_NORMAL_RGB);
	gl.uniform3f(U_COLOR_HOVER,  ...COLOR_HOVER_RGB);

	gl.enable(gl.BLEND);
	gl.blendFuncSeparate(
		gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,   // RGB
		gl.ONE,       gl.ONE_MINUS_SRC_ALPHA    // Alpha
	);
	gl.clearColor(0, 0, 0, 0);

	function resizeCanvas() {
		const r = container.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const cssW = r.width  * (SCATTER_W / VB_W);
		const cssH = r.height * (SCATTER_H / VB_H);
		canvas.style.width  = cssW + "px";
		canvas.style.height = cssH + "px";
		canvas.style.left = (r.width  * SCATTER_X / VB_W) + "px";
		canvas.style.top  = (r.height * SCATTER_Y / VB_H) + "px";
		canvas.width  = Math.max(1, Math.round(cssW * dpr));
		canvas.height = Math.max(1, Math.round(cssH * dpr));
		gl.viewport(0, 0, canvas.width, canvas.height);
	}

	// Points on the unit circle with Gaussian radial noise (mean radius 1,
	// standard deviation σ_r). Angle uniform on [0, 2π).
	function makeCircle(sigmaR) {
		let cached = NaN;
		function nextNormal() {
			if (!Number.isNaN(cached)) {
				const v = cached;
				cached = NaN;
				return v;
			}
			let u1, u2, r;
			do {
				u1 = Math.random() * 2 - 1;
				u2 = Math.random() * 2 - 1;
				r = u1 * u1 + u2 * u2;
			} while (r >= 1 || r === 0);
			const f = Math.sqrt(-2 * Math.log(r) / r);
			cached = u2 * f;
			return u1 * f;
		}
		return (out, idx) => {
			const theta = Math.random() * TAU;
			const rad = 1 + sigmaR * nextNormal();
			out[idx]     = rad * Math.cos(theta);
			out[idx + 1] = rad * Math.sin(theta);
		};
	}

	const GENERATION_CHUNK_SIZE = 10000;
	function yieldToBrowser() {
		if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
			return globalThis.scheduler.yield();
		}
		return new Promise(resolve => setTimeout(resolve, 0));
	}
	async function yieldAndCheck(isCancelled) {
		await yieldToBrowser();
		return isCancelled();
	}

	async function makeContourGrid(nextPositions, nextN, nextViewMin, nextViewMax, isCancelled) {
		const GRID = 40;
		const counts = new Float64Array(GRID * GRID);
		const span = nextViewMax - nextViewMin;
		if (span <= 0) return { values: counts, peak: 0 };
		const inv = GRID / span;

		for (let start = 0; start < nextN; start += GENERATION_CHUNK_SIZE) {
			const end = Math.min(nextN, start + GENERATION_CHUNK_SIZE);
			for (let i = start; i < end; i++) {
				const x = nextPositions[2 * i];
				const y = nextPositions[2 * i + 1];
				let cx = Math.floor((x - nextViewMin) * inv);
				let cy = Math.floor((nextViewMax - y) * inv);
				if (cx < 0) cx = 0; else if (cx >= GRID) cx = GRID - 1;
				if (cy < 0) cy = 0; else if (cy >= GRID) cy = GRID - 1;
				counts[cy * GRID + cx]++;
			}
			if (end < nextN && await yieldAndCheck(isCancelled)) return null;
		}

		let src = counts;
		let dst = new Float64Array(GRID * GRID);
		for (let pass = 0; pass < 2; pass++) {
			for (let row = 0; row < GRID; row++) {
				for (let col = 0; col < GRID; col++) {
					let s = 0, w = 0;
					const rowLo = Math.max(0, row - 1);
					const rowHi = Math.min(GRID - 1, row + 1);
					const colLo = Math.max(0, col - 1);
					const colHi = Math.min(GRID - 1, col + 1);
					for (let rr = rowLo; rr <= rowHi; rr++) {
						for (let cc = colLo; cc <= colHi; cc++) {
							s += src[rr * GRID + cc];
							w++;
						}
					}
					dst[row * GRID + col] = s / w;
				}
			}
			const t = src;
			src = dst;
			dst = t;
		}

		let peak = 0;
		for (let i = 0; i < src.length; i++) {
			if (src[i] > peak) peak = src[i];
		}
		return { values: src, peak };
	}

	async function generateData(sigmaR, nextN, nBins, isCancelled) {
		const nextPositions = new Float32Array(2 * nextN);
		const nextXis = new Int32Array(nextN);
		const nextYis = new Int32Array(nextN);
		const sample = makeCircle(sigmaR);
		let absMax = 0.001;
		for (let start = 0; start < nextN; start += GENERATION_CHUNK_SIZE) {
			const end = Math.min(nextN, start + GENERATION_CHUNK_SIZE);
			for (let i = start; i < end; i++) {
				sample(nextPositions, 2 * i);
				const ax = Math.abs(nextPositions[2 * i]);
				const ay = Math.abs(nextPositions[2 * i + 1]);
				if (ax > absMax) absMax = ax;
				if (ay > absMax) absMax = ay;
			}
			if (end < nextN && await yieldAndCheck(isCancelled)) return null;
		}
		// A radius-1 ring should not fill the frame edge-to-edge; give it a
		// little air, and never let the frame collapse below the unit circle.
		absMax = Math.max(absMax * 1.08, 1.08);
		const nextViewMin = -absMax;
		const nextViewMax = absMax;
		const nextBinWidth = (nextViewMax - nextViewMin) / nBins;

		const nextXCounts = new Int32Array(nBins);
		const nextYCounts = new Int32Array(nBins);
		const cellCount = nBins * nBins;
		const binCounts = new Int32Array(cellCount);
		for (let start = 0; start < nextN; start += GENERATION_CHUNK_SIZE) {
			const end = Math.min(nextN, start + GENERATION_CHUNK_SIZE);
			for (let i = start; i < end; i++) {
				const xi = Math.min(nBins - 1, Math.max(0, Math.floor((nextPositions[2 * i] - nextViewMin) / nextBinWidth)));
				const yi = Math.min(nBins - 1, Math.max(0, Math.floor((nextPositions[2 * i + 1] - nextViewMin) / nextBinWidth)));
				nextXis[i] = xi;
				nextYis[i] = yi;
				nextXCounts[xi]++;
				nextYCounts[yi]++;
				binCounts[xi * nBins + yi]++;
			}
			if (end < nextN && await yieldAndCheck(isCancelled)) return null;
		}

		let nextXMaxCount = 1, nextYMaxCount = 1;
		for (let i = 0; i < nBins; i++) {
			if (nextXCounts[i] > nextXMaxCount) nextXMaxCount = nextXCounts[i];
			if (nextYCounts[i] > nextYMaxCount) nextYMaxCount = nextYCounts[i];
		}

		const nextBinOffsets = new Int32Array(cellCount + 1);
		for (let i = 0; i < cellCount; i++) {
			nextBinOffsets[i + 1] = nextBinOffsets[i] + binCounts[i];
		}
		const writeOffsets = new Int32Array(nextBinOffsets);
		const nextBinIndices = new Int32Array(nextN);
		for (let start = 0; start < nextN; start += GENERATION_CHUNK_SIZE) {
			const end = Math.min(nextN, start + GENERATION_CHUNK_SIZE);
			for (let i = start; i < end; i++) {
				const id = nextXis[i] * nBins + nextYis[i];
				nextBinIndices[writeOffsets[id]++] = i;
			}
			if (end < nextN && await yieldAndCheck(isCancelled)) return null;
		}

		const contour = await makeContourGrid(nextPositions, nextN, nextViewMin, nextViewMax, isCancelled);
		if (!contour || isCancelled()) return null;

		return {
			n: nextN,
			positions: nextPositions,
			xis: nextXis,
			yis: nextYis,
			xCounts: nextXCounts,
			yCounts: nextYCounts,
			xMaxCount: nextXMaxCount,
			yMaxCount: nextYMaxCount,
			viewMin: nextViewMin,
			viewMax: nextViewMax,
			binWidth: nextBinWidth,
			binOffsets: nextBinOffsets,
			binIndices: nextBinIndices,
			contourValues: contour.values,
			contourPeak: contour.peak,
		};
	}

	// === State ===
	let n = 0;
	let positions  = null;   // Float32Array [2N]
	let xis        = null;   // Int32Array [N]
	let yis        = null;   // Int32Array [N]
	let binOffsets = null;   // Int32Array [N_BINS * N_BINS + 1]
	let binIndices = null;   // Int32Array [N], point indices grouped by bin
	let xCounts    = null;   // Int32Array [N_BINS]
	let yCounts    = null;   // Int32Array [N_BINS]
	let xMaxCount  = 1, yMaxCount = 1;
	let viewMin = -1.08, viewMax = 1.08, binWidth = 0;
	let contourValues = null; // Float64Array [40 * 40]
	let contourPeak = 0;
	let hoverMode = 0, hoverIndex = -1;
	let hoverPosCount = 0;   // points uploaded to hoverPosBuffer for overlay pass
	let dotAlpha = 0.1;      // current per-point alpha for the base layer
	let condGroup = null;    // SVG group for conditional overlay bars
	let nValue = Math.round(parseFloat(nNum.value)); // requested sample count (slider is log-scaled)
	let generationRequest = 0;

	function binId(xi, yi) {
		return xi * N_BINS + yi;
	}

	function updateHoverOverlay() {
		if (hoverMode !== 1 || hoverIndex < 0 || !positions) {
			hoverPosCount = 0;
			return;
		}
		const arr = new Float32Array([
			positions[2 * hoverIndex],
			positions[2 * hoverIndex + 1],
		]);
		gl.bindBuffer(gl.ARRAY_BUFFER, hoverPosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
		hoverPosCount = 1;
	}

	function clearInteractionState() {
		hoverMode = 0;
		hoverIndex = -1;
		hoverPosCount = 0;
		gl.uniform1i(U_HOVER_MODE, 0);
		gl.uniform1i(U_HOVER_INDEX, -1);
		if (condGroup) { condGroup.remove(); condGroup = null; }
		if (dynamicG) {
			dynamicG.querySelectorAll("rect.hist-bar").forEach(b => b.setAttribute("fill", COLOR_BAR));
		}
	}

	function setDotAlphaForCount(count) {
		// α ∝ N^-0.7 keeps the peak opacity strictly increasing with N; the high
		// cap keeps very small samples (down to N = 1) clearly visible.
		dotAlpha = Math.max(0.001, Math.min(0.85, 100 / Math.pow(count, 0.7)));
		gl.uniform1f(U_ALPHA_NORMAL, dotAlpha);
	}

	async function regenerate(requestId) {
		const sigmaR = parseFloat(sigmaRSlider.value);
		const nextN = nValue;
		clearInteractionState();
		container.setAttribute("aria-busy", "true");
		try {
			const data = await generateData(
				sigmaR, nextN, N_BINS,
				() => requestId !== generationRequest
			);
			if (!data || requestId !== generationRequest) return;
			applyData(data);
			container.removeAttribute("aria-busy");
		} catch (error) {
			if (requestId !== generationRequest) return;
			console.error("標本の生成に失敗しました:", error);
		} finally {
			if (requestId === generationRequest) container.removeAttribute("aria-busy");
		}
	}

	function applyData(data) {
		n = data.n;
		positions = data.positions;
		xis = data.xis;
		yis = data.yis;
		xCounts = data.xCounts;
		yCounts = data.yCounts;
		xMaxCount = data.xMaxCount;
		yMaxCount = data.yMaxCount;
		viewMin = data.viewMin;
		viewMax = data.viewMax;
		binWidth = data.binWidth;
		binOffsets = data.binOffsets;
		binIndices = data.binIndices;
		contourValues = data.contourValues;
		contourPeak = data.contourPeak;

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.uniform4f(U_VIEW, viewMin, viewMin, viewMax, viewMax);
		gl.uniform1f(U_BIN_WIDTH, binWidth);

		setDotAlphaForCount(n);

		const dpr = window.devicePixelRatio || 1;
		// Larger dots for small samples so a handful of points still read.
		const basePt = n <= 300 ? 5.0 : n <= 30000 ? 3.5 : 3.0;
		gl.uniform1f(U_POINT_SIZE,     basePt * dpr);
		gl.uniform1f(U_POINT_SIZE_HOV, Math.max(8.0, basePt + 3.0) * dpr);

		renderHistograms();
		renderScatter();
	}

	function renderScatter() {
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(prog);
		gl.bindVertexArray(vao);

		const hoverAlpha = (hoverMode === 1) ? 1.0 : dotAlpha;
		gl.uniform1f(U_ALPHA_HOVER, hoverAlpha);

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.vertexAttribPointer(A_POSITION, 2, gl.FLOAT, false, 0, 0);
		gl.uniform1i(U_PASS_MODE, 0);
		gl.drawArrays(gl.POINTS, 0, n);

		if (hoverMode === 1 && hoverPosCount > 0) {
			gl.bindBuffer(gl.ARRAY_BUFFER, hoverPosBuffer);
			gl.vertexAttribPointer(A_POSITION, 2, gl.FLOAT, false, 0, 0);
			gl.uniform1i(U_PASS_MODE, 1);
			gl.drawArrays(gl.POINTS, 0, hoverPosCount);
		}
	}

	// === SVG (histograms, ticks, labels, hover overlays) ===
	const NS = "http://www.w3.org/2000/svg";
	const dataToVbX = x => SCATTER_X + ((x - viewMin) / (viewMax - viewMin)) * SCATTER_W;
	const dataToVbY = y => SCATTER_Y + ((viewMax - y) / (viewMax - viewMin)) * SCATTER_H;

	let dynamicG = null;  // holds bars, ticks, and conditional overlays

	function niceTickStep(maxVal) {
		const rough = (2 * maxVal) / 5;
		const exp = Math.floor(Math.log10(rough));
		const frac = rough / Math.pow(10, exp);
		const m = (frac < 1.5) ? 1 : (frac < 3.5) ? 2 : (frac < 7.5) ? 5 : 10;
		return m * Math.pow(10, exp);
	}
	function formatTick(v, step) {
		if (Math.abs(v) < step * 0.5) return "0";
		const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)));
		return v.toFixed(decimals);
	}
	function appendLine(parent, x1, y1, x2, y2, stroke) {
		const l = document.createElementNS(NS, "line");
		l.setAttribute("x1", x1); l.setAttribute("y1", y1);
		l.setAttribute("x2", x2); l.setAttribute("y2", y2);
		l.setAttribute("stroke", stroke);
		parent.appendChild(l);
	}
	function appendText(parent, x, y, str, anchor, size, fill) {
		const t = document.createElementNS(NS, "text");
		t.setAttribute("x", x); t.setAttribute("y", y);
		t.setAttribute("text-anchor", anchor);
		t.setAttribute("font-size", size);
		t.setAttribute("fill", fill);
		t.textContent = str;
		parent.appendChild(t);
	}

	function initSvg() {
		while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

		const staticG = document.createElementNS(NS, "g");
		svgEl.appendChild(staticG);
		const sd3 = d3.select(staticG);
		texFO(sd3, SCATTER_X + SCATTER_W / 2, SCATTER_Y + SCATTER_H + 16, 14, 12,
			"\\(X\\)", { anchor: "topcenter", color: PROB_COLORS.text, size: "11px" });
		texFO(sd3, SCATTER_X - 22, SCATTER_Y + SCATTER_H / 2, 14, 12,
			"\\(Y\\)", { anchor: "center", color: PROB_COLORS.text, size: "11px" });

		const legendX = SCATTER_X + SCATTER_W + 2;
		const legendSwatch = (y, fill) => {
			const r = document.createElementNS(NS, "rect");
			r.setAttribute("x", legendX);
			r.setAttribute("y", y);
			r.setAttribute("width", 9);
			r.setAttribute("height", 9);
			r.setAttribute("fill", fill);
			staticG.appendChild(r);
		};
		legendSwatch(24, COLOR_BAR);
		appendText(staticG, legendX + 12, 32, "周辺分布", "start", 9, PROB_COLORS.sub);
		legendSwatch(40, COLOR_BAR_HOVER);
		appendText(staticG, legendX + 12, 48, "条件付き分布", "start", 9, PROB_COLORS.sub);

		typesetSvg(staticG);

		dynamicG = document.createElementNS(NS, "g");
		svgEl.appendChild(dynamicG);
	}

	function contourPolyToPath(mp, GRID) {
		let d = "";
		const sx = SCATTER_W / GRID, sy = SCATTER_H / GRID;
		for (const polygon of mp.coordinates) {
			for (const ring of polygon) {
				for (let i = 0; i < ring.length; i++) {
					const px = SCATTER_X + ring[i][0] * sx;
					const py = SCATTER_Y + ring[i][1] * sy;
					d += (i === 0 ? "M" : "L") + px.toFixed(2) + "," + py.toFixed(2);
				}
				d += "Z";
			}
		}
		return d;
	}

	function renderContours() {
		try {
			if (!contourValues || contourPeak <= 0) return;
			const GRID = 40;
			const fractions = [0.6, 0.4, 0.22, 0.10, 0.04];
			const thresholds = fractions.map(f => contourPeak * f);

			const polys = d3.contours().size([GRID, GRID]).thresholds(thresholds)(contourValues);

			const g = document.createElementNS(NS, "g");
			g.setAttribute("class", "contours");
			const ds = [];
			polys.forEach(p => {
				const d = contourPolyToPath(p, GRID);
				if (d) ds.push(d);
			});
			ds.forEach(d => {
				const casing = document.createElementNS(NS, "path");
				casing.setAttribute("d", d);
				casing.setAttribute("fill", "none");
				casing.setAttribute("stroke", COLOR_BACKGROUND);
				casing.setAttribute("stroke-width", 2);
				g.appendChild(casing);
			});
			ds.forEach(d => {
				const path = document.createElementNS(NS, "path");
				path.setAttribute("d", d);
				path.setAttribute("fill", "none");
				path.setAttribute("stroke", PROB_COLORS.sub);
				path.setAttribute("stroke-width", 0.8);
				path.setAttribute("opacity", 0.75);
				g.appendChild(path);
			});
			dynamicG.appendChild(g);
		} catch (e) {
			console.error("renderContours failed:", e);
		}
	}

	function renderHistograms() {
		while (dynamicG.firstChild) dynamicG.removeChild(dynamicG.firstChild);
		condGroup = null;

		renderContours();

		// X histogram (top)
		const xHistY0 = SCATTER_Y;
		for (let i = 0; i < N_BINS; i++) {
			const x0 = dataToVbX(viewMin + i       * binWidth);
			const x1 = dataToVbX(viewMin + (i + 1) * binWidth);
			const h  = (xCounts[i] / xMaxCount) * HIST_SIZE;
			const r = document.createElementNS(NS, "rect");
			r.setAttribute("class", "hist-bar xbar");
			r.setAttribute("x", x0);
			r.setAttribute("y", xHistY0 - h);
			r.setAttribute("width",  Math.max(0, x1 - x0 - 1));
			r.setAttribute("height", h);
			r.setAttribute("fill", COLOR_BAR);
			r.dataset.axis = "x";
			r.dataset.bin  = i;
			dynamicG.appendChild(r);
		}

		// Y histogram (right)
		const yHistX0 = SCATTER_X + SCATTER_W;
		for (let i = 0; i < N_BINS; i++) {
			const y0 = dataToVbY(viewMin +  i      * binWidth);
			const y1 = dataToVbY(viewMin + (i + 1) * binWidth);
			const w  = (yCounts[i] / yMaxCount) * HIST_SIZE;
			const r = document.createElementNS(NS, "rect");
			r.setAttribute("class", "hist-bar ybar");
			r.setAttribute("x", yHistX0);
			r.setAttribute("y", y1);
			r.setAttribute("width",  w);
			r.setAttribute("height", Math.max(0, y0 - y1 - 1));
			r.setAttribute("fill", COLOR_BAR);
			r.dataset.axis = "y";
			r.dataset.bin  = i;
			dynamicG.appendChild(r);
		}

		// Tick marks (no axis lines, no grid). 0 sits at the center.
		const tickStep = niceTickStep(viewMax);
		const maxK = Math.floor(viewMax / tickStep);
		const tickColor = PROB_COLORS.line; /* --viz-axis */
		const tickFill  = PROB_COLORS.sub;  /* --viz-tick */
		const tickLen   = 4;
		const tickFS    = 10;
		for (let k = -maxK; k <= maxK; k++) {
			const v = k * tickStep;
			const label = formatTick(v, tickStep);

			const xPx = dataToVbX(v);
			appendLine(dynamicG, xPx, SCATTER_Y + SCATTER_H, xPx, SCATTER_Y + SCATTER_H + tickLen, tickColor);
			appendText(dynamicG, xPx, SCATTER_Y + SCATTER_H + tickLen + tickFS, label, "middle", tickFS, tickFill);

			const yPx = dataToVbY(v);
			appendLine(dynamicG, SCATTER_X - tickLen, yPx, SCATTER_X, yPx, tickColor);
			appendText(dynamicG, SCATTER_X - tickLen - 2, yPx + 3, label, "end", tickFS, tickFill);
		}

		// Transparent hit bands: pointer tracking with no dead zones.
		const addHitBand = (axis, x, y, w, h) => {
			const band = document.createElementNS(NS, "rect");
			band.setAttribute("class", "hist-hit");
			band.setAttribute("x", x);
			band.setAttribute("y", y);
			band.setAttribute("width", w);
			band.setAttribute("height", h);
			band.setAttribute("fill", "transparent");
			band.addEventListener("pointermove", e => {
				const rc = svgEl.getBoundingClientRect();
				const vbX = ((e.clientX - rc.left) / rc.width)  * VB_W;
				const vbY = ((e.clientY - rc.top)  / rc.height) * VB_H;
				const v = (axis === "x")
					? viewMin + ((vbX - SCATTER_X) / SCATTER_W) * (viewMax - viewMin)
					: viewMax - ((vbY - SCATTER_Y) / SCATTER_H) * (viewMax - viewMin);
				let bin = Math.floor((v - viewMin) / binWidth);
				if (bin < 0) bin = 0;
				if (bin >= N_BINS) bin = N_BINS - 1;
				onBinEnter(axis, bin);
			});
			band.addEventListener("pointerleave", clearHover);
			dynamicG.appendChild(band);
		};
		addHitBand("x", SCATTER_X, SCATTER_Y - HIST_SIZE, SCATTER_W, HIST_SIZE);
		addHitBand("y", SCATTER_X + SCATTER_W, SCATTER_Y, HIST_SIZE, SCATTER_H);
	}

	// === Bar hover ===
	function formatConditionalBound(value) {
		if (Math.abs(value) < 0.0005) return "0";
		return value.toFixed(2).replace("-", "−");
	}

	function describeConditionalBin(axis, bin) {
		const lower = viewMin + bin * binWidth;
		const upper = lower + binWidth;
		const fixed = axis === "x" ? "X" : "Y";
		return `${fixed} が ${formatConditionalBound(lower)} 以上 ${formatConditionalBound(upper)} 未満`;
	}

	function onBinEnter(axis, bin) {
		if (!binOffsets) return;
		const mode = (axis === "x") ? 2 : 3;
		if (hoverMode === mode && hoverIndex === bin) return;
		if (condGroup) { condGroup.remove(); condGroup = null; }

		dynamicG.querySelectorAll("rect.hist-bar").forEach(b => {
			const hit = b.dataset.axis === axis && parseInt(b.dataset.bin) === bin;
			b.setAttribute("fill", hit ? COLOR_BAR_HOVER : COLOR_BAR_FADED);
		});

		hoverMode = mode;
		hoverIndex = bin;
		gl.uniform1i(U_HOVER_MODE, hoverMode);
		gl.uniform1i(U_HOVER_INDEX, hoverIndex);
		hoverPosCount = 0;
		renderScatter();

		const condCounts = new Int32Array(N_BINS);
		if (axis === "x") {
			for (let yi = 0; yi < N_BINS; yi++) {
				const id = binId(bin, yi);
				for (let p = binOffsets[id]; p < binOffsets[id + 1]; p++) {
					condCounts[yis[binIndices[p]]]++;
				}
			}
		} else {
			for (let xi = 0; xi < N_BINS; xi++) {
				const id = binId(xi, bin);
				for (let p = binOffsets[id]; p < binOffsets[id + 1]; p++) {
					condCounts[xis[binIndices[p]]]++;
				}
			}
		}
		let condMax = 1;
		for (let i = 0; i < N_BINS; i++) if (condCounts[i] > condMax) condMax = condCounts[i];
		const norm = (axis === "x" ? yMaxCount : xMaxCount) / condMax;

		condGroup = document.createElementNS(NS, "g");
		if (axis === "x") {
			const yHistX0 = SCATTER_X + SCATTER_W;
			for (let i = 0; i < N_BINS; i++) {
				const y0 = dataToVbY(viewMin +  i      * binWidth);
				const y1 = dataToVbY(viewMin + (i + 1) * binWidth);
				const w  = (norm * condCounts[i] / yMaxCount) * HIST_SIZE;
				const r = document.createElementNS(NS, "rect");
				r.setAttribute("x", yHistX0);
				r.setAttribute("y", y1);
				r.setAttribute("width",  w);
				r.setAttribute("height", Math.max(0, y0 - y1 - 1));
				r.setAttribute("fill", COLOR_BAR_HOVER);
				r.setAttribute("opacity", 0.7);
				condGroup.appendChild(r);
			}
		} else {
			const xHistY0 = SCATTER_Y;
			for (let i = 0; i < N_BINS; i++) {
				const x0 = dataToVbX(viewMin +  i      * binWidth);
				const x1 = dataToVbX(viewMin + (i + 1) * binWidth);
				const h  = (norm * condCounts[i] / xMaxCount) * HIST_SIZE;
				const r = document.createElementNS(NS, "rect");
				r.setAttribute("x", x0);
				r.setAttribute("y", xHistY0 - h);
				r.setAttribute("width",  Math.max(0, x1 - x0 - 1));
				r.setAttribute("height", h);
				r.setAttribute("fill", COLOR_BAR_HOVER);
				r.setAttribute("opacity", 0.7);
				condGroup.appendChild(r);
			}
		}
		dynamicG.appendChild(condGroup);
	}

	// === Point hover (canvas mousemove) ===
	canvas.addEventListener("mousemove", e => {
		if (!positions || !binOffsets) return;
		const r = canvas.getBoundingClientRect();
		const cx = e.clientX - r.left;
		const cy = e.clientY - r.top;
		const dataX = viewMin + (cx / r.width)  * (viewMax - viewMin);
		const dataY = viewMin + ((r.height - cy) / r.height) * (viewMax - viewMin);

		const dPerPx = (viewMax - viewMin) / r.width;
		const thr = HOVER_THRESHOLD_PX * dPerPx;
		const thr2 = thr * thr;

		const xi0 = Math.floor((dataX - viewMin) / binWidth);
		const yi0 = Math.floor((dataY - viewMin) / binWidth);

		let bestIdx = -1;
		let bestD2 = thr2;
		for (let dxi = -1; dxi <= 1; dxi++) {
			const xx = xi0 + dxi;
			if (xx < 0 || xx >= N_BINS) continue;
			for (let dyi = -1; dyi <= 1; dyi++) {
				const yy = yi0 + dyi;
				if (yy < 0 || yy >= N_BINS) continue;
				const id = binId(xx, yy);
				for (let p = binOffsets[id]; p < binOffsets[id + 1]; p++) {
					const idx = binIndices[p];
					const dx = positions[2*idx]     - dataX;
					const dy = positions[2*idx + 1] - dataY;
					const d2 = dx*dx + dy*dy;
					if (d2 < bestD2) { bestD2 = d2; bestIdx = idx; }
				}
			}
		}

		if (bestIdx >= 0) {
			if (hoverMode !== 1 || hoverIndex !== bestIdx) {
				hoverMode = 1;
				hoverIndex = bestIdx;
				gl.uniform1i(U_HOVER_MODE, 1);
				gl.uniform1i(U_HOVER_INDEX, bestIdx);
				updateHoverOverlay();
				renderScatter();
				highlightBars(xis[bestIdx], yis[bestIdx]);
			}
		} else if (hoverMode === 1) {
			clearHover();
		}
	});
	canvas.addEventListener("mouseleave", () => {
		if (hoverMode === 1) clearHover();
	});

	function highlightBars(xi, yi) {
		dynamicG.querySelectorAll("rect.hist-bar").forEach(b => b.setAttribute("fill", COLOR_BAR));
		const xb = dynamicG.querySelector(`rect.xbar[data-bin="${xi}"]`);
		const yb = dynamicG.querySelector(`rect.ybar[data-bin="${yi}"]`);
		if (xb) xb.setAttribute("fill", COLOR_BAR_HOVER);
		if (yb) yb.setAttribute("fill", COLOR_BAR_HOVER);
	}

	function clearHover() {
		clearInteractionState();
		renderScatter();
	}

	const keyboardBins = { x: Math.floor(N_BINS / 2), y: Math.floor(N_BINS / 2) };
	svgEl.addEventListener("keydown", event => {
		if (!binOffsets || !dynamicG) return;
		let axis;
		let step;
		if (event.key === "ArrowLeft") { axis = "x"; step = -1; }
		else if (event.key === "ArrowRight") { axis = "x"; step = 1; }
		else if (event.key === "ArrowDown") { axis = "y"; step = -1; }
		else if (event.key === "ArrowUp") { axis = "y"; step = 1; }
		else if (event.key === "Escape") {
			event.preventDefault();
			cancelLiveAnnouncement();
			clearHover();
			svgEl.blur();
			return;
		} else return;

		event.preventDefault();
		keyboardBins[axis] = Math.max(0, Math.min(N_BINS - 1, keyboardBins[axis] + step));
		onBinEnter(axis, keyboardBins[axis]);
		const description = describeConditionalBin(axis, keyboardBins[axis]);
		scheduleLiveAnnouncement(`${description}の条件付き分布を表示しています`);
	});
	svgEl.addEventListener("blur", () => {
		cancelLiveAnnouncement();
		clearHover();
	});

	// === Resize ===
	const ro = new ResizeObserver(() => { resizeCanvas(); renderScatter(); });
	ro.observe(container);
	window.addEventListener("resize", () => { resizeCanvas(); renderScatter(); });
	resizeCanvas();

	// === Wire sliders ===
	let regenScheduled = false;
	function scheduleRegenerate() {
		generationRequest++;
		if (regenScheduled) return;
		regenScheduled = true;
		requestAnimationFrame(() => {
			regenScheduled = false;
			regenerate(generationRequest);
		});
	}
	function bindPair(numInput, slider, fmt) {
		slider.addEventListener("input", () => {
			numInput.value = fmt(parseFloat(slider.value));
			scheduleRegenerate();
		});
		numInput.addEventListener("input", () => {
			const v = parseFloat(numInput.value);
			if (!Number.isNaN(v)) {
				slider.value = v;       // browser clamps to [min, max]
				scheduleRegenerate();
			}
		});
		numInput.addEventListener("change", () => {
			const min = parseFloat(slider.min);
			const max = parseFloat(slider.max);
			let v = parseFloat(numInput.value);
			if (Number.isNaN(v)) v = parseFloat(slider.value);
			v = Math.max(min, Math.min(max, v));
			numInput.value = fmt(v);
			slider.value = v;
			scheduleRegenerate();
		});
	}
	bindPair(sigmaRNum, sigmaRSlider, v => v.toFixed(2));

	// The N slider works on a log scale: the slider carries the exponent
	// (log10 N). Small counts stay finely adjustable; large counts round to a
	// thousand so the readout does not jitter.
	function nFromSlider() {
		const raw = Math.pow(10, parseFloat(nSlider.value));
		if (raw < 1000) return Math.max(1, Math.round(raw));
		return Math.round(raw / 1000) * 1000;
	}
	function clampN(v) {
		const min = parseFloat(nNum.min);
		const max = parseFloat(nNum.max);
		return Math.max(min, Math.min(max, Math.round(v)));
	}
	// スライダーの内部値は log10(N) なので，支援技術にはそのまま「4」等と
	// 読み上げられてしまう。実際の標本数を aria-valuetext で常に同期する。
	function syncNAria() {
		nSlider.setAttribute("aria-valuetext", nValue.toLocaleString("en-US") + " 個");
	}
	nSlider.addEventListener("input", () => {
		nValue = nFromSlider();
		nNum.value = String(nValue);
		syncNAria();
		scheduleRegenerate();
	});
	nNum.addEventListener("input", () => {
		const v = parseFloat(nNum.value);
		if (!Number.isNaN(v) && v > 0) {
			nValue = clampN(v);
			nSlider.value = String(Math.log10(nValue));
			syncNAria();
			scheduleRegenerate();
		}
	});
	nNum.addEventListener("change", () => {
		let v = parseFloat(nNum.value);
		if (Number.isNaN(v)) v = nValue;
		nValue = clampN(v);
		nNum.value = String(nValue);
		nSlider.value = String(Math.log10(nValue));
		syncNAria();
		scheduleRegenerate();
	});
	syncNAria(); // 初期化時にも同期する

	// Set up the static SVG (X / Y labels), then draw the first state.
	initSvg();
	scheduleRegenerate();
})();
