// Term highlight & scroll for lecture notes.
//
// 1. If the URL has ?hl=TERM, wrap every occurrence of TERM inside <main>
//    in <mark class="term-hl"> and scroll to the first one.
// 2. Decorate outgoing links with ?hl=… so that following a term takes the
//    reader to the highlighted occurrences:
//    - on the index page (.term-index): hl = the entry's head term
//    - on note pages: hl = the link text of cross-note links
//
// Loaded with <script defer>; no dependencies.

(function () {
	"use strict";

	var ASCII_WORD = /^[\x21-\x7E]+$/;

	function getParam(name) {
		var m = new URLSearchParams(window.location.search).get(name);
		return m ? m.trim() : null;
	}

	// --- highlighting -------------------------------------------------------

	function collectTextNodes(root) {
		var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: function (node) {
				if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
				var p = node.parentElement;
				if (!p) return NodeFilter.FILTER_REJECT;
				if (p.closest("script, style, textarea, svg, mjx-container, .note-nav, mark")) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		var nodes = [];
		var n;
		while ((n = walker.nextNode())) nodes.push(n);
		return nodes;
	}

	function findMatches(text, term, ascii) {
		var hay = ascii ? text.toLowerCase() : text;
		var needle = ascii ? term.toLowerCase() : term;
		var out = [];
		var idx = hay.indexOf(needle);
		while (idx >= 0) {
			var ok = true;
			if (ascii) {
				// word boundary: neighbours must not be alphanumeric
				var before = idx > 0 ? hay[idx - 1] : "";
				var after = idx + needle.length < hay.length ? hay[idx + needle.length] : "";
				if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) ok = false;
			}
			if (ok) out.push(idx);
			idx = hay.indexOf(needle, idx + needle.length);
		}
		return out;
	}

	function highlightTerm(term) {
		var root = document.querySelector("main");
		if (!root || !term) return [];
		var ascii = ASCII_WORD.test(term);
		var marks = [];
		collectTextNodes(root).forEach(function (node) {
			var positions = findMatches(node.nodeValue, term, ascii);
			if (!positions.length) return;
			var text = node.nodeValue;
			var frag = document.createDocumentFragment();
			var cursor = 0;
			positions.forEach(function (pos) {
				if (pos > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, pos)));
				var mark = document.createElement("mark");
				mark.className = "term-hl";
				mark.textContent = text.slice(pos, pos + term.length);
				frag.appendChild(mark);
				marks.push(mark);
				cursor = pos + term.length;
			});
			if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
			node.parentNode.replaceChild(frag, node);
		});
		return marks;
	}

	function waitForMathJax(timeoutMs) {
		return new Promise(function (resolve) {
			var t0 = Date.now();
			(function poll() {
				var mj = window.MathJax;
				if (mj && mj.startup && mj.startup.promise) {
					mj.startup.promise.then(resolve, resolve);
					return;
				}
				if (Date.now() - t0 > timeoutMs) return resolve();
				setTimeout(poll, 120);
			})();
		});
	}

	function scrollToFirst(marks) {
		if (!marks.length) return;
		var first = marks[0];
		first.classList.add("term-hl-first");
		first.scrollIntoView({ block: "center" });
		// MathJax typesetting shifts layout; re-center once it settles.
		waitForMathJax(4000).then(function () {
			first.scrollIntoView({ behavior: "smooth", block: "center" });
		});
	}

	// --- link decoration ----------------------------------------------------

	function addHl(a, term) {
		var href = a.getAttribute("href");
		if (!href || href.indexOf("hl=") >= 0) return;
		var sep = href.indexOf("?") >= 0 ? "&" : "?";
		a.setAttribute("href", href + sep + "hl=" + encodeURIComponent(term));
	}

	// 見出し語の文字列が本文中の表記と異なる場合の対応表
	var TERM_ALIASES = { "R2": "決定係数" };

	function decorateIndexLinks() {
		document.querySelectorAll(".term-index li").forEach(function (li) {
			var head = li.textContent.split("──")[0];
			var term = head.split(/[（(]/)[0].trim();
			term = TERM_ALIASES[term] || term;
			if (!term) return;
			li.querySelectorAll('a[href*="/notes/"]').forEach(function (a) {
				addHl(a, term);
			});
		});
	}

	function decorateNoteLinks() {
		document.querySelectorAll('main a[href^="../"]').forEach(function (a) {
			if (a.closest(".note-nav")) return;
			var href = a.getAttribute("href");
			if (href.indexOf("../../") === 0) return; // 目次
			// 「…」で囲まれたリンクはノート／付録タイトルへの参照なのでハイライトしない
			var prev = a.previousSibling;
			var next = a.nextSibling;
			var prevText = prev && prev.nodeType === Node.TEXT_NODE ? prev.nodeValue : "";
			var nextText = next && next.nodeType === Node.TEXT_NODE ? next.nodeValue : "";
			if (/「$/.test(prevText) && /^」/.test(nextText)) return;
			var term = a.textContent.trim();
			if (!term || term.length > 30) return;
			addHl(a, term);
		});
	}

	// --- boot ---------------------------------------------------------------

	function run() {
		if (document.querySelector(".term-index")) {
			decorateIndexLinks();
		} else {
			decorateNoteLinks();
		}
		var term = getParam("hl");
		if (term) scrollToFirst(highlightTerm(term));
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", run);
	} else {
		run();
	}
})();
