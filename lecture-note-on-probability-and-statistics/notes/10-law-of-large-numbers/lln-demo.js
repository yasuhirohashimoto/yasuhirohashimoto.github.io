(async () => {
			const svg = d3.select("#lln-svg");
			const W = 520, H = 340;
			const margin = { top: 16, right: 16, bottom: 36, left: 48 };
			const innerW = W - margin.left - margin.right;
			const innerH = H - margin.top - margin.bottom;
			const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

			const xMax = 10000;
			const target = 0.5;

			const xScale = d3.scaleLog().domain([1, xMax]).range([0, innerW]);
			const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

			// Axes
			const xAxis = d3.axisBottom(xScale).ticks(5, "~s");
			const yAxis = d3.axisLeft(yScale).ticks(5);
			g.append("g")
				.attr("transform", `translate(0, ${innerH})`)
				.call(xAxis);
			g.append("g").call(yAxis);

			// Axis labels
			g.append("text")
				.attr("x", innerW / 2).attr("y", innerH + 30)
				.attr("text-anchor", "middle")
				.attr("font-size", "12px").attr("fill", PROB_COLORS.text)
				.text("サンプルサイズ n (対数軸)");
			g.append("text")
				.attr("transform", `translate(-36, ${innerH / 2}) rotate(-90)`)
				.attr("text-anchor", "middle")
				.attr("font-size", "12px").attr("fill", PROB_COLORS.text)
				.text("累積平均");

			// Target line at 0.5
			g.append("line")
				.attr("x1", 0).attr("x2", innerW)
				.attr("y1", yScale(target)).attr("y2", yScale(target))
				.attr("stroke", PROB_COLORS.D).attr("stroke-width", 2);

			const path = g.append("path")
				.attr("fill", "none")
				.attr("stroke", PROB_COLORS.DC)
				.attr("stroke-width", 1.2);

			function runSimulation() {
				const data = [];
				let sum = 0;
				for (let n = 1; n <= xMax; n++) {
					sum += Math.random();
					data.push([n, sum / n]);
				}
				const line = d3.line()
					.x(d => xScale(d[0]))
					.y(d => yScale(d[1]));
				path.datum(data).attr("d", line);
			}

			runSimulation();
			document.getElementById("lln-reroll").addEventListener("click", runSimulation);
		})();
