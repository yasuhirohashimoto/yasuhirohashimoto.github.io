(async () => {
	const timelineSvg = d3.select("#os-timeline-diagram");
	const curveSvg = d3.select("#os-curve-diagram");

	const ORANGE = PROB_COLORS.D;
	const BLUE = PROB_COLORS.DC;
	const TEXT = PROB_COLORS.sub;
	const PASS_FILL = PROB_COLORS.line;  // パス区間の人物
	const CAND_FILL = PROB_COLORS.grid;  // パス後の人物

	// ---- 図 1：候補者列のタイムライン模式図 -------------------------------------
	if (!timelineSvg.empty()) {
		const s = 30;      // 正方形の一辺
		const step = 38;   // 正方形の間隔
		const x0 = 45;     // 先頭の x
		const y = 110;     // 正方形の上端
		const N = 20;      // 描く枠の数（最後は省略記号）
		const PASS_END = 6;    // 0..6 がパス区間（m 人）
		const A_INDEX = 14;    // k 番目 = A
		const BEST_INDEX = 3;  // 先頭 k−1 人の 1 位（パス区間内）

		timelineSvg.append("defs").html(`
			<marker id="os-arrow-blue" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="${BLUE}"></path>
			</marker>
			<marker id="os-arrow-orange" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path d="M 0 0 L 10 5 L 0 10 z" fill="${ORANGE}"></path>
			</marker>
		`);

		// 候補者＝人物ピクトグラム（大きめの頭＋丸い体，ベタ塗りの記号調）
		const drawPerson = (cx, topY, fill, opacity) => {
			const rh = 11;                // 頭の半径（大きめ）
			const headCy = topY + rh;     // 頭の中心
			const yb = topY + 31;         // 体の下端
			const wb = 10.5;              // 体の半幅
			const bh = yb - (topY + 16);  // 体の高さ（丸い肩）
			const g = timelineSvg.append("g").attr("fill", fill).attr("opacity", opacity);
			g.append("path")              // 体（丸い肩のドーム）
				.attr("d", `M ${cx - wb} ${yb} A ${wb} ${bh} 0 0 1 ${cx + wb} ${yb} Z`);
			g.append("circle")            // 頭
				.attr("cx", cx).attr("cy", headCy).attr("r", rh);
			return g;
		};

		for (let i = 0; i < N; i++) {
			const x = x0 + i * step;
			if (i === N - 1) {
				timelineSvg.append("text")
					.attr("x", x + s / 2).attr("y", y + s / 2 + 6)
					.attr("text-anchor", "middle").attr("font-size", 20).attr("fill", TEXT)
					.text("…");
				continue;
			}
			const isPass = i <= PASS_END;
			const isA = i === A_INDEX;
			const isAfter = i > A_INDEX;
			drawPerson(
				x + s / 2, y,
				isA ? ORANGE : isPass ? PASS_FILL : CAND_FILL,
				isAfter ? 0.85 : 1
			);
		}

		// A のラベル（人物の下）
		texFO(timelineSvg, x0 + A_INDEX * step + s / 2, y + s + 5, 34, 22, "\\(\\mathcal{A}\\)", { anchor: "topcenter", size: "17px", color: PROB_COLORS.DText });
		texFO(timelineSvg, x0 + A_INDEX * step + s / 2, 52, 150, 22, "\\(k\\,\\) 番目：\\(\\mathcal{A}\\)", { anchor: "topcenter", size: "17px", color: PROB_COLORS.DText });
		timelineSvg.append("path")
			.attr("d", `M${x0 + A_INDEX * step + s / 2} 76 L${x0 + A_INDEX * step + s / 2} ${y - 6}`)
			.attr("fill", "none").attr("stroke", ORANGE).attr("stroke-width", 1.7)
			.attr("marker-end", "url(#os-arrow-orange)");

		// 先頭 k−1 人の 1 位（青丸）
		const bx = x0 + BEST_INDEX * step + s / 2;
		timelineSvg.append("circle")
			.attr("cx", bx).attr("cy", y + s / 2).attr("r", 22)
			.attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 3);
		texFO(timelineSvg, bx, 38, 250, 22, "先頭 \\(\\,k-1\\,\\) 人の中の 1 位", { anchor: "topcenter", size: "17px", color: PROB_COLORS.DCText });
		timelineSvg.append("path")
			.attr("d", `M${bx} 64 L${bx} ${y - 16}`)
			.attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 1.7)
			.attr("marker-end", "url(#os-arrow-blue)");

		// 区間ラベル（下側のブラケット）
		const bracket = (xa, xb, label, w) => {
			const yb = y + s + 14;
			timelineSvg.append("path")
				.attr("d", `M${xa} ${yb} L${xa} ${yb + 8} L${xb} ${yb + 8} L${xb} ${yb}`)
				.attr("fill", "none").attr("stroke", TEXT).attr("stroke-width", 1.2);
			texFO(timelineSvg, (xa + xb) / 2, yb + 14, w, 22, label, { anchor: "topcenter", size: "17px", color: TEXT });
		};
		bracket(x0, x0 + PASS_END * step + s, "パスする \\(\\,m\\,\\) 人", 140);
		bracket(x0 + (PASS_END + 1) * step, x0 + (A_INDEX - 1) * step + s, "\\(m+1\\,\\) 〜 \\(\\,k-1\\,\\) 番目", 170);
	}

	// ---- 図 2：f(p) = −p ln p のグラフ ------------------------------------------
	if (!curveSvg.empty()) {
		const left = 60, right = 535, top = 25, bottom = 275;
		const xScale = p => left + p * (right - left);
		const yScale = f => bottom - (f / 0.4) * (bottom - top);
		const E_INV = Math.exp(-1);

		// 軸
		curveSvg.append("line").attr("x1", left).attr("y1", bottom).attr("x2", right + 10).attr("y2", bottom)
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1.2);
		curveSvg.append("line").attr("x1", left).attr("y1", bottom).attr("x2", left).attr("y2", top - 5)
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1.2);

		// 目盛り
		const tick = (x, label, w = 60) => {
			curveSvg.append("line").attr("x1", x).attr("y1", bottom).attr("x2", x).attr("y2", bottom + 5)
				.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1.2);
			texFO(curveSvg, x, bottom + 8, w, 20, label, { anchor: "topcenter", size: "15px", color: PROB_COLORS.sub });
		};
		tick(xScale(0), "0", 20);
		tick(xScale(E_INV), "\\(e^{-1}\\)", 50);
		tick(xScale(1), "1", 20);
		curveSvg.append("line").attr("x1", left - 5).attr("y1", yScale(E_INV)).attr("x2", left).attr("y2", yScale(E_INV))
			.attr("stroke", PROB_COLORS.line).attr("stroke-width", 1.2);
		texFO(curveSvg, left - 32, yScale(E_INV) - 10, 50, 20, "\\(e^{-1}\\)", { anchor: "topcenter", size: "15px", color: PROB_COLORS.sub });
		texFO(curveSvg, right + 2, bottom + 8, 30, 20, "\\(p\\)", { anchor: "topcenter", size: "14px", color: PROB_COLORS.sub });

		// 曲線
		const pts = [];
		for (let p = 0.0005; p <= 1.0001; p += 0.0025) {
			const q = Math.min(p, 1);
			pts.push([xScale(q), yScale(-q * Math.log(q))]);
		}
		curveSvg.append("path")
			.attr("d", d3.line()(pts))
			.attr("fill", "none").attr("stroke", PROB_COLORS.DC).attr("stroke-width", 2.4)
			.attr("stroke-linecap", "round");

		// 最大値の点と破線
		curveSvg.append("line")
			.attr("x1", xScale(E_INV)).attr("y1", bottom).attr("x2", xScale(E_INV)).attr("y2", yScale(E_INV))
			.attr("stroke", ORANGE).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 5");
		curveSvg.append("line")
			.attr("x1", left).attr("y1", yScale(E_INV)).attr("x2", xScale(E_INV)).attr("y2", yScale(E_INV))
			.attr("stroke", ORANGE).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 5");
		curveSvg.append("circle")
			.attr("cx", xScale(E_INV)).attr("cy", yScale(E_INV)).attr("r", 5).attr("fill", ORANGE);
		texFO(curveSvg, xScale(E_INV) + 8, yScale(E_INV) - 34, 230, 22, "最大値 \\(\\,e^{-1}\\approx 0.368\\)", { anchor: "topleft", size: "14px", color: PROB_COLORS.DText, align: "left" });
		texFO(curveSvg, xScale(0.75), yScale(0.31), 160, 22, "\\(f(p)=-p\\ln p\\)", { anchor: "topcenter", size: "14px", color: PROB_COLORS.text });
	}

	const targets = [timelineSvg, curveSvg].filter(sel => !sel.empty());
	await typesetSvg(targets);
})();
