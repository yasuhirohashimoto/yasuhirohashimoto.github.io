(function () {
	"use strict";

	const MIXTURE_CENTER = 2;
	const MIXTURE_SD = 0.5;
	const MIXTURE_VARIANCE = MIXTURE_CENTER ** 2 + MIXTURE_SD ** 2;

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
		mixture: {
			mean: 0,
			variance: MIXTURE_VARIANCE,
			sample: () => (Math.random() < 0.5 ? -MIXTURE_CENTER : MIXTURE_CENTER) + MIXTURE_SD * standardNormalSample()
		}
	};

	function normalPdf(x) {
		return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
	}

	let spareNormal = null;
	function standardNormalSample() {
		if (spareNormal !== null) {
			const value = spareNormal;
			spareNormal = null;
			return value;
		}
		let u = 0;
		let v = 0;
		while (u === 0) u = Math.random();
		while (v === 0) v = Math.random();
		const radius = Math.sqrt(-2 * Math.log(u));
		const angle = 2 * Math.PI * v;
		spareNormal = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	}

	function gammaSample(shape) {
		const d = shape - 1 / 3;
		const c = 1 / Math.sqrt(9 * d);
		while (true) {
			let x;
			let v;
			do {
				x = standardNormalSample();
				v = 1 + c * x;
			} while (v <= 0);
			v = v ** 3;
			const u = Math.random();
			if (u < 1 - 0.0331 * x ** 4) return d * v;
			if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
		}
	}

	const binomialCdfCache = new Map();
	function getBinomialCdf(n, p) {
		const key = `${n}:${p}`;
		if (binomialCdfCache.has(key)) return binomialCdfCache.get(key);
		const cdf = new Array(n + 1);
		let prob = (1 - p) ** n;
		let acc = prob;
		cdf[0] = acc;
		for (let k = 1; k <= n; k++) {
			prob *= ((n - k + 1) / k) * (p / (1 - p));
			acc += prob;
			cdf[k] = acc;
		}
		cdf[n] = 1;
		binomialCdfCache.set(key, cdf);
		return cdf;
	}

	function binomialSample(n, p) {
		const cdf = getBinomialCdf(n, p);
		const u = Math.random();
		let lo = 0;
		let hi = cdf.length - 1;
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if (u <= cdf[mid]) hi = mid;
			else lo = mid + 1;
		}
		return lo;
	}

	function sampleMeanDraw(distKey, dist, n) {
		if (distKey === "exponential") {
			return gammaSample(n) / n;
		}
		if (distKey === "mixture") {
			const positiveCount = binomialSample(n, 0.5);
			const signSum = 2 * positiveCount - n;
			const noise = MIXTURE_SD * Math.sqrt(n) * standardNormalSample();
			return (MIXTURE_CENTER * signSum + noise) / n;
		}
		if (distKey === "uniform") {
			let sum = 0;
			for (let i = 0; i < n; i++) sum += Math.random();
			return sum / n;
		}

		let sum = 0;
		for (let i = 0; i < n; i++) sum += dist.sample();
		return sum / n;
	}

	function getSampleMeanDomain(distKey, dist, n) {
		const se = Math.sqrt(dist.variance / n);
		if (distKey === "uniform") {
			if (n <= 5) return [0, 1];
			return [Math.max(0, dist.mean - 4 * se), Math.min(1, dist.mean + 4 * se)];
		}
		if (distKey === "exponential") {
			return [Math.max(0, dist.mean - 4 * se), dist.mean + 4 * se];
		}
		if (distKey === "mixture") {
			const halfWidth = Math.min(MIXTURE_CENTER + 4 * MIXTURE_SD, 4 * se);
			return [dist.mean - halfWidth, dist.mean + halfWidth];
		}
		return [dist.mean - 4 * se, dist.mean + 4 * se];
	}

	function generateSampleMeanHistogram(distKey, dist, n, m, xDomain, binsCount) {
		const counts = new Array(binsCount).fill(0);
		const binWidth = (xDomain[1] - xDomain[0]) / binsCount;
		for (let i = 0; i < m; i++) {
			const value = sampleMeanDraw(distKey, dist, n);
			if (value < xDomain[0] || value > xDomain[1]) continue;
			const index = Math.min(binsCount - 1, Math.floor((value - xDomain[0]) / binWidth));
			counts[index]++;
		}
		return counts.map((length, i) => ({
			x0: xDomain[0] + i * binWidth,
			x1: xDomain[0] + (i + 1) * binWidth,
			length
		}));
	}

	const GPU_DIST_IDS = {
		uniform: 0,
		exponential: 1,
		mixture: 2
	};
	let gpuHistogramPromise = null;
	let gpuHistogramUnavailable = false;
	let gpuHistogramLastError = "";
	const GPU_INIT_TIMEOUT_MS = 10000;
	const GPU_RUN_TIMEOUT_MS = 60000;
	const GPU_CHUNK_SIZE = 65536;
	const GPU_SAMPLE_OPS_PER_CHUNK = 4194304;
	const CPU_WORK_LIMIT = 30000000;

	function countsToBins(counts, xDomain) {
		const binsCount = counts.length;
		const binWidth = (xDomain[1] - xDomain[0]) / binsCount;
		return Array.from(counts, (length, i) => ({
			x0: xDomain[0] + i * binWidth,
			x1: xDomain[0] + (i + 1) * binWidth,
			length
		}));
	}

	function setGpuHistogramError(error, fallback) {
		gpuHistogramLastError = error && error.message ? error.message : fallback;
		if (window.console && window.console.warn) {
			window.console.warn("CLT WebGPU histogram failed:", gpuHistogramLastError, error);
		}
	}

	function withTimeout(promise, ms, message = "GPU computation timed out") {
		return new Promise((resolve, reject) => {
			const timer = window.setTimeout(() => {
				reject(new Error(message));
			}, ms);
			promise.then((value) => {
				window.clearTimeout(timer);
				resolve(value);
			}, (error) => {
				window.clearTimeout(timer);
				reject(error);
			});
		});
	}

	async function getGpuHistogramRunner() {
		if (gpuHistogramUnavailable) return null;
		if (gpuHistogramPromise) return gpuHistogramPromise;
		if (window.isSecureContext === false) {
			gpuHistogramLastError = "WebGPU は HTTPS または localhost などの安全な文脈でのみ利用できます";
			gpuHistogramUnavailable = true;
			return null;
		}
		if (!navigator.gpu) {
			gpuHistogramLastError = "navigator.gpu が利用できません";
			gpuHistogramUnavailable = true;
			return null;
		}

		gpuHistogramPromise = (async () => {
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) {
				gpuHistogramLastError = "WebGPU adapter が見つかりません";
				return null;
			}
			const device = await adapter.requestDevice();
			device.lost.then(() => {
				gpuHistogramLastError = "WebGPU device が失われました";
				gpuHistogramUnavailable = true;
				gpuHistogramPromise = null;
			});

			const shader = device.createShaderModule({
				label: "CLT histogram compute shader",
				code: `
struct Params {
	m: u32,
	n: u32,
	dist: u32,
	binsCount: u32,
	seed: u32,
	sampleOffset: u32,
	_pad1: u32,
	_pad2: u32,
	xMin: f32,
	invBinWidth: f32,
	mixtureCenter: f32,
	mixtureSd: f32,
	mixtureVariance: f32,
	_pad3: f32,
	_pad4: f32,
	_pad5: f32,
}

struct Counts {
	values: array<atomic<u32>>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> counts: Counts;

fn hash32(x: u32) -> u32 {
	var v = x;
	v = v ^ (v >> 16u);
	v = v * 0x7feb352du;
	v = v ^ (v >> 15u);
	v = v * 0x846ca68bu;
	v = v ^ (v >> 16u);
	return v;
}

fn rand01(sample: u32, term: u32, stream: u32) -> f32 {
	let mixed = (sample * 0x9e3779b9u) ^ (term * 0x85ebca6bu) ^ (stream * 0xc2b2ae35u) ^ params.seed;
	let h = hash32(mixed);
	return (f32(h >> 8u) + 0.5) * 0.000000059604644775390625;
}

fn normal01(sample: u32, stream: u32) -> f32 {
	let u1 = max(rand01(sample, 0u, stream), 1.0e-7);
	let u2 = rand01(sample, 1u, stream);
	return sqrt(-2.0 * log(u1)) * cos(6.283185307179586 * u2);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
	let localSample = globalId.x;
	if (localSample >= params.m) {
		return;
	}
	let sample = localSample + params.sampleOffset;

	var value = 0.0;
	if (params.dist == 0u) {
		var sum = 0.0;
		for (var i = 0u; i < params.n; i++) {
			sum += rand01(sample, i, 17u);
		}
		value = sum / f32(params.n);
	} else if (params.dist == 1u) {
		var sum = 0.0;
		for (var i = 0u; i < params.n; i++) {
			let u = rand01(sample, i, 23u);
			sum += -log(max(1.0e-7, 1.0 - u));
		}
		value = sum / f32(params.n);
	} else {
		var positiveCount = 0u;
		for (var i = 0u; i < params.n; i++) {
			if (rand01(sample, i, 31u) < 0.5) {
				positiveCount++;
			}
		}
		let signSum = 2.0 * f32(positiveCount) - f32(params.n);
		let noise = params.mixtureSd * sqrt(f32(params.n)) * normal01(sample, 47u);
		value = (params.mixtureCenter * signSum + noise) / f32(params.n);
	}

	let rawBin = floor((value - params.xMin) * params.invBinWidth);
	if (rawBin >= 0.0 && rawBin < f32(params.binsCount)) {
		atomicAdd(&counts.values[u32(rawBin)], 1u);
	}
}
`
			});

			if (shader.getCompilationInfo) {
				const info = await shader.getCompilationInfo();
				const errors = info.messages.filter((message) => message.type === "error");
				if (errors.length > 0) {
					throw new Error(errors.map((message) => {
						const line = message.lineNum ? `${message.lineNum}:${message.linePos}` : "unknown";
						return `WGSL ${line} ${message.message}`;
					}).join(" / "));
				}
			}

			device.pushErrorScope("validation");
			const pipeline = await device.createComputePipelineAsync({
				label: "CLT histogram compute pipeline",
				layout: "auto",
				compute: {
					module: shader,
					entryPoint: "main"
				}
			});
			const pipelineError = await device.popErrorScope();
			if (pipelineError) {
				throw new Error(pipelineError.message);
			}

			async function run({ distId, n, m, binsCount, xDomain }) {
				const paramBuffer = device.createBuffer({
					size: 64,
					usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
				});
				const countBytes = binsCount * 4;
				const countBuffer = device.createBuffer({
					size: countBytes,
					usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
				});
				const readBuffer = device.createBuffer({
					size: countBytes,
					usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
				});

				const params = new ArrayBuffer(64);
				const view = new DataView(params);
				const binWidth = (xDomain[1] - xDomain[0]) / binsCount;
				const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
				view.setUint32(4, n, true);
				view.setUint32(8, distId, true);
				view.setUint32(12, binsCount, true);
				view.setUint32(16, seed, true);
				view.setFloat32(32, xDomain[0], true);
				view.setFloat32(36, 1 / binWidth, true);
				view.setFloat32(40, MIXTURE_CENTER, true);
				view.setFloat32(44, MIXTURE_SD, true);
				view.setFloat32(48, MIXTURE_VARIANCE, true);

				device.queue.writeBuffer(countBuffer, 0, new Uint32Array(binsCount));

				const bindGroup = device.createBindGroup({
					layout: pipeline.getBindGroupLayout(0),
					entries: [
						{ binding: 0, resource: { buffer: paramBuffer } },
						{ binding: 1, resource: { buffer: countBuffer } }
					]
				});

				try {
					device.pushErrorScope("validation");
					const chunkLimit = Math.max(1024, Math.min(GPU_CHUNK_SIZE, Math.floor(GPU_SAMPLE_OPS_PER_CHUNK / Math.max(1, n))));
					for (let offset = 0; offset < m; offset += chunkLimit) {
						const chunkSize = Math.min(chunkLimit, m - offset);
						view.setUint32(0, chunkSize, true);
						view.setUint32(20, offset, true);
						device.queue.writeBuffer(paramBuffer, 0, params);

						const encoder = device.createCommandEncoder();
						const pass = encoder.beginComputePass();
						pass.setPipeline(pipeline);
						pass.setBindGroup(0, bindGroup);
						pass.dispatchWorkgroups(Math.ceil(chunkSize / 64));
						pass.end();
						device.queue.submit([encoder.finish()]);
					}

					const copyEncoder = device.createCommandEncoder();
					copyEncoder.copyBufferToBuffer(countBuffer, 0, readBuffer, 0, countBytes);
					device.queue.submit([copyEncoder.finish()]);
					const submitError = await device.popErrorScope();
					if (submitError) {
						throw new Error(submitError.message);
					}

					await withTimeout(device.queue.onSubmittedWorkDone(), GPU_RUN_TIMEOUT_MS, "WebGPU の計算が時間内に終わりませんでした");
					await withTimeout(readBuffer.mapAsync(GPUMapMode.READ), GPU_RUN_TIMEOUT_MS, "WebGPU の結果取得が時間内に終わりませんでした");
					const result = new Uint32Array(readBuffer.getMappedRange()).slice();
					readBuffer.unmap();
					return result;
				} finally {
					paramBuffer.destroy();
					countBuffer.destroy();
					readBuffer.destroy();
				}
			}

			return { run };
		})().catch((error) => {
			setGpuHistogramError(error, "WebGPU の初期化に失敗しました");
			gpuHistogramUnavailable = true;
			gpuHistogramPromise = null;
			return null;
		});

		return gpuHistogramPromise;
	}

	async function generateSampleMeanHistogramFast(distKey, dist, n, m, xDomain, binsCount) {
		if (n * m <= CPU_WORK_LIMIT) {
			return generateSampleMeanHistogram(distKey, dist, n, m, xDomain, binsCount);
		}

		const distId = GPU_DIST_IDS[distKey];
		if (distId !== undefined) {
			let runner = null;
			try {
				runner = await withTimeout(getGpuHistogramRunner(), GPU_INIT_TIMEOUT_MS, "WebGPU の初期化が時間内に終わりませんでした");
			} catch (error) {
				setGpuHistogramError(error, "WebGPU の初期化に失敗しました");
				gpuHistogramUnavailable = true;
				gpuHistogramPromise = null;
			}
			if (runner) {
				try {
					const counts = await runner.run({ distId, n, m, binsCount, xDomain });
					return countsToBins(counts, xDomain);
				} catch (error) {
					setGpuHistogramError(error, "WebGPU の計算に失敗しました");
					gpuHistogramUnavailable = true;
					gpuHistogramPromise = null;
				}
			}
		}
		if (distKey === "uniform" && n * m > CPU_WORK_LIMIT) {
			throw new Error(gpuHistogramLastError || "WebGPU is unavailable for this large simulation");
		}
		return generateSampleMeanHistogram(distKey, dist, n, m, xDomain, binsCount);
	}

	// 事前計算ヒストグラム CLT_MEAN_HISTOGRAMS / CLT_M_HISTOGRAMS は
	// clt-demo-data.js（生成条件のコメント付き）で定義される。

	function addPanelFrame(g, width, height) {
		g.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("rx", 4)
			.attr("fill", PROB_COLORS.node)
			.attr("stroke", PROB_COLORS.grid);
	}

	function drawHistogramPanel(g, opts) {
		const width = opts.width;
		const height = opts.height;
		const margin = { top: 32, right: 16, bottom: 32, left: 42 };
		const xDomain = opts.xDomain;
		const counts = opts.counts;
		const values = opts.values || [];
		const binsCount = counts ? counts.length : (opts.binsCount || 36);
		const binWidth = (xDomain[1] - xDomain[0]) / binsCount;
		let bins;
		let sampleSize;

		if (counts) {
			bins = counts.map((length, i) => ({
				x0: xDomain[0] + i * binWidth,
				x1: xDomain[0] + (i + 1) * binWidth,
				length,
			}));
			sampleSize = d3.sum(counts);
		} else {
			const thresholds = d3.range(1, binsCount).map((i) => xDomain[0] + i * binWidth);
			bins = d3.bin().domain(xDomain).thresholds(thresholds)(values);
			sampleSize = values.length;
		}

		if (opts.frame !== false) addPanelFrame(g, width, height);

		const x = d3.scaleLinear()
			.domain(xDomain)
			.range([margin.left, width - margin.right]);

		let normalPeak = 0;
		if (opts.normal) {
			normalPeak = sampleSize * binWidth * normalPdf(0) / opts.normal.sd;
		}

		const maxCount = Math.max(d3.max(bins, (d) => d.length) || 1, normalPeak);
		const y = d3.scaleLinear()
			.domain([0, maxCount])
			.nice()
			.range([height - margin.bottom, margin.top]);

		if (opts.titleTex) {
			texFO(g, 12, 5, 140, 20, opts.titleTex, { color: PROB_COLORS.text, size: "15px", align: "left" }); // .clt-panel-title と同じ実効サイズに
		} else {
			g.append("text")
				.attr("class", "clt-panel-title")
				.attr("x", 12)
				.attr("y", 19)
				.text(opts.title);
		}

		if (opts.note) {
			g.append("text")
				.attr("class", "clt-panel-note")
				.attr("x", width - 12)
				.attr("y", 19)
				.attr("text-anchor", "end")
				.text(opts.note);
		}

		g.append("g")
			.attr("fill", PROB_COLORS.DC)
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
					y: sampleSize * binWidth * normalPdf((xValue - opts.normal.mean) / opts.normal.sd) / opts.normal.sd
				}));

			g.append("path")
				.datum(curveData)
				.attr("fill", "none")
				.attr("stroke", PROB_COLORS.sub)
				.attr("stroke-width", 2)
				.attr("d", curve);
		}

		g.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`)
			.call(d3.axisBottom(x).ticks(4).tickSizeOuter(0).tickFormat((d) => {
				const span = xDomain[1] - xDomain[0];
				return span < 0.2 ? d3.format(".3f")(d) : d3.format(".1f")(d);
			}))
			.call(styleAxis);

		if (opts.xLabelTex) {
			texFO(g, (margin.left + width - margin.right) / 2, height - 13, 72, 18, opts.xLabelTex, {
				anchor: "topcenter",
				color: PROB_COLORS.text,
				size: "12px"
			});
		}

		g.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s")))
			.call(styleAxis);
	}

	// 正規分布の密度式の「読み方 3 ポイント」を注釈した模式図
	function drawNormalSchematic() {
		const svg = d3.select("#clt-normal-schematic");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const width = 720;
		const height = 300;
		const margin = { top: 26, right: 24, bottom: 44, left: 24 };
		const BLUE = PROB_COLORS.DC;
		const ORANGE = PROB_COLORS.D;

		const x = d3.scaleLinear().domain([-4.8, 4.8]).range([margin.left, width - margin.right]);
		const y = d3.scaleLinear().domain([0, 0.44]).range([height - margin.bottom, margin.top]);
		const pdf = (v, s) => Math.exp(-v * v / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
		const samplesOf = (s) => d3.range(-4.8, 4.801, 0.05).map((v) => ({ v, f: pdf(v, s) }));
		const narrow = samplesOf(1);
		const wide = samplesOf(2);

		const areaGen = d3.area().x((d) => x(d.v)).y0(y(0)).y1((d) => y(d.f)).curve(d3.curveMonotoneX);
		const lineGen = d3.line().x((d) => x(d.v)).y((d) => y(d.f)).curve(d3.curveMonotoneX);

		// ③ どちらの山も面積 1（塗りで見せる）
		svg.append("path").datum(wide).attr("fill", ORANGE).attr("fill-opacity", 0.10).attr("d", areaGen);
		svg.append("path").datum(narrow).attr("fill", BLUE).attr("fill-opacity", 0.13).attr("d", areaGen);
		svg.append("path").datum(wide)
			.attr("fill", "none").attr("stroke", ORANGE).attr("stroke-width", 2.2).attr("stroke-opacity", 0.85)
			.attr("d", lineGen);
		svg.append("path").datum(narrow)
			.attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 2.4)
			.attr("d", lineGen);

		// 横軸とスケール目盛（μ±σ, μ±2σ）
		svg.append("line")
			.attr("x1", x(-4.8)).attr("x2", x(4.8)).attr("y1", y(0)).attr("y2", y(0))
			.attr("stroke", PROB_COLORS.line);
		const ticks = [
			[-2, "\\(\\mu-2\\sigma\\)"], [-1, "\\(\\mu-\\sigma\\)"], [0, "\\(\\mu\\)"],
			[1, "\\(\\mu+\\sigma\\)"], [2, "\\(\\mu+2\\sigma\\)"]
		];
		ticks.forEach(([v, label]) => {
			svg.append("line")
				.attr("x1", x(v)).attr("x2", x(v)).attr("y1", y(0)).attr("y2", y(0) + 5)
				.attr("stroke", PROB_COLORS.line);
			texFO(svg, x(v), y(0) + 8, 100, 18, label, { anchor: "topcenter", color: PROB_COLORS.text, size: "13px" });
		});
		texFO(svg, width - margin.right + 4, y(0) - 20, 20, 16, "\\(x\\)", { color: PROB_COLORS.text, size: "12px", align: "left" });

		// ① x=μ で最大・左右対称（頂点への破線）
		svg.append("line")
			.attr("x1", x(0)).attr("x2", x(0)).attr("y1", y(0)).attr("y2", y(pdf(0, 1)))
			.attr("stroke", PROB_COLORS.line).attr("stroke-dasharray", "4 3");
		texFO(svg, x(0), y(pdf(0, 1)) - 24, 260, 18, "① \\(\\,x=\\mu\\,\\) で最大，左右対称", {
			anchor: "topcenter", color: PROB_COLORS.text, size: "12px"
		});

		// ② 幅の目安は σ（μ→μ+σ の両矢印）
		const ay = y(0.22);
		svg.append("line")
			.attr("x1", x(0) + 1).attr("x2", x(1) - 1).attr("y1", ay).attr("y2", ay)
			.attr("stroke", PROB_COLORS.text).attr("stroke-width", 1.5);
		[[x(0) + 1, 1], [x(1) - 1, -1]].forEach(([px, dir]) => {
			svg.append("path")
				.attr("d", `M ${px + 6 * dir} ${ay - 4} L ${px} ${ay} L ${px + 6 * dir} ${ay + 4}`)
				.attr("fill", "none").attr("stroke", PROB_COLORS.text).attr("stroke-width", 1.5);
		});
		texFO(svg, x(1.8), ay - 10, 180, 18, "② 幅の目安は \\(\\,\\sigma\\)", {
			anchor: "topcenter", color: PROB_COLORS.text, size: "12px"
		});
		texFO(svg, x(2.4), y(0.12), 210, 20, "\\(\\sigma\\,\\) が大きいと幅広で低い山に", {
			anchor: "topleft", align: "left", color: ORANGE, size: "13px"
		});

		// ③ 面積は常に 1
		texFO(svg, x(0), y(0.08), 320, 20, "③ 面積（塗りの部分）は常に 1", {
			anchor: "center", color: PROB_COLORS.sub, size: "13px"
		});

		// 凡例
		const legend = svg.append("g")
			.attr("transform", `translate(${width - margin.right - 148},${margin.top + 2})`);
		[[BLUE, "\\(\\mathcal{N}(\\mu,\\ \\sigma^2)\\)", 0], [ORANGE, "\\(\\mathcal{N}(\\mu,\\ (2\\sigma)^2)\\)", 22]].forEach(([color, label, dy]) => {
			legend.append("line")
				.attr("x1", 0).attr("x2", 18).attr("y1", dy).attr("y2", dy)
				.attr("stroke", color).attr("stroke-width", 2.4);
			texFO(legend, 24, dy - 9, 130, 18, label, { color: PROB_COLORS.text, size: "12px", align: "left" });
		});

		typesetSvg(svg);
	}

	// パネルごとに <svg> を生成して CSS grid（.clt-panel-grid）で並べる。
	// キャプションは index.html 側の figcaption に持たせている。
	const GRID_PANEL_WIDTH = 420;
	const GRID_PANEL_HEIGHT = 220;
	// x 軸ラベル（texFO）がパネル下端から数 px はみ出すぶんの余白を viewBox に足す
	const GRID_PANEL_VIEWBOX_HEIGHT = GRID_PANEL_HEIGHT + 12;

	function appendGridPanelSvg(container) {
		return container.append("svg")
			.attr("viewBox", `0 0 ${GRID_PANEL_WIDTH} ${GRID_PANEL_VIEWBOX_HEIGHT}`)
			.attr("aria-hidden", "true");
	}

	function drawSumGrid() {
		const container = d3.select("#clt-sum-grid");
		if (!container.node()) return;
		container.selectAll("*").remove();

		const notes = {
			1: "一様",
			2: "おや？ 三角？",
			3: "おやおや？",
			10: "正規分布が見えてくる",
			100: "期待値の近くに集中",
			1000: "さらに細く集中。横軸の範囲に注目",
		};
		const panels = CLT_MEAN_HISTOGRAMS.map((panel) => ({
			...panel,
			titleTex: `\\(n = ${panel.n}\\)`,
			note: notes[panel.n],
			normal: panel.n >= 10
		}));

		panels.forEach((panel) => {
			const svg = appendGridPanelSvg(container);
			const mean = 0.5;
			const sd = Math.sqrt(1 / (12 * panel.n));
			drawHistogramPanel(svg, {
				width: GRID_PANEL_WIDTH,
				height: GRID_PANEL_HEIGHT,
				counts: panel.counts,
				xDomain: panel.xDomain,
				titleTex: panel.titleTex,
				note: panel.note,
				xLabelTex: "\\(\\bar{X}_n\\)",
				frame: false,
				normal: panel.normal ? { mean, sd } : null
			});
		});

		typesetSvg(container);
	}

	function drawMGrid() {
		const container = d3.select("#clt-m-grid");
		if (!container.node()) return;
		container.selectAll("*").remove();

		const n = 100;
		const xDomain = [0.3845299461620748, 0.6154700538379252];
		const mean = 0.5;
		const sd = Math.sqrt(1 / (12 * n));

		CLT_M_HISTOGRAMS.forEach((panel) => {
			const svg = appendGridPanelSvg(container);
			drawHistogramPanel(svg, {
				width: GRID_PANEL_WIDTH,
				height: GRID_PANEL_HEIGHT,
				counts: panel.counts,
				xDomain,
				titleTex: `\\(m = ${d3.format(",")(panel.m)}\\)`,
				note: "",
				xLabelTex: "\\(\\bar{X}_n\\)",
				frame: false,
				normal: { mean, sd }
			});
		});

		typesetSvg(container);
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

	// 雑談セクション：パステル3色（本文の MathJax \color 指定 index.html と連動。
	// CVD 対応の区分色。TeX で同じ色を使う index.html 側とも同期する。
	const N3_COLORS = { red: PROB_COLORS.n3Red, blue: PROB_COLORS.n3Blue, green: PROB_COLORS.n3Green };
	function n3ColorForS(s) {
		return s < 1 ? N3_COLORS.red : (s < 2 ? N3_COLORS.blue : N3_COLORS.green);
	}
	function n3FYofS(s) {
		if (s < 1) return s * s / 2;
		if (s < 2) return -((s - 1.5) ** 2) + 0.75;
		if (s <= 3) return (3 - s) ** 2 / 2;
		return 0;
	}
	// Y_3 <= s となる確率（＝立方体を x+y+z<=s で切った領域の体積）。dV/ds = n3FYofS(s)。
	function n3VofS(s) {
		if (s <= 0) return 0;
		if (s < 1) return (s ** 3) / 6;
		if (s < 2) return (s ** 3 - 3 * (s - 1) ** 3) / 6;
		if (s <= 3) return 1 - ((3 - s) ** 3) / 6;
		return 1;
	}

	function drawN3StaticDistribution() {
		const svg = d3.select("#clt-n3-static-svg");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const panel = CLT_MEAN_HISTOGRAMS.find((item) => item.n === 3);
		if (!panel) return;

		const width = 416;
		const height = 190;
		const margin = { top: 24, right: 16, bottom: 34, left: 42 };
		const xDomain = [-0.08, 1.08];
		const yDomain = [-0.65, 2.8];
		const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
		const y = d3.scaleLinear().domain(yDomain).range([height - margin.bottom, margin.top]);
		const m = d3.sum(panel.counts);
		const binW = 1 / panel.counts.length;
		const colors = N3_COLORS;

		svg.append("g")
			.attr("fill", PROB_COLORS.DC)
			.attr("fill-opacity", 0.7)
			.selectAll("rect")
			.data(panel.counts.map((length, i) => ({
				x0: i * binW,
				x1: (i + 1) * binW,
				length
			})))
			.join("rect")
			.attr("x", (d) => x(d.x0) + 0.8)
			.attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1.6))
			.attr("y", (d) => y(d.length / (m * binW)))
			.attr("height", (d) => y(0) - y(d.length / (m * binW)));

		const clipId = "clt-n3-static-clip";
		const defs = svg.append("defs");
		defs.append("clipPath").attr("id", clipId).append("rect")
			.attr("x", x(xDomain[0]))
			.attr("y", y(yDomain[1]))
			.attr("width", x(xDomain[1]) - x(xDomain[0]))
			.attr("height", y(yDomain[0]) - y(yDomain[1]));

		const curves = [
			{ color: colors.red,   extent: [-0.08, 0.46], fn: (v) => 27 * v * v / 2 },
			{ color: colors.blue,  extent: [0.13, 0.87], fn: (v) => -27 * ((v - 0.5) ** 2) + 2.25 },
			{ color: colors.green, extent: [0.54, 1.08], fn: (v) => 27 * ((1 - v) ** 2) / 2 }
		];
		const line = d3.line()
			.x((d) => x(d.x))
			.y((d) => y(d.y))
			.curve(d3.curveMonotoneX);
		curves.forEach((curve) => {
			const data = d3.range(curve.extent[0], curve.extent[1] + 0.0001, 0.003)
				.map((value) => ({ x: value, y: curve.fn(value) }));
			svg.append("path")
				.attr("clip-path", `url(#${clipId})`)
				.datum(data)
				.attr("fill", "none")
				.attr("stroke", curve.color)
				.attr("stroke-width", 3)
				.attr("stroke-opacity", 0.88)
				.attr("d", line);
		});

		// この図は width:60%（表示約528px / viewBox 416 = 拡大率≈1.27）なので，
		// styleAxis 既定 13px のままだと実効≈16.5px と大きすぎる。10px に落として実効≈12.7px に
		svg.append("g")
			.attr("transform", `translate(0,${y(0)})`)
			.call(d3.axisBottom(x)
				.tickValues([0, 1 / 3, 1 / 2, 2 / 3, 1])
				.tickFormat((d) => {
					if (Math.abs(d - 1 / 3) < 1e-6) return "1/3";
					if (Math.abs(d - 1 / 2) < 1e-6) return "1/2";
					if (Math.abs(d - 2 / 3) < 1e-6) return "2/3";
					return d3.format(".0f")(d);
				})
				.tickSizeOuter(0))
			.call(styleAxis)
			.call((axis) => axis.selectAll("text").attr("font-size", 10));
		svg.append("g")
			.attr("transform", `translate(${x(0)},0)`)
			.call(d3.axisLeft(y)
				.tickValues([0, 1, 2])
				.tickFormat(d3.format(".0f")))
			.call(styleAxis)
			.call((axis) => axis.selectAll("text").attr("font-size", 10));

		texFO(svg, 34, (margin.top + height - margin.bottom) / 2, 64, 16, "\\(f_{\\bar{X}_3}(x)\\)", {
			anchor: "center",
			color: PROB_COLORS.text,
			size: "11px"
		}).attr("transform", `rotate(-90 34 ${(margin.top + height - margin.bottom) / 2})`);

		texFO(svg, 12, 8, 90, 18, "\\(n=3\\)", {
			color: PROB_COLORS.text,
			size: "12px",
			align: "left"
		});
		texFO(svg, width - 158, 8, 150, 18, "\\(m=10^6,\\ \\mathrm{bins}=50\\)", {
			color: PROB_COLORS.sub,
			size: "11px",
			align: "right"
		});
		texFO(svg, (x(0) + x(1)) / 2, y(0) + 24, 110, 18, "\\(x=\\bar{X}_3\\)", {
			anchor: "topcenter",
			color: PROB_COLORS.text,
			size: "12px"
		});

		typesetSvg(svg);
	}

	// 密度パネルを描画し、スライダー連動カーソルの更新関数を返す
	function drawN3Density() {
		const svg = d3.select("#clt-n3-density-svg");
		if (!svg.node()) return null;
		svg.selectAll("*").remove();

		const colors = N3_COLORS;

		// ===== 密度パネル =====
		const densW = 840;
		const densH = 560;
		const dm = { top: 52, right: 34, bottom: 66, left: 94 };
		const xDomain = [0, 3];
		const dx = d3.scaleLinear().domain(xDomain).range([dm.left, densW - dm.right]);
		const fY = (v) => {
			if (v < 1) return v * v / 2;
			if (v < 2) return -((v - 1.5) ** 2) + 0.75;
			if (v <= 3) return (3 - v) ** 2 / 2;
			return 0;
		};
		const yMin = 0;
		const yMax = 1.0;
		const dy = d3.scaleLinear().domain([yMin, yMax]).range([densH - dm.bottom, dm.top]);
		const densG = svg.append("g");

		// 描画領域外の曲線を切り落とすクリップ
		const densClipId = "clt-n3-dens-clip";
		svg.select("defs").remove();
		const defs = svg.append("defs");
		defs.append("clipPath").attr("id", densClipId).append("rect")
			.attr("x", dx(xDomain[0]))
			.attr("y", dy(yMax))
			.attr("width", dx(xDomain[1]) - dx(xDomain[0]))
			.attr("height", dy(yMin) - dy(yMax));

		// 3つの放物線（＝密度 f_{Y_3}(s)）を区間ごとに切り貼りして描く。
		// 曲線そのものが滑らかな密度なので，下側を同色でベタ塗りして「確率の濃さ」を面で見せる。
		const curves = [
			{ color: colors.red,   extent: [0, 1], fn: v => v * v / 2 },
			{ color: colors.blue,  extent: [1, 2], fn: v => -((v - 1.5) ** 2) + 0.75 },
			{ color: colors.green, extent: [2, 3], fn: v => (3 - v) ** 2 / 2 }
		];
		const areaGen = d3.area().x(d => dx(d.x)).y0(dy(0)).y1(d => dy(d.y));
		const lineGen = d3.line().x(d => dx(d.x)).y(d => dy(d.y));
		curves.forEach(c => {
			const data = d3.range(c.extent[0], c.extent[1] + 0.001, 0.01).map(v => ({ x: v, y: c.fn(v) }));
			densG.append("path")
				.attr("clip-path", `url(#${densClipId})`)
				.datum(data)
				.attr("fill", c.color)
				.attr("fill-opacity", 0.22)
				.attr("stroke", "none")
				.attr("d", areaGen);
			densG.append("path")
				.attr("clip-path", `url(#${densClipId})`)
				.datum(data)
				.attr("fill", "none")
				.attr("stroke", c.color)
				.attr("stroke-width", 4.5)
				.attr("stroke-opacity", 0.95)
				.attr("d", lineGen);
		});

		// 軸（このパネルは「大 viewBox × 大 px」方式なので styleAxis 後に文字サイズだけ上書き）
		densG.append("g")
			.attr("transform", `translate(0, ${dy(0)})`)
			.call(d3.axisBottom(dx)
				.tickValues([0, 0.5, 1, 1.5, 2, 2.5, 3])
				.tickSizeOuter(0))
			.call(styleAxis)
			.call((axis) => axis.selectAll("text").attr("font-size", 21));
		densG.append("g")
			.attr("transform", `translate(${dx(0)}, 0)`)
			.call(d3.axisLeft(dy)
				.tickValues([0, 0.25, 0.5, 0.75, 1])
				.tickFormat(d3.format(".2~f")))
			.call(styleAxis)
			.call((axis) => axis.selectAll("text").attr("font-size", 20));

		// 軸ラベル（このパネルは縮小率≈0.62。x=16 に置くと目盛数値との間に約8px（表示5px）の余白が残る）
		texFO(densG, (dx(0) + dx(3)) / 2, dy(0) + 34, 200, 26, "\\(s=Y_3\\)", {
			anchor: "topcenter",
			color: PROB_COLORS.text,
			size: "21px"
		});
		texFO(densG, 18, (dm.top + densH - dm.bottom) / 2, 120, 26, "\\(f_{Y_3}(s)\\)", {
			anchor: "center",
			color: PROB_COLORS.text,
			size: "21px"
		}).attr("transform", `rotate(-90 18 ${(dm.top + densH - dm.bottom) / 2})`);

		// 放物線の式ラベル（本文数式と色でリンクする主要ラベルなので実効≈15px＝24px 指定）
		texFO(densG, dx(0.42), dy(0.208), 130, 30, "\\(s^2/2\\)", {
			anchor: "center",
			color: colors.red,
			size: "24px"
		});
		texFO(densG, dx(1.5), dy(0.825), 270, 32, "\\(-(s-\\frac{3}{2})^2+\\frac{3}{4}\\)", {
			anchor: "center",
			color: colors.blue,
			size: "24px"
		});
		texFO(densG, dx(2.68), dy(0.208), 165, 30, "\\((3-s)^2/2\\)", {
			anchor: "center",
			color: colors.green,
			size: "24px"
		});

		// スライダー連動カーソル（縦線＋点）
		const cursorG = svg.append("g").attr("class", "n3-density-cursor");
		typesetSvg(svg);
		return function updateCursor(s) {
			cursorG.selectAll("*").remove();
			if (s < 0 || s > 3) return;
			const dens = fY(s);
			const col = n3ColorForS(s);
			cursorG.append("line")
				.attr("x1", dx(s)).attr("x2", dx(s))
				.attr("y1", dy(0)).attr("y2", dy(dens))
				.attr("stroke", col)
				.attr("stroke-width", 3.2)
				.attr("stroke-opacity", 0.85);
			cursorG.append("circle")
				.attr("cx", dx(s)).attr("cy", dy(dens)).attr("r", 8)
				.attr("fill", col)
				.attr("stroke", PROB_COLORS.node)
				.attr("stroke-width", 1.5);
		};
	}

	// 対話的な立方体：スライダー x で断面を移動
	function setupN3InteractiveCube(updateDensityCursor) {
		const svg = d3.select("#clt-n3-cube-svg");
		const slider = document.getElementById("clt-n3-slider");
		const xOut = document.getElementById("clt-n3-x-out");
		const sOut = document.getElementById("clt-n3-s-out");
		const volOut = document.getElementById("clt-n3-vol-out");
		const fyOut = document.getElementById("clt-n3-fy-out");
		const liveOut = document.getElementById("clt-n3-live");
		if (!svg.node() || !slider) return;
		let liveTimer = 0;
		svg.selectAll("*").remove();

		// === 投影パラメータ ===
		// 固定値は調整用ツール tools/_cube_camera_explorer.html（参照画像
		// tools/_cube_reference.png と対で使う）で対話的に決めたもの。
		const camR = 2;
		const camTheta = -30;   // deg
		const camPhi = 30;      // deg
		const rotZ = -86;       // deg
		const rotY = 0;
		const rotX = 0;
		const viewVert = [0, 0, 1];
		const scale = 710;
		const cx = 350, cy = 350;
		const cubeCenter = [0.5, 0.5, 0.5];

		const d2r = Math.PI / 180;
		const eye = [
			cubeCenter[0] + camR * Math.cos(camPhi * d2r) * Math.cos(camTheta * d2r),
			cubeCenter[1] + camR * Math.cos(camPhi * d2r) * Math.sin(camTheta * d2r),
			cubeCenter[2] + camR * Math.sin(camPhi * d2r)
		];
		const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
		const dot3 = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
		const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
		const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };
		const fwd = norm3(sub(cubeCenter, eye));
		const vv = norm3(viewVert);
		const pf = dot3(vv, fwd);
		const upVec = norm3(sub(vv, [pf*fwd[0], pf*fwd[1], pf*fwd[2]]));
		const rightVec = norm3(cross3(fwd, upVec));

		// 立方体中心まわりの回転 Z→Y→X
		const cosRZ = Math.cos(rotZ*d2r), sinRZ = Math.sin(rotZ*d2r);
		const cosRY = Math.cos(rotY*d2r), sinRY = Math.sin(rotY*d2r);
		const cosRX = Math.cos(rotX*d2r), sinRX = Math.sin(rotX*d2r);
		function rotate(p) {
			let x = p[0] - cubeCenter[0];
			let y = p[1] - cubeCenter[1];
			let z = p[2] - cubeCenter[2];
			[x, y] = [x*cosRZ - y*sinRZ, x*sinRZ + y*cosRZ];
			[x, z] = [x*cosRY + z*sinRY, -x*sinRY + z*cosRY];
			[y, z] = [y*cosRX - z*sinRX, y*sinRX + z*cosRX];
			return [x + cubeCenter[0], y + cubeCenter[1], z + cubeCenter[2]];
		}
		function project(p) {
			const r = rotate(p);
			const we = [r[0]-eye[0], r[1]-eye[1], r[2]-eye[2]];
			const vsx = dot3(rightVec, we);
			const vsy = dot3(upVec, we);
			const vsz = dot3(fwd, we);
			return [cx + (vsx/vsz)*scale, cy - (vsy/vsz)*scale];
		}

		// 立方体の頂点と辺
		const vertices = [];
		for (let xi = 0; xi < 2; xi++)
			for (let yi = 0; yi < 2; yi++)
				for (let zi = 0; zi < 2; zi++)
					vertices.push([xi, yi, zi]);
		const edgePairs = [];
		for (let i = 0; i < vertices.length; i++) {
			for (let j = i + 1; j < vertices.length; j++) {
				const diff = vertices[i].filter((v, k) => v !== vertices[j][k]).length;
				if (diff === 1) edgePairs.push([vertices[i], vertices[j]]);
			}
		}

		// 対角線 (0,0,0)↔(1,1,1)（破線、固定）
		const diagA = project([0, 0, 0]);
		const diagB = project([1, 1, 1]);
		svg.append("line")
			.attr("x1", diagA[0]).attr("y1", diagA[1])
			.attr("x2", diagB[0]).attr("y2", diagB[1])
			.attr("stroke", PROB_COLORS.sub)
			.attr("stroke-dasharray", "5 4")
			.attr("stroke-width", 1);

		// 立方体ワイヤフレーム（固定）。
		// 一番奥の頂点 (0,0,0) に接する 3 辺は破線にして奥行きを表す
		const isOrigin = (v) => v[0] === 0 && v[1] === 0 && v[2] === 0;
		svg.append("g")
			.attr("stroke", PROB_COLORS.line)
			.attr("stroke-width", 1)
			.attr("stroke-dasharray", "4 3")
			.attr("fill", "none")
			.selectAll("line")
			.data(edgePairs.filter(([a, b]) => isOrigin(a) || isOrigin(b)))
			.join("line")
			.attr("x1", d => project(d[0])[0])
			.attr("y1", d => project(d[0])[1])
			.attr("x2", d => project(d[1])[0])
			.attr("y2", d => project(d[1])[1]);
		svg.append("g")
			.attr("stroke", PROB_COLORS.text)
			.attr("stroke-width", 1)
			.attr("fill", "none")
			.selectAll("line")
			.data(edgePairs.filter(([a, b]) => !isOrigin(a) && !isOrigin(b)))
			.join("line")
			.attr("x1", d => project(d[0])[0])
			.attr("y1", d => project(d[0])[1])
			.attr("x2", d => project(d[1])[0])
			.attr("y2", d => project(d[1])[1]);

		// 動的グループ（断面と点 P）
		const dynG = svg.append("g").attr("class", "n3-cube-dynamic");

		// 対角線両端の頂点ラベル（断面ポリゴンより手前に置く。
		// 22px は表示縮小後に約 11px となるサイズ）
		const labelG = svg.append("g")
			.attr("font-size", 22)
			.attr("fill", PROB_COLORS.sub);
		labelG.append("text")
			.attr("x", diagA[0] + 14)
			.attr("y", diagA[1] - 12)
			.text("(0,0,0)");
		labelG.append("text")
			.attr("x", diagB[0] - 16)
			.attr("y", diagB[1] + 26)
			.attr("text-anchor", "end")
			.text("(1,1,1)");

		const fmt3 = d3.format(".3f");
		const fmtV = d3.format(".4f");

		function update() {
			const x = parseFloat(slider.value);
			const s = 3 * x;
			const col = n3ColorForS(s);
			const fy = n3FYofS(s);
			const vol = n3VofS(s);

			xOut.textContent = fmt3(x);
			sOut.textContent = fmt3(s);
			volOut.textContent = fmtV(vol);
			fyOut.textContent = fmt3(fy);
			slider.setAttribute("aria-valuetext", fmt3(x));
			if (liveOut) {
				window.clearTimeout(liveTimer);
				liveTimer = window.setTimeout(() => {
					liveOut.textContent = `x は ${fmt3(x)}，和 s は ${fmt3(s)}，体積は ${fmtV(vol)}，確率密度は ${fmt3(fy)}`;
				}, 600);
			}

			dynG.selectAll("*").remove();

			// 断面ポリゴン
			const polyPts = cubeSection(s).map(project);
			if (polyPts.length >= 3) {
				dynG.append("polygon")
					.attr("points", polyPts.map(p => p.join(",")).join(" "))
					.attr("fill", col)
					.attr("fill-opacity", 0.45)
					.attr("stroke", col)
					.attr("stroke-width", 1.5)
					.attr("stroke-opacity", 0.9);
			}

			// 点 P=(x,x,x)
			const pProj = project([x, x, x]);
			dynG.append("circle")
				.attr("cx", pProj[0]).attr("cy", pProj[1]).attr("r", 7)
				.attr("fill", col)
				.attr("stroke", PROB_COLORS.node)
				.attr("stroke-width", 1.5);

			if (updateDensityCursor) updateDensityCursor(s);
		}

		slider.addEventListener("input", update);
		update();
	}

	function setupInteractiveDemo() {
		const svg = d3.select("#clt-svg");
		const distSelect = document.getElementById("clt-dist");
		const nSelect = document.getElementById("clt-n");
		const mSelect = document.getElementById("clt-m");
		const reroll = document.getElementById("clt-reroll");
		const liveOut = document.getElementById("clt-live");

		if (!svg.node() || !distSelect || !nSelect || !mSelect || !reroll) return;

		const width = 620;
		const height = 283;
		const margin = { top: 18, right: 24, bottom: 58, left: 78 };
		let pending = false;
		let drawVersion = 0;

		// 軸ラベル・凡例などの静的部分は初期化時に 1 度だけ構築し，
		// draw() では棒・曲線・軸だけを更新する（texFO 再生成によるチラつきを防ぐ）
		const chartG = svg.append("g");
		const barsG = chartG.append("g")
			.attr("fill", PROB_COLORS.DC)
			.attr("fill-opacity", 0.78);
		const curvePath = chartG.append("path")
			.attr("fill", "none")
			.attr("stroke", PROB_COLORS.sub)
			.attr("stroke-opacity", 0.62)
			.attr("stroke-width", 2);
		const xAxisG = chartG.append("g")
			.attr("transform", `translate(0,${height - margin.bottom})`);
		const yAxisG = chartG.append("g")
			.attr("transform", `translate(${margin.left},0)`);

		texFO(chartG, (margin.left + width - margin.right) / 2, height - 33, 280, 30,
			"\\(\\bar{X}_n\\)", {
				anchor: "topcenter",
				color: PROB_COLORS.text,
				size: "12px"
			});
		texFO(chartG, 20, (margin.top + height - margin.bottom) / 2, 42, 18, "\\(\\text{度数}\\)", {
			anchor: "center",
			color: PROB_COLORS.text,
			size: "12px"
		}).attr("transform", `rotate(-90 20 ${(margin.top + height - margin.bottom) / 2})`);

		const legend = chartG.append("g")
			.attr("transform", `translate(${width - margin.right - 138},${margin.top + 6})`)
			.attr("font-size", 12);

		// 凡例の背景（高い棒と重なっても読めるように敷く）
		legend.append("rect")
			.attr("x", -8)
			.attr("y", -16)
			.attr("width", 152)
			.attr("height", 48)
			.attr("fill", "var(--bg)")
			.attr("fill-opacity", 0.85);
		legend.append("rect")
			.attr("x", 0)
			.attr("y", -9)
			.attr("width", 12)
			.attr("height", 12)
			.attr("fill", PROB_COLORS.DC)
			.attr("fill-opacity", 0.78);
		texFO(legend, 18, -12, 120, 18, "シミュレーション", {
			color: PROB_COLORS.text,
			size: "12px",
			align: "left"
		});
		legend.append("line")
			.attr("x1", 0)
			.attr("x2", 12)
			.attr("y1", 18)
			.attr("y2", 18)
			.attr("stroke", PROB_COLORS.sub)
			.attr("stroke-opacity", 0.62)
			.attr("stroke-width", 2);
		texFO(legend, 18, 9, 130, 18, "\\(\\mathcal{N}(\\mu_X,\\sigma_X^2/n)\\)", {
			color: PROB_COLORS.text,
			size: "12px",
			align: "left"
		});

		// 計算中・エラー表示用のグループ
		const msgG = svg.append("g");
		typesetSvg(svg);

		function addMessage(text, dy, size, fill) {
			msgG.append("text")
				.attr("x", width / 2)
				.attr("y", height / 2 + dy)
				.attr("text-anchor", "middle")
				.attr("font-size", size)
				.attr("fill", fill)
				.text(text);
		}

		function announceResult(message) {
			if (!liveOut) return;
			liveOut.textContent = "";
			window.setTimeout(() => {
				liveOut.textContent = message;
			}, 0);
		}

		async function draw() {
			const version = ++drawVersion;
			pending = false;
			const distKey = distSelect.value;
			const dist = distributions[distKey];
			const n = Number(nSelect.value);
			const m = Number(mSelect.value);
			const binsCount = 100;
			const xDomain = getSampleMeanDomain(distKey, dist, n);
			const se = Math.sqrt(dist.variance / n);

			const loadingTimer = window.setTimeout(() => {
				if (version !== drawVersion) return;
				chartG.attr("opacity", 0.35);
				msgG.selectAll("*").remove();
				addMessage("計算中……", 0, 13, PROB_COLORS.sub);
				announceResult("シミュレーションを計算中です");
			}, 120);

			let bins;
			try {
				bins = await generateSampleMeanHistogramFast(distKey, dist, n, m, xDomain, binsCount);
			} catch (error) {
				window.clearTimeout(loadingTimer);
				if (version !== drawVersion) return;
				const detail = error && error.message ? error.message : gpuHistogramLastError;
				const visibleDetail = detail && detail.length > 96 ? `${detail.slice(0, 92)}……` : detail;
				if (window.console && window.console.warn) {
					window.console.warn("CLT demo rendering failed:", detail, error);
				}
				chartG.attr("display", "none");
				msgG.selectAll("*").remove();
				addMessage("WebGPU の計算に失敗しました", -22, 13, PROB_COLORS.sub);
				addMessage(visibleDetail || "原因の詳細はブラウザのコンソールを確認してください", 0, 11, PROB_COLORS.sub);
				addMessage("n または m を小さくすると CPU で描画できます", 20, 11, PROB_COLORS.sub);
				announceResult("シミュレーションの計算に失敗しました。n または m を小さくしてください");
				return;
			}
			window.clearTimeout(loadingTimer);
			if (version !== drawVersion) return;
			msgG.selectAll("*").remove();
			chartG.attr("display", null).attr("opacity", null);

			const x = d3.scaleLinear()
				.domain(xDomain)
				.range([margin.left, width - margin.right]);

			const binWidth = bins[0].x1 - bins[0].x0;
			const normalPeak = m * binWidth * normalPdf(0) / se;
			const maxCount = Math.max(d3.max(bins, (d) => d.length) || 1, normalPeak);

			const y = d3.scaleLinear()
				.domain([0, maxCount])
				.nice()
				.range([height - margin.bottom, margin.top]);

			barsG.selectAll("rect")
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

			const curveStep = (xDomain[1] - xDomain[0]) / 180;
			const curveData = d3.range(xDomain[0], xDomain[1] + curveStep * 0.5, curveStep)
				.map((xValue) => ({
					x: xValue,
					y: m * binWidth * normalPdf((xValue - dist.mean) / se) / se
				}));

			curvePath.datum(curveData).attr("d", curve);

			// 軸はスケールが変わるたびに再描画されるので styleAxis も毎回かけ直す
			xAxisG.call(d3.axisBottom(x).ticks(9)).call(styleAxis);
			yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("~s"))).call(styleAxis);
			announceResult(`${distSelect.selectedOptions[0].textContent}，サンプルサイズ n は ${n.toLocaleString("ja-JP")}，サンプル数 m は ${m.toLocaleString("ja-JP")} のシミュレーションを更新しました`);
		}

		function schedule() {
			if (pending) return;
			pending = true;
			window.requestAnimationFrame(() => {
				void draw();
			});
		}

		distSelect.addEventListener("change", schedule);
		nSelect.addEventListener("change", schedule);
		mSelect.addEventListener("change", schedule);
		reroll.addEventListener("click", () => {
			void draw();
		});
		void draw();
	}

	document.addEventListener("DOMContentLoaded", () => {
		drawNormalSchematic();
		drawSumGrid();
		drawMGrid();
		drawN3StaticDistribution();
		const updateDensityCursor = drawN3Density();
		setupN3InteractiveCube(updateDensityCursor);
		setupInteractiveDemo();
	});
})();
