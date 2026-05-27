(async () => {
			const DINO = [55.38,97.18,51.54,96.03,46.15,94.49,42.82,91.41,40.77,88.33,38.72,84.87,35.64,79.87,33.08,77.56,28.97,74.49,26.15,71.41,23.08,66.41,22.31,61.79,22.31,57.18,23.33,52.95,25.9,51.03,29.49,51.03,32.82,51.03,35.38,51.41,40.26,51.41,44.1,52.95,46.67,54.1,50.0,55.26,53.08,55.64,56.67,56.03,59.23,57.95,61.28,62.18,61.54,66.41,61.79,69.1,57.44,55.26,54.87,49.87,52.56,46.03,48.21,38.33,49.49,42.18,51.03,44.1,45.38,36.41,42.82,32.56,38.72,31.41,35.13,30.26,32.56,32.18,30.0,36.79,33.59,41.41,36.67,45.64,38.21,49.1,29.74,36.03,29.74,32.18,30.0,29.1,32.05,26.79,35.9,25.26,41.03,25.26,44.1,25.64,47.18,28.72,49.49,31.41,51.54,34.87,53.59,37.56,55.13,40.64,56.67,42.18,59.23,44.49,62.31,46.03,64.87,46.79,67.95,47.95,70.51,53.72,71.54,60.64,71.54,64.49,69.49,69.49,46.92,79.87,48.21,84.1,50.0,85.26,53.08,85.26,55.38,86.03,56.67,86.03,56.15,82.95,53.85,80.64,51.28,78.72,50.0,78.72,47.95,77.56,29.74,59.87,29.74,62.18,31.28,62.56,57.95,99.49,61.79,99.1,64.87,97.56,68.46,94.1,70.77,91.03,72.05,86.41,73.85,83.33,75.13,79.1,76.67,75.26,77.69,71.41,79.74,66.79,81.79,60.26,83.33,55.26,85.13,51.41,86.41,47.56,87.95,46.03,89.49,42.56,93.33,39.87,95.38,36.79,98.21,33.72,56.67,40.64,59.23,38.33,60.77,33.72,63.08,29.1,64.1,25.26,64.36,24.1,74.36,22.95,71.28,22.95,67.95,22.18,65.9,20.26,63.08,19.1,61.28,19.1,58.72,18.33,55.13,18.33,52.31,18.33,49.74,17.56,47.44,16.03,44.87,13.72,48.72,14.87,51.28,14.87,54.1,14.87,56.15,14.1,52.05,12.56,48.72,11.03,47.18,9.87,46.15,6.03,50.51,9.49,53.85,10.26,57.44,10.26,60.0,10.64,64.1,10.64,66.92,10.64,71.28,10.64,74.36,10.64,78.21,10.64,67.95,8.72,68.46,5.26,68.21,2.95,37.69,25.77,39.49,25.38,91.28,41.54,50.0,95.77,47.95,95.0,44.1,92.69];

			const svgNS = "http://www.w3.org/2000/svg";
			const xhtmlNS = "http://www.w3.org/1999/xhtml";
			const svg = document.getElementById("datasaurus-svg");

			// inline foreignObject helper (D3 not loaded in this note)
			function makeFO(cx, cy, w, h, html, color, size) {
				const fo = document.createElementNS(svgNS, "foreignObject");
				fo.setAttribute("x", cx - w / 2);
				fo.setAttribute("y", cy - h / 2);
				fo.setAttribute("width", w);
				fo.setAttribute("height", h);
				const div = document.createElementNS(xhtmlNS, "div");
				div.setAttribute("xmlns", xhtmlNS);
				div.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;line-height:1;font-size:" + size + ";color:" + color + ";";
				div.innerHTML = html;
				fo.appendChild(div);
				svg.appendChild(fo);
				return fo;
			}

			const W = 360, H = 280;
			svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

			// Layout: origin near bottom-left, axes extend up/right with arrow tips
			// Pulled inward from viewBox edges to leave room for X/Y/tick labels
			const ORIGIN_X = 48;
			const ORIGIN_Y = 265;
			const X_TIP    = 326;  // right end of X axis (arrow tip)
			const Y_TIP    = 28;   // top end of Y axis (arrow tip)
			// Data range [0, 100] mapped so that 100 sits a bit before the arrow tip
			const xToPx = (x) => ORIGIN_X + (x / 100) * (X_TIP - ORIGIN_X - 24);
			const yToPx = (y) => ORIGIN_Y - (y / 100) * (ORIGIN_Y - Y_TIP - 24);

			// arrow marker
			const defs = document.createElementNS(svgNS, "defs");
			const marker = document.createElementNS(svgNS, "marker");
			marker.setAttribute("id", "datasaurus-arrow");
			marker.setAttribute("viewBox", "0 0 10 10");
			marker.setAttribute("refX", "9");
			marker.setAttribute("refY", "5");
			marker.setAttribute("markerWidth", "7");
			marker.setAttribute("markerHeight", "7");
			marker.setAttribute("orient", "auto");
			const arrowPath = document.createElementNS(svgNS, "path");
			arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
			arrowPath.setAttribute("fill", "#444");
			marker.appendChild(arrowPath);
			defs.appendChild(marker);
			svg.appendChild(defs);

			// grid lines every 20 (light), within data range [0, 100]
			const GRID_VALUES = [20, 40, 60, 80, 100];
			GRID_VALUES.forEach(v => {
				const xv = xToPx(v), yv = yToPx(v);
				// vertical grid (x = v)
				const vline = document.createElementNS(svgNS, "line");
				vline.setAttribute("x1", xv); vline.setAttribute("y1", ORIGIN_Y);
				vline.setAttribute("x2", xv); vline.setAttribute("y2", yToPx(100));
				vline.setAttribute("stroke", "#ececec"); vline.setAttribute("stroke-width", 0.8);
				svg.appendChild(vline);
				// horizontal grid (y = v)
				const hline = document.createElementNS(svgNS, "line");
				hline.setAttribute("x1", ORIGIN_X); hline.setAttribute("y1", yv);
				hline.setAttribute("x2", xToPx(100)); hline.setAttribute("y2", yv);
				hline.setAttribute("stroke", "#ececec"); hline.setAttribute("stroke-width", 0.8);
				svg.appendChild(hline);
			});

			// X axis (with arrow)
			const xAxis = document.createElementNS(svgNS, "line");
			xAxis.setAttribute("x1", ORIGIN_X); xAxis.setAttribute("y1", ORIGIN_Y);
			xAxis.setAttribute("x2", X_TIP);    xAxis.setAttribute("y2", ORIGIN_Y);
			xAxis.setAttribute("stroke", "#444"); xAxis.setAttribute("stroke-width", 1.2);
			xAxis.setAttribute("marker-end", "url(#datasaurus-arrow)");
			svg.appendChild(xAxis);

			// Y axis (with arrow)
			const yAxis = document.createElementNS(svgNS, "line");
			yAxis.setAttribute("x1", ORIGIN_X); yAxis.setAttribute("y1", ORIGIN_Y);
			yAxis.setAttribute("x2", ORIGIN_X); yAxis.setAttribute("y2", Y_TIP);
			yAxis.setAttribute("stroke", "#444"); yAxis.setAttribute("stroke-width", 1.2);
			yAxis.setAttribute("marker-end", "url(#datasaurus-arrow)");
			svg.appendChild(yAxis);

			// tick marks at 50, 100 on each axis (with labels)
			const ticks = [50, 100];
			ticks.forEach(v => {
				const xt = xToPx(v);
				const xtLine = document.createElementNS(svgNS, "line");
				xtLine.setAttribute("x1", xt); xtLine.setAttribute("y1", ORIGIN_Y - 3);
				xtLine.setAttribute("x2", xt); xtLine.setAttribute("y2", ORIGIN_Y + 3);
				xtLine.setAttribute("stroke", "#444"); xtLine.setAttribute("stroke-width", 1);
				svg.appendChild(xtLine);
				const yt = yToPx(v);
				const ytLine = document.createElementNS(svgNS, "line");
				ytLine.setAttribute("x1", ORIGIN_X - 3); ytLine.setAttribute("y1", yt);
				ytLine.setAttribute("x2", ORIGIN_X + 3); ytLine.setAttribute("y2", yt);
				ytLine.setAttribute("stroke", "#444"); ytLine.setAttribute("stroke-width", 1);
				svg.appendChild(ytLine);
			});

			// scatter points (original coords, no centering)
			for (let j = 0; j < DINO.length; j += 2) {
				const dot = document.createElementNS(svgNS, "circle");
				dot.setAttribute("cx", xToPx(DINO[j]));
				dot.setAttribute("cy", yToPx(DINO[j+1]));
				dot.setAttribute("r", 2.4);
				dot.setAttribute("fill", "#c25b2a");
				dot.setAttribute("opacity", 0.85);
				svg.appendChild(dot);
			}

			// === Burst speech bubble: change burstDX / burstDY to nudge the whole bubble ===
			const burstDX = -25;
			const burstDY = +10;
			// base polygon vertices (centroid ≈ (87, 196))
			const burstBase = [
				[48,191], [39,175], [60,177], [66,162], [81,174], [93,155],
				[102,175], [138,160], [120,184], [140,194], [123,206], [126,224],
				[106,218], [92,234], [76,216], [54,229], [55,210], [36,205]
			];
			const burstTextBaseX = 90, burstTextBaseY = 200;

			const burst = document.createElementNS(svgNS, "polygon");
			burst.setAttribute("points",
				burstBase.map(([x, y]) => `${x + burstDX},${y + burstDY}`).join(" ")
			);
			burst.setAttribute("fill", "#c25b2a");
			burst.setAttribute("stroke", "#fff");
			burst.setAttribute("stroke-width", "2");
			burst.setAttribute("stroke-linejoin", "round");
			svg.appendChild(burst);

			const burstText = document.createElementNS(svgNS, "text");
			burstText.setAttribute("x", burstTextBaseX + burstDX);
			burstText.setAttribute("y", burstTextBaseY + burstDY);
			burstText.setAttribute("text-anchor", "middle");
			burstText.setAttribute("font-size", "12");
			burstText.setAttribute("font-weight", "bold");
			burstText.setAttribute("fill", "#fff");
			burstText.textContent = "相関なしウス！";
			svg.appendChild(burstText);

			// MathJax labels: X, Y, O, and tick numbers (50, 100)
			makeFO(X_TIP + 12, ORIGIN_Y,        18, 18, "\\(X\\)", "#444", "14px");
			makeFO(ORIGIN_X,   Y_TIP - 12,      18, 18, "\\(Y\\)", "#444", "14px");
			makeFO(ORIGIN_X - 10, ORIGIN_Y + 10, 14, 14, "\\(O\\)", "#444", "12px");
			ticks.forEach(v => {
				makeFO(xToPx(v), ORIGIN_Y + 10, 24, 12, String(v), "#666", "10px");
				makeFO(ORIGIN_X - 14, yToPx(v), 24, 12, String(v), "#666", "10px");
			});

			await typesetSvg(svg);
		})();
