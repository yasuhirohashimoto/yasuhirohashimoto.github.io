// Marginal-probability scatter + histogram demo
// - Scatter: WebGL 2 (scales to N ~ 10^6)
// - Histograms / ticks / labels / overlays: SVG
// - Sampling / binning / contour grid: generated synchronously on input
// - Hover: histogram bar OR scatter point (nearest within pixel threshold)
//
// Bar hover is driven by uniforms in the vertex shader, so changing the
// hovered bin requires no buffer re-upload. Point hover uploads one point.

(async () => {
	"use strict";

	// === DOM ===
	const sigmaXSlider = document.getElementById("sigmaX");
	const sigmaYSlider = document.getElementById("sigmaY");
	const covSlider    = document.getElementById("cov");
	const nSlider      = document.getElementById("n");
	const sigmaXNum    = document.getElementById("sigmaX-num");
	const sigmaYNum    = document.getElementById("sigmaY-num");
	const covNum       = document.getElementById("cov-num");
	const nNum         = document.getElementById("n-num");
	const container    = document.querySelector(".marginal-viz");
	const canvas       = document.getElementById("marginal-canvas");
	const svgEl        = document.getElementById("marginal-svg");

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

	// Pure black so that overlapping semi-transparent points asymptote toward
	// black rather than the source colour. With clearColor (0,0,0,0) and
	// non-premultiplied alpha, the canvas alpha records the "covered fraction"
	// and the page background shows through where there are no points.
	const COLOR_NORMAL_RGB = [0.0, 0.0, 0.0];      // black
	const COLOR_HOVER_RGB  = [0.91, 0.55, 0.23];   // orange
	const COLOR_BAR        = "#4682B4";            // steelblue
	const COLOR_BAR_HOVER  = "rgb(232, 139, 58)";

	// === WebGL 2 setup ===
	const gl = canvas.getContext("webgl2", {
		antialias: true,
		alpha: true,
		premultipliedAlpha: false,
	});
	if (!gl) {
		container.innerHTML = '<p style="text-align:center;color:#a33">' +
			'このブラウザは WebGL 2 をサポートしていません．Chrome / Firefox / Safari 15+ などで試してください．' +
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
			// WebGL clip y=+1 is the top of the viewport, so data y "up" maps
			// directly to screen "up" — no manual flip needed.
			gl_Position = vec4(clip, 0.0, 1.0);

			if (u_passMode == 1) {
				// Overlay pass: the bound buffer contains only the hover points,
				// so every vertex is rendered with the hover style.
				v_color = vec4(u_colorHover, u_alphaHover);
				gl_PointSize = u_pointSizeHover;
				return;
			}

			// Base pass: detect whether this vertex is a hover target.
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
	// Separate buffer holding just the hover positions (1 point for point hover,
	// or all points in the bin for bar hover). Drawn as the overlay pass.
	const hoverPosBuffer = gl.createBuffer();

	gl.uniform3f(U_COLOR_NORMAL, ...COLOR_NORMAL_RGB);
	gl.uniform3f(U_COLOR_HOVER,  ...COLOR_HOVER_RGB);
	// u_alphaHover is set per-frame in renderScatter (depends on hover mode).

	gl.enable(gl.BLEND);
	// RGB uses standard "over" blending. The alpha channel needs ONE/
	// ONE_MINUS_SRC_ALPHA so coverage accumulates correctly:
	//   out.α = src.α + dst.α × (1 − src.α)         ← asymptotes to 1
	// (plain blendFunc would make it src.α × src.α + dst.α × (1 − src.α),
	//  which asymptotes to ~0.5 and stops the canvas from ever going opaque.)
	gl.blendFuncSeparate(
		gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,   // RGB
		gl.ONE,       gl.ONE_MINUS_SRC_ALPHA    // Alpha
	);
	// Fully transparent background. Combined with src colour = black, the
	// canvas alpha builds up where points overlap, so dense regions become
	// fully opaque (black) and sparse regions let the page background show.
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

	function makeBVNormal(sx, sy, cov) {
		const maxCov = sx * sy;
		const c = Math.max(-maxCov, Math.min(maxCov, cov));
		const L11 = sx;
		const L21 = sx > 0 ? c / sx : 0;
		const inner = sy * sy - L21 * L21;
		const L22 = inner > 0 ? Math.sqrt(inner) : 0;
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
			const z1 = nextNormal();
			const z2 = nextNormal();
			out[idx] = L11 * z1;
			out[idx + 1] = L21 * z1 + L22 * z2;
		};
	}

	function makeContourGrid(nextPositions, nextN, nextViewMin, nextViewMax) {
		const GRID = 40;
		const counts = new Float64Array(GRID * GRID);
		const span = nextViewMax - nextViewMin;
		if (span <= 0) return { values: counts, peak: 0 };
		const inv = GRID / span;

		for (let i = 0; i < nextN; i++) {
			const x = nextPositions[2 * i];
			const y = nextPositions[2 * i + 1];
			let cx = Math.floor((x - nextViewMin) * inv);
			let cy = Math.floor((nextViewMax - y) * inv);
			if (cx < 0) cx = 0; else if (cx >= GRID) cx = GRID - 1;
			if (cy < 0) cy = 0; else if (cy >= GRID) cy = GRID - 1;
			counts[cy * GRID + cx]++;
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

	function generateData(sx, sy, covRaw, nextN, nBins) {
		const maxCov = sx * sy;
		const cov = Math.max(-maxCov, Math.min(maxCov, covRaw));
		const nextPositions = new Float32Array(2 * nextN);
		const nextXis = new Int32Array(nextN);
		const nextYis = new Int32Array(nextN);
		const sample = makeBVNormal(sx, sy, cov);
		for (let i = 0; i < nextN; i++) sample(nextPositions, 2 * i);

		let absMax = 0.001;
		for (let i = 0; i < 2 * nextN; i++) {
			const a = Math.abs(nextPositions[i]);
			if (a > absMax) absMax = a;
		}
		absMax *= 1.05;
		const nextViewMin = -absMax;
		const nextViewMax = absMax;
		const nextBinWidth = (nextViewMax - nextViewMin) / nBins;

		const nextXCounts = new Int32Array(nBins);
		const nextYCounts = new Int32Array(nBins);
		const cellCount = nBins * nBins;
		const binCounts = new Int32Array(cellCount);
		for (let i = 0; i < nextN; i++) {
			const xi = Math.min(nBins - 1, Math.max(0, Math.floor((nextPositions[2 * i] - nextViewMin) / nextBinWidth)));
			const yi = Math.min(nBins - 1, Math.max(0, Math.floor((nextPositions[2 * i + 1] - nextViewMin) / nextBinWidth)));
			nextXis[i] = xi;
			nextYis[i] = yi;
			nextXCounts[xi]++;
			nextYCounts[yi]++;
			binCounts[xi * nBins + yi]++;
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
		for (let i = 0; i < nextN; i++) {
			const id = nextXis[i] * nBins + nextYis[i];
			nextBinIndices[writeOffsets[id]++] = i;
		}

		const contour = makeContourGrid(nextPositions, nextN, nextViewMin, nextViewMax);

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
	let viewMin = -3, viewMax = 3, binWidth = 0;
	let contourValues = null; // Float64Array [40 * 40]
	let contourPeak = 0;
	let hoverMode = 0, hoverIndex = -1;
	let hoverPosCount = 0;   // points uploaded to hoverPosBuffer for overlay pass
	let dotAlpha = 0.1;      // current per-point alpha for the base layer
	let condGroup = null;    // SVG group for conditional overlay bars

	function binId(xi, yi) {
		return xi * N_BINS + yi;
	}

	// Build the overlay buffer for the single-point hover pass.
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
		// α ∝ N^-0.7 keeps the peak opacity strictly increasing with N.
		dotAlpha = Math.max(0.001, Math.min(0.5, 100 / Math.pow(count, 0.7)));
		gl.uniform1f(U_ALPHA_NORMAL, dotAlpha);
	}

	function formatCov(v) {
		return v.toFixed(3);
	}

	function updateCovBounds(reformat = false) {
		const sx = parseFloat(sigmaXSlider.value);
		const sy = parseFloat(sigmaYSlider.value);
		if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

		const maxCov = sx * sy;
		const min = -maxCov;
		const max = maxCov;
		covSlider.min = String(min);
		covSlider.max = String(max);
		covNum.min = String(min);
		covNum.max = String(max);

		let cov = parseFloat(covSlider.value);
		if (!Number.isFinite(cov)) cov = 0;
		const clamped = Math.max(min, Math.min(max, cov));
		if (clamped !== cov || reformat) {
			covSlider.value = String(clamped);
			covNum.value = formatCov(clamped);
		}
	}

	function regenerate() {
		const sx     = parseFloat(sigmaXSlider.value);
		const sy     = parseFloat(sigmaYSlider.value);
		updateCovBounds();
		const covRaw = parseFloat(covSlider.value);
		const nextN = parseInt(nSlider.value);
		clearInteractionState();
		applyData(generateData(sx, sy, covRaw, nextN, N_BINS));
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
		gl.uniform1f(U_POINT_SIZE,     3.0 * dpr);
		gl.uniform1f(U_POINT_SIZE_HOV, 8.0 * dpr);

		renderHistograms();
		renderScatter();
	}

	function renderScatter() {
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(prog);
		gl.bindVertexArray(vao);

		// Hover alpha: full opacity for a single hovered point (must be
		// clearly visible against the dense base), but the per-point alpha
		// for bar hover so the orange accumulates into a density-shaded
		// shape rather than a solid orange block.
		const hoverAlpha = (hoverMode === 1) ? 1.0 : dotAlpha;
		gl.uniform1f(U_ALPHA_HOVER, hoverAlpha);

		// Pass 1: all points using the main position buffer. Bar-hovered
		// points are recoloured here as orange with the same accumulation
		// behaviour as the rest, so no overlay pass is needed for bar hover.
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.vertexAttribPointer(A_POSITION, 2, gl.FLOAT, false, 0, 0);
		gl.uniform1i(U_PASS_MODE, 0);
		gl.drawArrays(gl.POINTS, 0, n);

		// Pass 2: only for single-point hover, drawing the one hovered point
		// from a tiny buffer on top of everything so it is never obscured by
		// the dense base layer.
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

	// "Nice" tick step: 1, 2, 5 × 10^k chosen to give roughly 5 ticks per side.
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

	// One-time SVG setup: X / Y axis labels in tex font (rendered via MathJax).
	function initSvg() {
		while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

		const staticG = document.createElementNS(NS, "g");
		svgEl.appendChild(staticG);
		const sd3 = d3.select(staticG);
		// X label below the "0" tick (data x = 0 sits at the centre of the
		// scatter region since the view is symmetric around the origin).
		texFO(sd3, SCATTER_X + SCATTER_W / 2, SCATTER_Y + SCATTER_H + 16, 14, 12,
			"\\(X\\)", { anchor: "topcenter", color: "#444", size: "11px" });
		// Y label to the left of the "0" tick (data y = 0 sits at the centre).
		texFO(sd3, SCATTER_X - 22, SCATTER_Y + SCATTER_H / 2, 14, 12,
			"\\(Y\\)", { anchor: "center", color: "#444", size: "11px" });
		typesetSvg(staticG);

		dynamicG = document.createElementNS(NS, "g");
		svgEl.appendChild(dynamicG);
	}

	// Convert a d3.contours MultiPolygon (coordinates in grid units 0..GRID)
	// to an SVG path d-string in the SCATTER region. We do the projection by
	// hand instead of going through d3.geoPath to keep the path generator
	// dependency-free and easy to debug.
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

	// Empirical density contours derived from the precomputed grid.
	function renderContours() {
		try {
			if (!contourValues || contourPeak <= 0) return;
			const GRID = 40;
			const fractions = [0.6, 0.4, 0.22, 0.10, 0.04];
			const thresholds = fractions.map(f => contourPeak * f);

			const polys = d3.contours().size([GRID, GRID]).thresholds(thresholds)(contourValues);

			const g = document.createElementNS(NS, "g");
			g.setAttribute("class", "contours");
			polys.forEach(p => {
				const d = contourPolyToPath(p, GRID);
				if (!d) return;
				const path = document.createElementNS(NS, "path");
				path.setAttribute("d", d);
				path.setAttribute("fill", "none");
				path.setAttribute("stroke", "#666");
				path.setAttribute("stroke-width", 0.7);
				path.setAttribute("opacity", 0.75);
				g.appendChild(path);
			});
			dynamicG.appendChild(g);
		} catch (e) {
			console.error("renderContours failed:", e);
		}
	}

	function renderHistograms() {
		// Clear only the dynamic content; static labels stay.
		while (dynamicG.firstChild) dynamicG.removeChild(dynamicG.firstChild);
		condGroup = null;

		// Density contours first so they sit behind bars / ticks.
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
			const y0 = dataToVbY(viewMin +  i      * binWidth);  // bottom of bar (larger y in pixels)
			const y1 = dataToVbY(viewMin + (i + 1) * binWidth);  // top    of bar (smaller y)
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
		const tickColor = "#aaa";
		const tickFill  = "#666";
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

		// Bar event listeners
		dynamicG.querySelectorAll("rect.hist-bar").forEach(r => {
			r.addEventListener("mouseenter", () => onBarEnter(r));
			r.addEventListener("mouseleave", () => onBarLeave(r));
		});
	}

	// === Bar hover ===
	function onBarEnter(rect) {
		if (!binOffsets) return;
		const axis = rect.dataset.axis;
		const bin  = parseInt(rect.dataset.bin);
		rect.setAttribute("fill", COLOR_BAR_HOVER);

		// Tell shader to highlight all points with this bin
		hoverMode = (axis === "x") ? 2 : 3;
		hoverIndex = bin;
		gl.uniform1i(U_HOVER_MODE, hoverMode);
		gl.uniform1i(U_HOVER_INDEX, hoverIndex);
		hoverPosCount = 0;
		renderScatter();

		// Conditional histogram overlay on the OTHER axis
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
	function onBarLeave(rect) {
		rect.setAttribute("fill", COLOR_BAR);
		clearHover();
	}

	// === Point hover (canvas mousemove) ===
	canvas.addEventListener("mousemove", e => {
		if (!positions || !binOffsets) return;
		const r = canvas.getBoundingClientRect();
		const cx = e.clientX - r.left;
		const cy = e.clientY - r.top;
		// canvas pixel -> data coordinate
		const dataX = viewMin + (cx / r.width)  * (viewMax - viewMin);
		const dataY = viewMin + ((r.height - cy) / r.height) * (viewMax - viewMin);

		// pixel-to-data
		const dPerPx = (viewMax - viewMin) / r.width;
		const thr = HOVER_THRESHOLD_PX * dPerPx;
		const thr2 = thr * thr;

		// Bin lookup + neighbor cells
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
				// Light up the bar(s) the point belongs to
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
		// Reset all bars first, then color the matching ones
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

	// === Resize ===
	const ro = new ResizeObserver(() => { resizeCanvas(); renderScatter(); });
	ro.observe(container);
	window.addEventListener("resize", () => { resizeCanvas(); renderScatter(); });
	resizeCanvas();

	// === Wire sliders ===
	// All sliders fire on `input` for live response. Multiple events per frame
	// are coalesced so the display is regenerated at most once per frame.
	let regenScheduled = false;
	function scheduleRegenerate() {
		if (regenScheduled) return;
		regenScheduled = true;
		requestAnimationFrame(() => {
			regenScheduled = false;
			regenerate();
		});
	}
	// Bidirectional bind between a slider and a number input: dragging the
	// slider live-updates the input; typing into the input live-updates the
	// slider. Both routes call scheduleRegenerate.
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
			// On commit (blur / Enter): clamp + reformat for clean display.
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
	bindPair(sigmaXNum, sigmaXSlider, v => v.toFixed(2));
	bindPair(sigmaYNum, sigmaYSlider, v => v.toFixed(2));
	bindPair(covNum,    covSlider,    formatCov);
	bindPair(nNum,      nSlider,      v => String(Math.round(v)));

	for (const el of [sigmaXNum, sigmaXSlider, sigmaYNum, sigmaYSlider]) {
		el.addEventListener("input", () => updateCovBounds());
		el.addEventListener("change", () => updateCovBounds(true));
	}
	updateCovBounds(true);

	// Set up the static SVG (X / Y labels), then draw the first state.
	initSvg();
	regenerate();
})();
