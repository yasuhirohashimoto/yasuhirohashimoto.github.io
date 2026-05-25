(async () => {
			const svg = d3.select("#bayes-tree-svg");
			const C = PROB_COLORS;

			const nodes = {
				omega: { x: 40,  y: 105, label: "\\(\\Omega\\)", r: 14, color: C.text },
				H:     { x: 140, y: 50,  label: "\\(H\\)",       r: 14, color: C.text },
				Hc:    { x: 140, y: 160, label: "\\(H^c\\)",     r: 14, color: C.text },
				D1:    { x: 240, y: 24,  label: "\\(D\\)",       r: 14, color: C.D },
				Dc1:   { x: 240, y: 82,  label: "\\(D^c\\)",     r: 14, color: C.DC },
				D2:    { x: 240, y: 128, label: "\\(D\\)",       r: 14, color: C.D },
				Dc2:   { x: 240, y: 186, label: "\\(D^c\\)",     r: 14, color: C.DC },
			};

			const edges = [
				["omega", "H",  "\\(P(H)\\)",              -15],
				["omega", "Hc", "\\(P(H^c)\\)",             15],
				["H",     "D1", "\\(P(D \\mid H)\\)",      -15],
				["H",     "Dc1","\\(P(D^c \\mid H)\\)",     15],
				["Hc",    "D2", "\\(P(D \\mid H^c)\\)",    -15],
				["Hc",    "Dc2","\\(P(D^c \\mid H^c)\\)",   15],
			];

			function drawEdge(a, b, label, yoff) {
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const len = Math.sqrt(dx * dx + dy * dy);

				const ux = dx / len;
				const uy = dy / len;

				const x1 = a.x + ux * a.r;
				const y1 = a.y + uy * a.r;
				const x2 = b.x - ux * b.r;
				const y2 = b.y - uy * b.r;

				svg.append("line")
					.attr("x1", x1)
					.attr("y1", y1)
					.attr("x2", x2)
					.attr("y2", y2)
					.attr("stroke", C.line)
					.attr("stroke-width", 1.3);

				const mx = (x1 + x2) / 2;
				const my = (y1 + y2) / 2 + yoff;

				texFO(svg, mx, my, 110, 16, label, { anchor: "center", color: C.sub, size: "10.5px" });
			}

			// 枝
			edges.forEach(([f, t, label, yoff]) => {
				drawEdge(nodes[f], nodes[t], label, yoff);
			});

			// ノード
			Object.values(nodes).forEach(n => {
				svg.append("circle")
					.attr("cx", n.x)
					.attr("cy", n.y)
					.attr("r", n.r)
					.attr("fill", C.node)
					.attr("stroke", n.color)
					.attr("stroke-width", 1.4);

				texFO(svg, n.x, n.y, 30, 18, n.label, { anchor: "center", color: n.color, size: "12.5px" });
			});

			// 各経路の積
			const pathOpts = { anchor: "center", size: "11.5px", align: "left" };
			texFO(svg, 370, nodes.D1.y-10,  210, 16, "\\(P(D \\mid H)P(H) = P(D\\cap H)\\)",       { ...pathOpts, color: C.D });
			texFO(svg, 370, nodes.Dc1.y-10, 210, 16, "\\(P(D^c \\mid H)P(H) = P(D^c\\cap H)\\)",   { ...pathOpts, color: C.DC });
			texFO(svg, 370, nodes.D2.y-10,  210, 16, "\\(P(D \\mid H^c)P(H^c) = P(D\\cap H^c)\\)", { ...pathOpts, color: C.D });
			texFO(svg, 370, nodes.Dc2.y-10, 210, 16, "\\(P(D^c \\mid H^c)P(H^c) = P(D^c\\cap H^c)\\)", { ...pathOpts, color: C.DC });

			// 右側のまとめ折れ線
			function groupLineToNodes(x, nodeTop, nodeBottom, color, label, w = 56) {
				const y1 = nodeTop.y;
				const y2 = nodeBottom.y;
				const mid = (y1 + y2) / 2;

				const leftTopX = nodeTop.x + nodeTop.r;
				const leftBotX = nodeBottom.x + nodeBottom.r;

				// 上端 → 縦線
				svg.append("line")
					.attr("x1", leftTopX)
					.attr("y1", y1)
					.attr("x2", x)
					.attr("y2", y1)
					.attr("stroke", color)
					.attr("stroke-width", 1.5);

				// 下端 → 縦線
				svg.append("line")
					.attr("x1", leftBotX)
					.attr("y1", y2)
					.attr("x2", x)
					.attr("y2", y2)
					.attr("stroke", color)
					.attr("stroke-width", 1.5);

				// 縦線
				svg.append("line")
					.attr("x1", x)
					.attr("y1", y1)
					.attr("x2", x)
					.attr("y2", y2)
					.attr("stroke", color)
					.attr("stroke-width", 1.5);

				// ラベル側への短い横線
				svg.append("line")
					.attr("x1", x)
					.attr("y1", mid)
					.attr("x2", x + 16)
					.attr("y2", mid)
					.attr("stroke", color)
					.attr("stroke-width", 1.5);

				texFO(svg, x + 44, mid, w, 16, label, { anchor: "center", color, size: "12.5px", align: "left" });
			}

			groupLineToNodes(428, nodes.D1,  nodes.D2,  C.D,  "\\(P(D)\\)",   44);
			groupLineToNodes(438, nodes.Dc1, nodes.Dc2, C.DC, "\\(P(D^c)\\)", 44);

			await typesetSvg(svg);
		})();

(async () => {
			const phSlider = document.getElementById("bayes-ph");
			const pdhSlider = document.getElementById("bayes-pdh");
			const pdnhSlider = document.getElementById("bayes-pdnh");
			const phVal = document.getElementById("bayes-ph-val");
			const pdhVal = document.getElementById("bayes-pdh-val");
			const pdnhVal = document.getElementById("bayes-pdnh-val");
			const resultDiv = document.getElementById("bayes-result");

			const svg = d3.select("#bayes-svg");
			const W = 240, H = 240;
			const margin = { top: 28, right: 18, bottom: 50, left: 38 };
			const chartW = W - margin.left - margin.right;
			const chartH = H - margin.top - margin.bottom;

			const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

			// 4 colors: 橙系=D, 青系=D^c, 濃い色=H, 薄い色=H^c
			const COLOR_HD   = PROB_COLORS.D;        // 濃い橙: P(H ∩ D)
			const COLOR_HND  = PROB_COLORS.DC;       // 濃い青: P(H ∩ D^c)
			const COLOR_NHD  = PROB_COLORS.DLight;   // 薄い橙: P(H^c ∩ D)
			const COLOR_NHND = PROB_COLORS.DCLight;  // 薄い青: P(H^c ∩ D^c)

			const cellHD   = g.append("rect").attr("fill", COLOR_HD);
			const cellHND  = g.append("rect").attr("fill", COLOR_HND);
			const cellNHD  = g.append("rect").attr("fill", COLOR_NHD);
			const cellNHND = g.append("rect").attr("fill", COLOR_NHND);

			const outerBorder = g.append("rect")
				.attr("x", 0).attr("y", 0)
				.attr("width", chartW).attr("height", chartH)
				.attr("fill", "none").attr("stroke", "#333").attr("stroke-width", 1.5);
			const vDivider = g.append("line")
				.attr("y1", 0).attr("y2", chartH)
				.attr("stroke", "#333").attr("stroke-width", 1);
			const hDividerL = g.append("line")
				.attr("x1", 0)
				.attr("stroke", "#333").attr("stroke-width", 1);
			const hDividerR = g.append("line")
				.attr("x2", chartW)
				.attr("stroke", "#333").attr("stroke-width", 1);

			const labelH  = texFO(g, 0, -22, 32, 18, "\\(H\\)",   { size: "12px" });
			const labelNH = texFO(g, 0, -22, 40, 18, "\\(H^c\\)", { size: "12px" });

			// D / D^c row labels on the left side, with arrows indicating up/down rows
			texFO(g, -34, chartH * 0.25 - 9, 30, 18, "\\(\\uparrow D\\)",     { size: "12px" });
			texFO(g, -36, chartH * 0.75 - 9, 32, 18, "\\(\\downarrow D^c\\)", { size: "12px" });

			// legend at bottom: 2x2 layout mirroring the chart structure
			const legendY = chartH + 12;
			const legendItems2D = [
				[
					{ color: COLOR_HD,   label: "\\(P(H \\cap D)\\)" },
					{ color: COLOR_NHD,  label: "\\(P(H^c \\cap D)\\)" },
				],
				[
					{ color: COLOR_HND,  label: "\\(P(H \\cap D^c)\\)" },
					{ color: COLOR_NHND, label: "\\(P(H^c \\cap D^c)\\)" },
				],
			];
			const itemWidth = chartW / 2;
			const rowHeight = 18;
			legendItems2D.forEach((row, rowIdx) => {
				const y = legendY + rowIdx * rowHeight;
				row.forEach((item, colIdx) => {
					const swatchX = colIdx * itemWidth;
					g.append("rect").attr("x", swatchX).attr("y", y).attr("width", 12).attr("height", 10)
						.attr("fill", item.color).attr("stroke", "#333").attr("stroke-width", 0.8);
					texFO(g, swatchX + 16, y - 4, itemWidth - 18, 18, item.label, { color: "#333", size: "10.5px" });
				});
			});

			function update() {
				const pH = parseFloat(phSlider.value);
				const pDH = parseFloat(pdhSlider.value);
				const pDnH = parseFloat(pdnhSlider.value);

				phVal.textContent = pH.toFixed(2);
				pdhVal.textContent = pDH.toFixed(2);
				pdnhVal.textContent = pDnH.toFixed(2);

				const wL = chartW * pH;
				const wR = chartW - wL;
				const hTL = chartH * pDH;
				const hBL = chartH - hTL;
				const hTR = chartH * pDnH;
				const hBR = chartH - hTR;

				cellHD.attr("x", 0).attr("y", 0).attr("width", wL).attr("height", hTL);
				cellHND.attr("x", 0).attr("y", hTL).attr("width", wL).attr("height", hBL);
				cellNHD.attr("x", wL).attr("y", 0).attr("width", wR).attr("height", hTR);
				cellNHND.attr("x", wL).attr("y", hTR).attr("width", wR).attr("height", hBR);

				vDivider.attr("x1", wL).attr("x2", wL);
				hDividerL.attr("x2", wL).attr("y1", hTL).attr("y2", hTL);
				hDividerR.attr("x1", wL).attr("y1", hTR).attr("y2", hTR);

				labelH.attr("x", wL / 2 - 16);
				labelNH.attr("x", wL + wR / 2 - 20);

				const pD = pDH * pH + pDnH * (1 - pH);
				const pHD = pD > 0 ? (pDH * pH) / pD : 0;

				resultDiv.innerHTML = `\\[
					P(H \\mid D)
					\\;=\\; \\frac{\\color{${COLOR_HD}}{P(D \\mid H)\\,P(H)}}{\\color{${COLOR_HD}}{P(D \\mid H)\\,P(H)} + \\color{${COLOR_NHD}}{P(D \\mid H^c)\\,P(H^c)}}
					\\;=\\; \\frac{\\color{${COLOR_HD}}{${pDH.toFixed(2)} \\times ${pH.toFixed(2)}}}{\\color{${COLOR_HD}}{${pDH.toFixed(2)} \\times ${pH.toFixed(2)}} + \\color{${COLOR_NHD}}{${pDnH.toFixed(2)} \\times ${(1 - pH).toFixed(2)}}}
					\\;\\approx\\; ${pHD.toFixed(3)}
				\\]`;

				typesetSvg(resultDiv);
			}

			phSlider.addEventListener("input", update);
			pdhSlider.addEventListener("input", update);
			pdnhSlider.addEventListener("input", update);

			await typesetSvg(svg);
			update();
		})();
