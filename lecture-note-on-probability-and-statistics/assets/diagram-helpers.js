// Shared helpers for D3 + MathJax probability diagrams in lecture notes.
// Loaded as a regular <script>; defines globals: PROB_COLORS, texFO, typesetSvg.

// Color palette used across probability diagrams.
const PROB_COLORS = {
	// Primary D vs D^c colors (used for D row in Eikosogram, D leaves in tree)
	D:       "#c25b2a",  // 濃い橙
	DC:      "#2f6ea6",  // 濃い青
	// Lighter variants for H^c column cells in Eikosogram
	DLight:  "#e8a878",  // 薄い橙
	DCLight: "#9bc1de",  // 薄い青
	// Utility colors
	text:    "#2f3a46",
	sub:     "#6b7280",
	line:    "#98a2b3",
	node:    "#ffffff",
};

/**
 * Append a foreignObject containing MathJax-renderable HTML to a D3 selection.
 *
 * @param {d3.Selection} parent  - Parent selection to append to.
 * @param {number} x             - X coordinate (interpretation depends on `anchor`).
 * @param {number} y             - Y coordinate.
 * @param {number} w             - Width of the foreignObject.
 * @param {number} h             - Height of the foreignObject.
 * @param {string} tex           - HTML / MathJax string to render.
 * @param {object} [opts]
 * @param {string} [opts.color="#333"]              - Text color.
 * @param {string} [opts.size="12px"]               - Font size.
 * @param {"topleft"|"center"|"topcenter"} [opts.anchor="topleft"] - How (x,y) is interpreted.
 *   topleft: (x,y) = top-left corner; center: (x,y) = box center; topcenter: x = horizontal center, y = top.
 * @param {"left"|"center"|"right"} [opts.align="center"] - Horizontal alignment within the box.
 * @returns {d3.Selection} The created foreignObject selection.
 */
function texFO(parent, x, y, w, h, tex, opts = {}) {
	const {
		color = "#333",
		size = "12px",
		anchor = "topleft",
		align = "center",
	} = opts;
	const xOffset = (anchor === "center" || anchor === "topcenter") ? x - w / 2 : x;
	const yOffset = anchor === "center" ? y - h / 2 : y;
	const fo = parent.append("foreignObject")
		.attr("x", xOffset)
		.attr("y", yOffset)
		.attr("width", w)
		.attr("height", h);
	fo.append("xhtml:div")
		.attr("xmlns", "http://www.w3.org/1999/xhtml")
		.style("width", "100%")
		.style("height", "100%")
		.style("display", "flex")
		.style("align-items", "center")
		.style("justify-content",
			align === "left" ? "flex-start" :
			align === "right" ? "flex-end" : "center")
		.style("font-size", size)
		.style("color", color)
		.style("line-height", "1")
		.style("white-space", "nowrap")
		.html(tex);
	return fo;
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
