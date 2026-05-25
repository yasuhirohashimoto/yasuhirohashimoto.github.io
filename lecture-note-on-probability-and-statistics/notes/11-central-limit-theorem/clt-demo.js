(function () {
	"use strict";

	const distributions = {
		uniform: {
			mean: 0.5,
			variance: 1 / 12,
			sample: () => Math.random()
		},
		exponential: {
			mean: 1,
			variance: 1,
			sample: () => -Math.log1p(-Math.random())
		},
		bernoulli: {
			mean: 0.2,
			variance: 0.2 * 0.8,
			sample: () => (Math.random() < 0.2 ? 1 : 0)
		}
	};

	function normalPdf(x) {
		return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
	}

	function fmt(value) {
		return d3.format(".4~f")(value);
	}

	function mulberry32(seed) {
		let t = seed >>> 0;
		return function () {
			t += 0x6D2B79F5;
			let r = Math.imul(t ^ (t >>> 15), t | 1);
			r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
			return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
		};
	}

	function generateUniformSums(n, m, seed) {
		const rng = mulberry32(seed);
		const values = new Array(m);
		for (let j = 0; j < m; j++) {
			let sum = 0;
			for (let i = 0; i < n; i++) sum += rng();
			values[j] = sum;
		}
		return values;
	}

	function generateStandardizedMeans(dist, n, m) {
		const values = new Array(m);
		const denom = Math.sqrt(dist.variance / n);
		for (let j = 0; j < m; j++) {
			let sum = 0;
			for (let i = 0; i < n; i++) sum += dist.sample();
			values[j] = (sum / n - dist.mean) / denom;
		}
		return values;
	}

	function addPanelFrame(g, width, height) {
		g.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("rx", 4)
			.attr("fill", "#fff")
			.attr("stroke", "#d8dde3");
	}

	function drawHistogramPanel(g, opts) {
		const width = opts.width;
		const height = opts.height;
		const margin = { top: 32, right: 16, bottom: 32, left: 42 };
		const xDomain = opts.xDomain;
		const values = opts.values;
		const binsCount = opts.binsCount || 36;
		const binWidth = (xDomain[1] - xDomain[0]) / binsCount;
		const thresholds = d3.range(xDomain[0], xDomain[1] + binWidth * 0.5, binWidth);
		const bins = d3.bin().domain(xDomain).thresholds(thresholds)(values);

		addPanelFrame(g, width, height);

		const x = d3.scaleLinear()
			.domain(xDomain)
			.range([margin.left, width - margin.right]);

		let normalPeak = 0;
		if (opts.normal) {
			normalPeak = values.length * binWidth * normalPdf(0) / opts.normal.sd;
		}

		const maxCount = Math.max(d3.max(bins, (d) => d.length) || 1, normalPeak);
		const y = d3.scaleLinear()
			.domain([0, maxCount])
			.nice()
			.range([height - margin.bottom, margin.top]);

		g.append("text")
			.attr("class", "clt-panel-title")
			.attr("x", 12)
			.attr("y", 19)
			.text(opts.title);

		if (opts.note) {
			g.append("text")
				.attr("class", "clt-panel-note")
				.attr("x", width - 12)
				.attr("y", 19)
				.attr("text-anchor", "end")
				.text(opts.note);
		}

		g.append("g")
			.attr("fill", "#2c6ea6")
			.attr("fill-opacity", 0.76)
			.selectAll("rect")
			.data(bins)
			.join("rect")
			.attr("x", (d) => x(d.x0) + 0.6)
			.attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1.2))
			.attr("y", (d) => y(d.length))
			.attr("height", (d) => y(0) - y(d.length));

		if (opts.normal) {
			const curve = d3.line()
				.x((d) => x(d.x))
				.y((d) => y(d.y))
				.curve(d3.curveMonotoneX);
			const curveData = d3.range(xDomain[0], xDomain[1] + 0.001, (xDomain[1] - xDomain[0]) / 160)
				.map((xValue) => ({
					x: xValue,
					y: values.length * binWidth * normalPdf((xValue - opts.normal.mean) / opts.normal.sd) / opts.normal.sd
				}));

			g.append("path")
				.datum(curveData)
				.attr("fill", "none")
				.attr("stroke", "#111")
				.attr("stroke-opacity", 0.55)
				.attr("stroke-width", 2)
				.attr("d", curve);
		}

		g.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).ticks(4).tickSizeOuter(0))
			.call((axis) => axis.selectAll("text").attr("font-size", 10));

		g.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s")))
			.call((axis) => axis.selectAll("text").attr("font-size", 10));
	}

	function drawSumGrid() {
		const svg = d3.select("#clt-sum-grid");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const panelWidth = 320;
		const panelHeight = 190;
		const panels = [
			{ n: 1, m: 24000, xDomain: [0, 1], binsCount: 24, title: "n = 1", note: "一様" },
			{ n: 2, m: 24000, xDomain: [0, 2], binsCount: 32, title: "n = 2", note: "おや？三角？" },
			{ n: 3, m: 24000, xDomain: [0, 3], binsCount: 36, title: "n = 3", note: "おやおや？" },
			{ n: 10, m: 24000, xDomain: [1, 9], binsCount: 42, title: "n = 10", note: "正規分布が見えてくる", normal: true },
			{ n: 100, m: 24000, xDomain: [40, 60], binsCount: 44, title: "n = 100", note: "期待値 50 付近を拡大", normal: true }
		];

		panels.forEach((panel, i) => {
			const col = i % 2;
			const row = Math.floor(i / 2);
			const x = i === 4 ? 180 : 20 + col * 340;
			const y = 18 + row * 205;
			const g = svg.append("g").attr("transform", `translate(${x},${y})`);
			const values = generateUniformSums(panel.n, panel.m, 20260525 + panel.n);
			const mean = panel.n / 2;
			const sd = Math.sqrt(panel.n / 12);
			drawHistogramPanel(g, {
				width: panelWidth,
				height: panelHeight,
				values,
				xDomain: panel.xDomain,
				binsCount: panel.binsCount,
				title: panel.title,
				note: panel.note,
				normal: panel.normal ? { mean, sd } : null
			});
		});

		svg.append("text")
			.attr("x", 340)
			.attr("y", 642)
			.attr("text-anchor", "middle")
			.attr("font-size", 11)
			.attr("fill", "#555")
			.text("青い棒はシミュレーション，黒い曲線は対応する正規分布近似");
	}

	function drawMGrid() {
		const svg = d3.select("#clt-m-grid");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const panelWidth = 320;
		const panelHeight = 180;
		const n = 100;
		const xDomain = [40, 60];
		const mean = n / 2;
		const sd = Math.sqrt(n / 12);
		const panels = [
			{ m: 100, title: "m = 100" },
			{ m: 1000, title: "m = 1,000" },
			{ m: 10000, title: "m = 10,000" },
			{ m: 30000, title: "m = 30,000" }
		];

		panels.forEach((panel, i) => {
			const col = i % 2;
			const row = Math.floor(i / 2);
			const x = 20 + col * 340;
			const y = 18 + row * 198;
			const g = svg.append("g").attr("transform", `translate(${x},${y})`);
			const values = generateUniformSums(n, panel.m, 31415 + panel.m);
			drawHistogramPanel(g, {
				width: panelWidth,
				height: panelHeight,
				values,
				xDomain,
				binsCount: 40,
				title: panel.title,
				note: "n = 100",
				normal: { mean, sd }
			});
		});
	}

	function n3Pdf(y) {
		if (y < 0 || y > 3) return 0;
		if (y < 1) return y * y / 2;
		if (y < 2) return -((y - 1.5) ** 2) + 0.75;
		return ((3 - y) ** 2) / 2;
	}

	function cubeSection(s) {
		const vertices = [
			[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
			[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
		];
		const edges = [];
		for (let i = 0; i < vertices.length; i++) {
			for (let j = i + 1; j < vertices.length; j++) {
				const diff = vertices[i].filter((v, k) => v !== vertices[j][k]).length;
				if (diff === 1) edges.push([vertices[i], vertices[j]]);
			}
		}

		const points = [];
		edges.forEach(([a, b]) => {
			const sa = a[0] + a[1] + a[2];
			const sb = b[0] + b[1] + b[2];
			const denom = sb - sa;
			if (denom === 0) return;
			const t = (s - sa) / denom;
			if (t < -1e-9 || t > 1 + 1e-9) return;
			points.push([
				a[0] + t * (b[0] - a[0]),
				a[1] + t * (b[1] - a[1]),
				a[2] + t * (b[2] - a[2])
			]);
		});

		const unique = Array.from(new Map(points.map((p) => [p.map((v) => v.toFixed(6)).join(","), p])).values());
		const center = [
			d3.mean(unique, (p) => p[0]),
			d3.mean(unique, (p) => p[1]),
			d3.mean(unique, (p) => p[2])
		];
		const e1 = [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0];
		const e2 = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];
		return unique.sort((a, b) => {
			const da = [a[0] - center[0], a[1] - center[1], a[2] - center[2]];
			const db = [b[0] - center[0], b[1] - center[1], b[2] - center[2]];
			const aa = Math.atan2(d3.sum(da, (v, i) => v * e2[i]), d3.sum(da, (v, i) => v * e1[i]));
			const ab = Math.atan2(d3.sum(db, (v, i) => v * e2[i]), d3.sum(db, (v, i) => v * e1[i]));
			return aa - ab;
		});
	}

	function drawN3Explainer() {
		const svg = d3.select("#clt-n3-svg");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const colors = {
			red: "#c84a3a",
			blue: "#2c6ea6",
			green: "#2f8f5b"
		};

		const plot = svg.append("g").attr("transform", "translate(34,24)");
		const width = 300;
		const height = 280;
		const margin = { top: 18, right: 12, bottom: 36, left: 44 };
		const x = d3.scaleLinear().domain([0, 3]).range([margin.left, width - margin.right]);
		const y = d3.scaleLinear().domain([0, 0.8]).range([height - margin.bottom, margin.top]);

		plot.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("rx", 4)
			.attr("fill", "#fff")
			.attr("stroke", "#d8dde3");
		plot.append("text")
			.attr("class", "clt-panel-title")
			.attr("x", 12)
			.attr("y", 20)
			.text("n = 3 の密度");

		const segments = [
			{ from: 0, to: 1, color: colors.red, label: "y^2/2" },
			{ from: 1, to: 2, color: colors.blue, label: "-(y-3/2)^2+3/4" },
			{ from: 2, to: 3, color: colors.green, label: "(3-y)^2/2" }
		];

		segments.forEach((segment) => {
			const area = d3.area()
				.x((d) => x(d))
				.y0(y(0))
				.y1((d) => y(n3Pdf(d)))
				.curve(d3.curveMonotoneX);
			const line = d3.line()
				.x((d) => x(d))
				.y((d) => y(n3Pdf(d)))
				.curve(d3.curveMonotoneX);
			const data = d3.range(segment.from, segment.to + 0.001, 0.02);
			plot.append("path")
				.datum(data)
				.attr("fill", segment.color)
				.attr("fill-opacity", 0.18)
				.attr("d", area);
			plot.append("path")
				.datum(data)
				.attr("fill", "none")
				.attr("stroke", segment.color)
				.attr("stroke-width", 2.4)
				.attr("d", line);
		});

		plot.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).ticks(4).tickSizeOuter(0));
		plot.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(4));
		plot.append("text")
			.attr("x", (margin.left + width - margin.right) / 2)
			.attr("y", height - 7)
			.attr("font-size", 11)
			.attr("font-weight", 700)
			.attr("text-anchor", "middle")
			.text("Y");

		const cube = svg.append("g").attr("transform", "translate(380,30)");
		const project = ([px, py, pz]) => [
			150 + (px - py) * 72,
			205 + (px + py) * 34 - pz * 102
		];
		const vertices = [
			[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
			[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
		];
		const edgePairs = [];
		for (let i = 0; i < vertices.length; i++) {
			for (let j = i + 1; j < vertices.length; j++) {
				const diff = vertices[i].filter((v, k) => v !== vertices[j][k]).length;
				if (diff === 1) edgePairs.push([vertices[i], vertices[j]]);
			}
		}

		cube.append("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", 286)
			.attr("height", 280)
			.attr("rx", 4)
			.attr("fill", "#fff")
			.attr("stroke", "#d8dde3");
		cube.append("text")
			.attr("class", "clt-panel-title")
			.attr("x", 12)
			.attr("y", 20)
			.text("立方体の断面");

		[
			{ s: 0.72, color: colors.red, label: "Y=0.72" },
			{ s: 1.5, color: colors.blue, label: "Y=1.5" },
			{ s: 2.28, color: colors.green, label: "Y=2.28" }
		].forEach((section) => {
			const points = cubeSection(section.s).map(project);
			cube.append("polygon")
				.attr("points", points.map((p) => p.join(",")).join(" "))
				.attr("fill", section.color)
				.attr("fill-opacity", 0.28)
				.attr("stroke", section.color)
				.attr("stroke-width", 2);
		});

		cube.append("g")
			.attr("stroke", "#333")
			.attr("stroke-opacity", 0.65)
			.attr("fill", "none")
			.selectAll("line")
			.data(edgePairs)
			.join("line")
			.attr("x1", (d) => project(d[0])[0])
			.attr("y1", (d) => project(d[0])[1])
			.attr("x2", (d) => project(d[1])[0])
			.attr("y2", (d) => project(d[1])[1]);

		cube.append("text")
			.attr("x", 143)
			.attr("y", 258)
			.attr("font-size", 11)
			.attr("fill", "#555")
			.attr("text-anchor", "middle")
			.text("X_1 + X_2 + X_3 = const.");
	}

	function setupInteractiveDemo() {
		const svg = d3.select("#clt-svg");
		const distSelect = document.getElementById("clt-dist");
		const nSelect = document.getElementById("clt-n");
		const mSelect = document.getElementById("clt-m");
		const reroll = document.getElementById("clt-reroll");
		const meanOut = document.getElementById("clt-mean");
		const varOut = document.getElementById("clt-var");
		const seOut = document.getElementById("clt-se");

		if (!svg.node() || !distSelect || !nSelect || !mSelect || !reroll) return;

		const width = 620;
		const height = 360;
		const margin = { top: 18, right: 24, bottom: 48, left: 58 };
		const xDomain = [-4, 4];
		let pending = false;

		function draw() {
			pending = false;
			const dist = distributions[distSelect.value];
			const n = Number(nSelect.value);
			const m = Number(mSelect.value);
			const zValues = generateStandardizedMeans(dist, n, m);

			meanOut.textContent = fmt(dist.mean);
			varOut.textContent = fmt(dist.variance);
			seOut.textContent = fmt(Math.sqrt(dist.variance / n));

			svg.selectAll("*").remove();

			const x = d3.scaleLinear()
				.domain(xDomain)
				.range([margin.left, width - margin.right]);

			const thresholds = d3.range(xDomain[0], xDomain[1] + 0.0001, 0.25);
			const bins = d3.bin()
				.domain(x.domain())
				.thresholds(thresholds)(zValues);

			const binWidth = bins[0].x1 - bins[0].x0;
			const normalPeak = m * binWidth * normalPdf(0);
			const maxCount = Math.max(d3.max(bins, (d) => d.length) || 1, normalPeak);

			const y = d3.scaleLinear()
				.domain([0, maxCount])
				.nice()
				.range([height - margin.bottom, margin.top]);

			svg.append("g")
				.attr("fill", "#2c6ea6")
				.attr("fill-opacity", 0.78)
				.selectAll("rect")
				.data(bins)
				.join("rect")
				.attr("x", (d) => x(d.x0) + 1)
				.attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1))
				.attr("y", (d) => y(d.length))
				.attr("height", (d) => y(0) - y(d.length));

			const curve = d3.line()
				.x((d) => x(d.x))
				.y((d) => y(d.y))
				.curve(d3.curveMonotoneX);

			const curveData = d3.range(xDomain[0], xDomain[1] + 0.001, 0.05)
				.map((xValue) => ({
					x: xValue,
					y: m * binWidth * normalPdf(xValue)
				}));

			svg.append("path")
				.datum(curveData)
				.attr("fill", "none")
				.attr("stroke", "#111")
				.attr("stroke-opacity", 0.62)
				.attr("stroke-width", 2)
				.attr("d", curve);

			svg.append("line")
				.attr("x1", x(0))
				.attr("x2", x(0))
				.attr("y1", margin.top)
				.attr("y2", height - margin.bottom)
				.attr("stroke", "#d97904")
				.attr("stroke-width", 1.5)
				.attr("stroke-dasharray", "4 4");

			svg.append("g")
				.attr("transform", `translate(0,${height - margin.bottom})`)
				.call(d3.axisBottom(x).ticks(9))
				.call((g) => g.append("text")
					.attr("x", (margin.left + width - margin.right) / 2)
					.attr("y", 38)
					.attr("fill", "#000")
					.attr("font-size", 12)
					.attr("font-weight", 700)
					.attr("text-anchor", "middle")
					.text("標準化した標本平均 Z_n"));

			svg.append("g")
				.attr("transform", `translate(${margin.left},0)`)
				.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("d")))
				.call((g) => g.append("text")
					.attr("transform", "rotate(-90)")
					.attr("x", -(height - margin.top - margin.bottom) / 2 - margin.top)
					.attr("y", -42)
					.attr("fill", "#000")
					.attr("font-size", 12)
					.attr("font-weight", 700)
					.attr("text-anchor", "middle")
					.text("度数"));

			const legend = svg.append("g")
				.attr("transform", `translate(${width - margin.right - 138},${margin.top + 6})`)
				.attr("font-size", 12);

			legend.append("rect")
				.attr("x", 0)
				.attr("y", -9)
				.attr("width", 12)
				.attr("height", 12)
				.attr("fill", "#2c6ea6")
				.attr("fill-opacity", 0.78);
			legend.append("text")
				.attr("x", 18)
				.attr("y", 1)
				.text("シミュレーション");
			legend.append("line")
				.attr("x1", 0)
				.attr("x2", 12)
				.attr("y1", 18)
				.attr("y2", 18)
				.attr("stroke", "#111")
				.attr("stroke-opacity", 0.62)
				.attr("stroke-width", 2);
			legend.append("text")
				.attr("x", 18)
				.attr("y", 22)
				.text("標準正規分布");
		}

		function schedule() {
			if (pending) return;
			pending = true;
			window.requestAnimationFrame(draw);
		}

		distSelect.addEventListener("change", schedule);
		nSelect.addEventListener("change", schedule);
		mSelect.addEventListener("change", schedule);
		reroll.addEventListener("click", draw);
		draw();
	}

	document.addEventListener("DOMContentLoaded", () => {
		drawSumGrid();
		drawMGrid();
		drawN3Explainer();
		setupInteractiveDemo();
	});
})();
