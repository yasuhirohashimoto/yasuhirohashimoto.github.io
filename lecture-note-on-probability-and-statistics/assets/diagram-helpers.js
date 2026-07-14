// Shared helpers for D3 + MathJax probability diagrams in lecture notes.
// Loaded as a regular <script>; defines globals: PROB_COLORS, texFO, typesetSvg.

// Color palette used across probability diagrams.
// Kept in sync with the --viz-* tokens in assets/style.css.
const PROB_COLORS = {
	// Primary D vs D^c colors (used for D row in Eikosogram, D leaves in tree)
	D:       "#c25b2a",  // 濃い橙
	DC:      "#2c6ea6",  // 濃い青（サイト実勢値に正典化）
	// Lighter variants for H^c column cells in Eikosogram
	DLight:  "#e8a878",  // 薄い橙
	DCLight: "#9bc1de",  // 薄い青
	// Text-safe dark variants (図中の色付き文字はこちらを使う)
	DText:   "#8a3d1f",  // 橙系の文字用
	DCText:  "#1d4f7a",  // 青系の文字用
	// Role colors
	red:     "#d95f59",  // 棄却域・下側裾
	redText: "#9f302b",
	green:   "#2c8a4a",  // 正解・第3系列
	greenText: "#1d6b38",
	// CVD-friendly section colors for the n=3 construction in note 12
	n3Red:   "#df8077",
	n3Blue:  "#7c91ca",
	n3Green: "#6ab5ae",
	// Utility colors
	text:    "#2f3a46",
	sub:     "#6b7280",
	line:    "#98a2b3",
	grid:    "#e4e4e4",
	node:    "#ffffff",
};

/**
 * Append a foreignObject containing MathJax-renderable HTML to an SVG parent.
 * The parent may be a D3 selection or a plain SVG DOM element (for pages that
 * do not load D3).
 *
 * @param {d3.Selection|SVGElement} parent - Parent to append to.
 * @param {number} x             - X coordinate (interpretation depends on `anchor`).
 * @param {number} y             - Y coordinate.
 * @param {number} w             - Width of the foreignObject.
 * @param {number} h             - Height of the foreignObject.
 * @param {string} tex           - HTML / MathJax string to render.
 * @param {object} [opts]
 * @param {string} [opts.color=PROB_COLORS.text]    - Text color.
 * @param {string} [opts.size="12px"]               - Font size.
 * @param {"topleft"|"center"|"topcenter"} [opts.anchor="topleft"] - How (x,y) is interpreted.
 *   topleft: (x,y) = top-left corner; center: (x,y) = box center; topcenter: x = horizontal center, y = top.
 * @param {"left"|"center"|"right"} [opts.align="center"] - Horizontal alignment within the box.
 * @returns {d3.Selection|SVGForeignObjectElement} D3 selection if the parent was a
 *   selection（.attr() 等をチェーンできる），plain な親なら foreignObject 要素そのもの。
 */
function texFO(parent, x, y, w, h, tex, opts = {}) {
	const {
		color = PROB_COLORS.text,
		size = "12px",
		anchor = "topleft",
		align = "center",
	} = opts;
	const xOffset = (anchor === "center" || anchor === "topcenter") ? x - w / 2 : x;
	const yOffset = anchor === "center" ? y - h / 2 : y;
	// D3 セレクション（.node() をもつ）か素の DOM 要素かを判定する
	const isSelection = parent && typeof parent.node === "function";
	const parentNode = isSelection ? parent.node() : parent;
	const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
	fo.setAttribute("x", xOffset);
	fo.setAttribute("y", yOffset);
	fo.setAttribute("width", w);
	fo.setAttribute("height", h);
	const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
	div.style.cssText =
		"width:100%;height:100%;display:flex;align-items:center;" +
		"justify-content:" + (align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center") + ";" +
		"font-size:" + size + ";color:" + color + ";line-height:1;white-space:nowrap;";
	div.innerHTML = tex;
	fo.appendChild(div);
	parentNode.appendChild(fo);
	return isSelection ? d3.select(fo) : fo;
}

/**
 * Tone down a d3 axis group to the shared chart convention:
 * light gray domain/tick lines, muted tick text, page font.
 * Usage: g.call(d3.axisBottom(x)).call(styleAxis)
 *
 * @param {d3.Selection} g - The axis group selection.
 * @returns {d3.Selection} The same selection.
 */
function styleAxis(g) {
	g.attr("font-family", "inherit")
		.attr("font-size", 13); // 実効 ≈13px（本文の80%）を狙う。縮小率の大きい図は呼び出し側で上書きする
	g.select(".domain").attr("stroke", PROB_COLORS.line);
	g.selectAll(".tick line").attr("stroke", PROB_COLORS.line);
	g.selectAll(".tick text").attr("fill", PROB_COLORS.sub);
	return g;
}

/**
 * Resolve once MathJax has finished its startup. Safe to call before MathJax loads.
 */
async function whenMathJaxReady() {
	if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
		try { await window.MathJax.startup.promise; } catch (e) {}
	}
}

/**
 * Wait for MathJax to be ready, then typeset the given target(s).
 * @param {d3.Selection|Element|Array} target - D3 selection, DOM element, or array of either.
 */
async function typesetSvg(target) {
	await whenMathJaxReady();
	if (window.MathJax && window.MathJax.typesetPromise) {
		const targets = Array.isArray(target) ? target : [target];
		const nodes = targets.map(t => (t && typeof t.node === "function") ? t.node() : t);
		await window.MathJax.typesetPromise(nodes);
	}
}
