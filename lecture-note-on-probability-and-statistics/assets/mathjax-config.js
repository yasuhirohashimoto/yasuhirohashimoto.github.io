window.MathJax = {
	tex: {
		inlineMath: [["\\(", "\\)"], ["$", "$"]],
		displayMath: [["\\[", "\\]"], ["$$", "$$"]],
		processEscapes: true,
		tags: "none",
		packages: { "[+]": ["ams", "newcommand", "configmacros"] }
	},
	chtml: {
		scale: 1,
		matchFontHeight: false
	},
	options: {
		skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
		ignoreHtmlClass: "tex2jax_ignore",
		processHtmlClass: "tex2jax_process"
	},
	startup: {
		typeset: true
	}
};
