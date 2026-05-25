(async () => {
			const svg = d3.select("#likelihood-svg");
			const Lfn    = lam => Math.pow(lam, 12) * Math.exp(-5 * lam) / 1440;
			const logLfn = lam => 12 * Math.log(lam) - 5 * lam;   // const is omitted
			const PEAK = 2.4;
			const lamMin = 0.4, lamMax = 5.2;
			const N = 240;
			const lamValues = d3.range(N + 1).map(i => lamMin + (lamMax - lamMin) * i / N);

			function drawPanel(ox, title, fn) {
				const W = 290, H = 240;
				const M = { top: 30, right: 12, bottom: 36, left: 26 };
				const plotW = W - M.left - M.right;
				const plotH = H - M.top - M.bottom;

				const ys = lamValues.map(fn);
				const yMin = d3.min(ys);
				const yMax = d3.max(ys);
				const yPad = (yMax - yMin) * 0.08;

				const xScale = d3.scaleLinear().domain([lamMin, lamMax]).range([0, plotW]);
				const yScale = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([plotH, 0]);

				const g = svg.append("g").attr("transform", `translate(${ox + M.left}, ${M.top})`);

				// x axis baseline
				g.append("line")
					.attr("x1", 0).attr("x2", plotW)
					.attr("y1", plotH).attr("y2", plotH)
					.attr("stroke", "#888");

				// x ticks
				xScale.ticks(5).forEach(t => {
					const px = xScale(t);
					g.append("line").attr("x1", px).attr("x2", px).attr("y1", plotH).attr("y2", plotH + 4).attr("stroke", "#888");
					g.append("text").attr("x", px).attr("y", plotH + 16).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#666").text(t);
				});

				// curve
				const line = d3.line().x((_, i) => xScale(lamValues[i])).y(d => yScale(d));
				g.append("path").datum(ys).attr("fill", "none").attr("stroke", "#444").attr("stroke-width", 1.6).attr("d", line);

				// peak marker
				const peakX = xScale(PEAK);
				const peakY = yScale(fn(PEAK));
				g.append("line")
					.attr("x1", peakX).attr("x2", peakX)
					.attr("y1", peakY).attr("y2", plotH)
					.attr("stroke", "#c25b2a")
					.attr("stroke-dasharray", "3 3")
					.attr("stroke-width", 1);
				g.append("circle").attr("cx", peakX).attr("cy", peakY).attr("r", 3.8).attr("fill", "#c25b2a");

				// title (TeX)
				texFO(svg, ox + M.left + plotW / 2, 4, 240, 20, title,
					{ anchor: "topcenter", color: "#333", size: "13px" });

				// x-axis λ label
				texFO(svg, ox + M.left + plotW + 2, M.top + plotH - 9, 16, 16, "\\(\\lambda\\)",
					{ anchor: "topleft", color: "#444", size: "12px" });

				// peak label "λ = 2.4" (TeX)
				texFO(svg, ox + M.left + peakX + 6, M.top + peakY - 8, 60, 16, "\\(\\lambda = 2.4\\)",
					{ anchor: "topleft", color: "#c25b2a", size: "11px" });
			}

			drawPanel(0,   "\\(L(\\lambda)\\)",       Lfn);
			drawPanel(310, "\\(\\log L(\\lambda)\\)", logLfn);

			typesetSvg(svg);
		})();
