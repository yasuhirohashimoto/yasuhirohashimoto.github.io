(async () => {
			const svg = d3.select("#regression-svg");
			const W = 520, H = 380;
			const margin = { top: 18, right: 18, bottom: 40, left: 44 };
			const innerW = W - margin.left - margin.right;
			const innerH = H - margin.top - margin.bottom;
			const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

			const xDomain = [0, 7];
			const yDomain = [-2, 10];
			const xScale = d3.scaleLinear().domain(xDomain).range([0, innerW]);
			const yScale = d3.scaleLinear().domain(yDomain).range([innerH, 0]);

			g.append("g")
				.attr("transform", `translate(0, ${innerH})`)
				.call(d3.axisBottom(xScale).ticks(7));
			g.append("g").call(d3.axisLeft(yScale).ticks(6));

			texFO(g, innerW / 2, innerH + 24, 28, 20, "\\(x\\)", {
				anchor: "topcenter",
				color: PROB_COLORS.text,
				size: "12px"
			});
			texFO(g, -31, innerH / 2, 28, 20, "\\(y\\)", {
				anchor: "center",
				color: PROB_COLORS.text,
				size: "12px"
			});

			// Layers in z-order: residuals → user line hit area → user line → truth line → datapoints → handles
			const residualGroup = g.append("g").attr("class", "residuals");
			const userLineHit = g.append("line")
				.attr("stroke", "transparent")
				.attr("stroke-width", 14)
				.style("cursor", "grab");
			const userLine = g.append("line")
				.attr("stroke", "#333")
				.attr("stroke-width", 2)
				.style("pointer-events", "none");
			const truthLine = g.append("line")
				.attr("stroke", "#2c8a4a")
				.attr("stroke-width", 2)
				.attr("stroke-dasharray", "6,4")
				.style("display", "none")
				.style("pointer-events", "none");
			const datapointGroup = g.append("g").attr("class", "datapoints");
			const handleGroup = g.append("g").attr("class", "handles");

			// Endpoint handles for slope/rotation control
			const HANDLE_DATA = [
				{ id: "left",  x: xDomain[0] },
				{ id: "right", x: xDomain[1] }
			];
			const handles = handleGroup.selectAll("circle")
				.data(HANDLE_DATA)
				.enter().append("circle")
				.attr("class", "handle")
				.attr("r", 7)
				.attr("fill", "#fff")
				.attr("stroke", "#333")
				.attr("stroke-width", 2)
				.style("cursor", "ns-resize");

			// Range constants and helpers
			const A_MIN = -1.5, A_MAX = 3;
			const B_MIN = -3, B_MAX = 8;
			const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
			const round2 = v => Math.round(v * 100) / 100;

			// DOM handles
			const aSlider = document.getElementById("reg-a");
			const bSlider = document.getElementById("reg-b");
			const aNumber = document.getElementById("reg-a-num");
			const bNumber = document.getElementById("reg-b-num");
			const rssOut = document.getElementById("reg-rss");
			const rerollBtn = document.getElementById("reg-reroll");
			const revealBtn = document.getElementById("reg-reveal");
			const aTrueCell = document.getElementById("reg-a-true-cell");
			const bTrueCell = document.getElementById("reg-b-true-cell");
			const aTrueOut = document.getElementById("reg-a-true");
			const bTrueOut = document.getElementById("reg-b-true");
			const truthRssCell = document.getElementById("reg-truth-rss-cell");
			const rssTrueOut = document.getElementById("reg-rss-true");

			// Box-Muller Gaussian noise
			function gaussian(sigma) {
				const u1 = Math.max(Math.random(), 1e-9);
				const u2 = Math.random();
				return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
			}

			const X_GRID = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];
			const SIGMA_NOISE = 0.5;

			// Data-generation state and least-squares solution
			let aTrue = 1.0, bTrue = 1.5;
			let aFit = 1.0, bFit = 1.5;
			let data = [];
			let truthShown = false;

			function fitLeastSquares() {
				const xBar = d3.mean(data, d => d[0]);
				const yBar = d3.mean(data, d => d[1]);
				const sxx = d3.sum(data, d => (d[0] - xBar) ** 2);
				const sxy = d3.sum(data, d => (d[0] - xBar) * (d[1] - yBar));
				aFit = sxy / sxx;
				bFit = yBar - aFit * xBar;
			}

			function generateData() {
				aTrue = round2(-0.5 + Math.random() * 1.8);
				const yMid = 2.5 + Math.random() * 3.0;
				bTrue = round2(yMid - 3 * aTrue);
				data = X_GRID.map(x => [x, aTrue * x + bTrue + gaussian(SIGMA_NOISE)]);
				fitLeastSquares();
			}

			function renderPoints() {
				const sel = datapointGroup.selectAll("circle.datapoint").data(data);
				sel.exit().remove();
				sel.enter().append("circle")
					.attr("class", "datapoint")
					.attr("r", 5)
					.attr("fill", PROB_COLORS.DC)
					.attr("stroke", "#1f3550")
					.attr("stroke-width", 1)
					.merge(sel)
					.attr("cx", d => xScale(d[0]))
					.attr("cy", d => yScale(d[1]));
			}

			function setA(newA) {
				const v = round2(clamp(newA, A_MIN, A_MAX));
				aSlider.value = v.toFixed(2);
				aNumber.value = v.toFixed(2);
				update();
			}
			function setB(newB) {
				const v = round2(clamp(newB, B_MIN, B_MAX));
				bSlider.value = v.toFixed(2);
				bNumber.value = v.toFixed(2);
				update();
			}
			function setAB(newA, newB) {
				const va = round2(clamp(newA, A_MIN, A_MAX));
				const vb = round2(clamp(newB, B_MIN, B_MAX));
				aSlider.value = va.toFixed(2);
				aNumber.value = va.toFixed(2);
				bSlider.value = vb.toFixed(2);
				bNumber.value = vb.toFixed(2);
				update();
			}

			function hideTruth() {
				truthLine.style("display", "none");
				aTrueCell.style.visibility = "hidden";
				bTrueCell.style.visibility = "hidden";
				truthRssCell.style.visibility = "hidden";
				truthShown = false;
			}

			function showTruth() {
				truthLine
					.style("display", null)
					.attr("x1", xScale(xDomain[0]))
					.attr("y1", yScale(aFit * xDomain[0] + bFit))
					.attr("x2", xScale(xDomain[1]))
					.attr("y2", yScale(aFit * xDomain[1] + bFit));
				aTrueCell.style.visibility = "visible";
				bTrueCell.style.visibility = "visible";
				aTrueOut.textContent = aFit.toFixed(2);
				bTrueOut.textContent = bFit.toFixed(2);
				truthRssCell.style.visibility = "visible";
				const fitRss = d3.sum(data, d => (d[1] - aFit * d[0] - bFit) ** 2);
				rssTrueOut.textContent = fitRss.toFixed(3);
				truthShown = true;
			}

			function update() {
				const a = parseFloat(aSlider.value);
				const b = parseFloat(bSlider.value);

				const y0 = yScale(a * xDomain[0] + b);
				const y1 = yScale(a * xDomain[1] + b);
				userLine.attr("x1", xScale(xDomain[0])).attr("y1", y0)
					.attr("x2", xScale(xDomain[1])).attr("y2", y1);
				userLineHit.attr("x1", xScale(xDomain[0])).attr("y1", y0)
					.attr("x2", xScale(xDomain[1])).attr("y2", y1);

				handles
					.attr("cx", d => xScale(d.x))
					.attr("cy", d => yScale(a * d.x + b));

				const sel = residualGroup.selectAll("line.residual").data(data);
				sel.exit().remove();
				sel.enter().append("line").attr("class", "residual")
					.merge(sel)
					.attr("x1", d => xScale(d[0]))
					.attr("x2", d => xScale(d[0]))
					.attr("y1", d => yScale(d[1]))
					.attr("y2", d => yScale(a * d[0] + b))
					.attr("stroke", PROB_COLORS.D)
					.attr("stroke-width", 1.4)
					.attr("stroke-dasharray", "3,3");

				const rss = d3.sum(data, d => (d[1] - a * d[0] - b) ** 2);
				rssOut.textContent = rss.toFixed(3);
			}

			// === Event wiring ===

			aSlider.addEventListener("input", () => setA(parseFloat(aSlider.value)));
			bSlider.addEventListener("input", () => setB(parseFloat(bSlider.value)));
			aNumber.addEventListener("input", () => {
				const v = parseFloat(aNumber.value);
				if (!Number.isNaN(v)) setA(v);
			});
			bNumber.addEventListener("input", () => {
				const v = parseFloat(bNumber.value);
				if (!Number.isNaN(v)) setB(v);
			});

			// Drag the line body (translates → changes b only)
			userLineHit.call(d3.drag()
				.on("start", function() { d3.select(this).style("cursor", "grabbing"); })
				.on("drag", function(event) {
					const a = parseFloat(aSlider.value);
					const xData = xScale.invert(event.x);
					const yData = yScale.invert(event.y);
					setB(yData - a * xData);
				})
				.on("end", function() { d3.select(this).style("cursor", "grab"); })
			);

			// Drag the endpoint handles (rotates around the other handle)
			handles.call(d3.drag()
				.on("drag", function(event, d) {
					const a = parseFloat(aSlider.value);
					const b = parseFloat(bSlider.value);
					const otherX = d.id === "left" ? xDomain[1] : xDomain[0];
					const otherY = a * otherX + b;
					const thisX = d.x;
					const thisY = yScale.invert(event.y);
					const newA = (otherY - thisY) / (otherX - thisX);
					const newB = thisY - newA * thisX;
					setAB(newA, newB);
				})
			);

			rerollBtn.addEventListener("click", () => {
				generateData();
				renderPoints();
				hideTruth();
				revealBtn.checked = false;
				update();
			});
			revealBtn.addEventListener("change", () => {
				if (revealBtn.checked) showTruth();
				else hideTruth();
			});

			// Init
			generateData();
			renderPoints();
			hideTruth();
			update();
			await typesetSvg(svg);
		})();
