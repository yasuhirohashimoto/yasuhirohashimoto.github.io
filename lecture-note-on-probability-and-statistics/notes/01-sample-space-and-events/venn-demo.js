(async () => {
	const Omega = [1, 2, 3, 4, 5, 6];
	const A = new Set([2, 3]);
	const B = new Set([1, 3, 5]);
	const C = new Set([2, 4, 6]);
	const OmegaSet = new Set(Omega);

	const union = (X, Y) => new Set([...X, ...Y]);
	const inter = (X, Y) => new Set([...X].filter(e => Y.has(e)));
	const diff = (X, Y) => new Set([...X].filter(e => !Y.has(e)));
	const comp = (X) => diff(OmegaSet, X);

	// 条件の選択肢（フラット）
	const condEvents = [
		{ label: "Ω", tex: "\\Omega", set: OmegaSet },
		{ label: "A", tex: "A", set: A },
		{ label: "B", tex: "B", set: B },
		{ label: "C", tex: "C", set: C },
		{ label: "A ∪ B", tex: "(A \\cup B)", set: union(A, B) },
		{ label: "A ∪ C", tex: "(A \\cup C)", set: union(A, C) },
		{ label: "B ∪ C", tex: "(B \\cup C)", set: union(B, C) },
		{ label: "A ∩ B", tex: "(A \\cap B)", set: inter(A, B) },
		{ label: "A ∩ C", tex: "(A \\cap C)", set: inter(A, C) },
		{ label: "B ∩ C", tex: "(B \\cap C)", set: inter(B, C) },
		{ label: "Aᶜ", tex: "A^c", set: comp(A) },
		{ label: "Bᶜ", tex: "B^c", set: comp(B) },
		{ label: "Cᶜ", tex: "C^c", set: comp(C) },
	];

	// 着目事象の選択肢（optgroup 付き）
	const targetGroups = [
		{ label: "単一事象", items: [
			{ label: "A", tex: "A", set: A },
			{ label: "B", tex: "B", set: B },
			{ label: "C", tex: "C", set: C },
		]},
		{ label: "和事象", items: [
			{ label: "A ∪ B", tex: "(A \\cup B)", set: union(A, B) },
			{ label: "A ∪ C", tex: "(A \\cup C)", set: union(A, C) },
			{ label: "B ∪ C", tex: "(B \\cup C)", set: union(B, C) },
		]},
		{ label: "積事象", items: [
			{ label: "A ∩ B", tex: "(A \\cap B)", set: inter(A, B) },
			{ label: "A ∩ C", tex: "(A \\cap C)", set: inter(A, C) },
			{ label: "B ∩ C", tex: "(B \\cap C)", set: inter(B, C) },
		]},
		{ label: "補事象", items: [
			{ label: "Aᶜ", tex: "A^c", set: comp(A) },
			{ label: "Bᶜ", tex: "B^c", set: comp(B) },
			{ label: "Cᶜ", tex: "C^c", set: comp(C) },
		]},
		{ label: "差事象", items: [
			{ label: "A ∖ B", tex: "(A \\setminus B)", set: diff(A, B) },
			{ label: "B ∖ A", tex: "(B \\setminus A)", set: diff(B, A) },
			{ label: "A ∖ C", tex: "(A \\setminus C)", set: diff(A, C) },
			{ label: "C ∖ A", tex: "(C \\setminus A)", set: diff(C, A) },
		]},
		{ label: "ド・モルガン", items: [
			{ label: "(A ∪ B)ᶜ", tex: "(A \\cup B)^c", set: comp(union(A, B)) },
			{ label: "Aᶜ ∩ Bᶜ", tex: "(A^c \\cap B^c)", set: inter(comp(A), comp(B)) },
		]},
		{ label: "複合", items: [
			{ label: "(A ∪ B) ∩ C", tex: "((A \\cup B) \\cap C)", set: inter(union(A, B), C) },
		]},
	];

	const allTargets = targetGroups.flatMap(g => g.items);

	const condSelect = document.getElementById("venn-cond-select");
	const targetSelect = document.getElementById("venn-target-select");

	// condition (flat list)
	condEvents.forEach(e => {
		const opt = document.createElement("option");
		opt.value = e.label;
		opt.textContent = e.label;
		condSelect.appendChild(opt);
	});
	condSelect.value = "Ω";

	// target (with optgroups)
	targetGroups.forEach(g => {
		const og = document.createElement("optgroup");
		og.label = g.label;
		g.items.forEach(it => {
			const opt = document.createElement("option");
			opt.value = it.label;
			opt.textContent = it.label;
			og.appendChild(opt);
		});
		targetSelect.appendChild(og);
	});
	targetSelect.value = "A";

	const positions = {
		1: [90, 150],
		2: [300, 170],
		3: [200, 170],
		4: [395, 200],
		5: [105, 200],
		6: [410, 150],
	};

	const svg = d3.select("#venn-svg");

	svg.append("rect")
		.attr("x", 20).attr("y", 20)
		.attr("width", 460).attr("height", 260)
		.attr("fill", PROB_COLORS.node)
		.attr("stroke", PROB_COLORS.grid)
		.attr("stroke-dasharray", "3 3")
		.attr("rx", 4);
	texFO(svg, 460, 37, 24, 22, "\\(\\Omega\\)", { color: PROB_COLORS.sub, size: "16px", anchor: "center" });

	const circles = [
		{ name: "B", cx: 150, cy: 170, r: 85, fill: PROB_COLORS.DC, opacity: 0.18, stroke: PROB_COLORS.DCText, labelPos: [150, 102] },
		{ name: "C", cx: 350, cy: 170, r: 85, fill: PROB_COLORS.green, opacity: 0.18, stroke: PROB_COLORS.greenText, labelPos: [350, 102] },
		{ name: "A", cx: 250, cy: 170, r: 70, fill: PROB_COLORS.D, opacity: 0.20, stroke: PROB_COLORS.DText, labelPos: [250, 120] },
	];
	circles.forEach(c => {
		svg.append("circle")
			.attr("cx", c.cx).attr("cy", c.cy).attr("r", c.r)
			.attr("fill", c.fill).attr("fill-opacity", c.opacity)
			.attr("stroke", c.stroke).attr("stroke-width", 1.5);
		texFO(svg, c.labelPos[0], c.labelPos[1], 24, 22, `\\(${c.name}\\)`, { color: c.stroke, size: "18px", anchor: "center" });
	});

	const dots = svg.selectAll("g.dot")
		.data(Omega)
		.enter()
		.append("g")
		.attr("class", "dot")
		.attr("transform", n => `translate(${positions[n][0]},${positions[n][1]})`);

	dots.append("circle")
		.attr("r", 13)
		.attr("fill", PROB_COLORS.node)
		.attr("stroke", PROB_COLORS.line)
		.attr("stroke-width", 1.5);
	dots.append("text")
		.attr("text-anchor", "middle")
		.attr("dy", "0.35em")
		.style("font-weight", "bold")
		.style("font-size", "14px")
		.attr("fill", PROB_COLORS.text)
		.text(n => n);

	const resultDiv = document.getElementById("venn-result");

	function update() {
		const cond = condEvents.find(e => e.label === condSelect.value);
		const target = allTargets.find(e => e.label === targetSelect.value);
		const intersection = inter(cond.set, target.set);
		const condSize = cond.set.size;
		const interSize = intersection.size;
		const condArr = [...cond.set].sort((a, b) => a - b);
		const interArr = [...intersection].sort((a, b) => a - b);

		dots.select("circle")
			.transition().duration(250)
			.attr("opacity", n => cond.set.has(n) ? 1 : 0.45)
			.attr("fill", n => {
				if (!cond.set.has(n)) return PROB_COLORS.node;
				if (target.set.has(n)) return PROB_COLORS.D;
				return PROB_COLORS.node;
			})
			.attr("stroke", n => {
				if (!cond.set.has(n)) return PROB_COLORS.grid;
				if (target.set.has(n)) return PROB_COLORS.DText;
				return PROB_COLORS.line;
			})
			.attr("r", n => {
				if (!cond.set.has(n)) return 9;
				if (target.set.has(n)) return 15;
				return 11;
			});

		dots.select("text")
			.transition().duration(250)
			.attr("opacity", n => cond.set.has(n) ? 1 : 0.65)
			.attr("fill", n => {
				if (!cond.set.has(n)) return PROB_COLORS.line;
				if (target.set.has(n)) return PROB_COLORS.node;
				return PROB_COLORS.text;
			});

		const condElems = condSize === 0 ? "\\varnothing" : `\\{${condArr.join(", ")}\\}`;
		const interElems = interSize === 0 ? "\\varnothing" : `\\{${interArr.join(", ")}\\}`;

		let html;
		if (condSize === 0) {
			html = `<p>条件 \\(${cond.tex} = \\varnothing\\) なので，\\(P(${target.tex}\\mid ${cond.tex})\\) は <strong>定義されない</strong>。</p>`;
		} else {
			// 分子（着目∩条件）を図の強調点と同系の濃橙で色付けして対応を示す
			const HL = PROB_COLORS.DText;
			html = `\\[ P(${target.tex}\\mid ${cond.tex}) \\;=\\; \\frac{\\color{${HL}}{|${target.tex}\\cap ${cond.tex}|}}{|${cond.tex}|} \\;=\\; \\frac{\\color{${HL}}{|${interElems}|}}{|${condElems}|} \\;=\\; \\frac{\\color{${HL}}{${interSize}}}{${condSize}} \\]`;
		}

		resultDiv.innerHTML = html;
		typesetSvg(resultDiv);
	}

	condSelect.addEventListener("change", update);
	targetSelect.addEventListener("change", update);

	await typesetSvg(svg);
	update();
})();
