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

	function fmt(value) {
		return d3.format(".4~f")(value);
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

	const CLT_MEAN_HISTOGRAMS = [
		{
			n: 1,
			xDomain: [0, 1],
			counts: [20004, 20054, 19823, 20037, 20084, 20079, 19978, 19979, 19805, 20050, 19801, 19876, 20058, 20241, 19959, 20089, 19918, 20071, 20102, 19854, 20223, 20034, 19924, 19951, 20070, 20245, 20064, 20146, 19734, 20048, 19961, 20240, 20165, 20028, 19910, 19642, 19826, 19906, 20058, 20077, 20171, 19889, 20030, 20093, 19865, 19791, 20250, 19850, 20113, 19834],
		},
		{
			n: 2,
			xDomain: [0, 1],
			counts: [741, 2397, 4054, 5452, 7115, 8685, 10472, 11970, 13734, 15071, 16743, 18440, 19876, 21583, 23295, 24820, 26148, 28074, 29500, 31345, 33109, 34096, 36152, 37562, 39246, 39474, 37524, 35979, 34353, 32888, 31262, 29396, 28202, 26404, 24988, 23079, 21781, 19963, 18248, 16783, 15253, 13546, 11920, 10444, 8668, 7350, 5595, 4038, 2390, 792],
		},
		{
			n: 3,
			xDomain: [0, 1],
			counts: [41, 242, 675, 1249, 2148, 3211, 4605, 6091, 7935, 9793, 11819, 14252, 17001, 19667, 22784, 25921, 29408, 32742, 36146, 38272, 40644, 42271, 43622, 44840, 45325, 45053, 44661, 43531, 42576, 40409, 38442, 35576, 32722, 29241, 25762, 22721, 19295, 16961, 14386, 11784, 9892, 7875, 6095, 4588, 3300, 2132, 1328, 680, 257, 29],
		},
		{
			n: 10,
			xDomain: [0.13485162832988928, 0.8651483716701107],
			counts: [11, 33, 57, 110, 209, 371, 671, 1078, 1918, 3008, 4418, 6354, 8911, 12041, 16148, 20766, 25793, 31712, 37503, 43575, 49020, 54349, 58359, 61246, 62665, 62476, 61009, 58099, 54438, 49178, 43599, 37789, 31694, 25917, 20685, 16195, 12001, 8664, 6179, 4349, 2915, 1899, 1143, 698, 376, 203, 102, 29, 18, 19],
		},
		{
			n: 100,
			xDomain: [0.3845299461620748, 0.6154700538379252],
			counts: [75, 59, 98, 178, 303, 508, 825, 1313, 1922, 3075, 4322, 6205, 8894, 11665, 15538, 20294, 25552, 31056, 37007, 43301, 49096, 54284, 58792, 61775, 63367, 64010, 61648, 58844, 54471, 49639, 43202, 36956, 31189, 25485, 20320, 15530, 11789, 8781, 6114, 4278, 2961, 2039, 1239, 778, 504, 337, 166, 98, 60, 58],
		},
		{
			n: 1000,
			xDomain: [0.4634851628329889, 0.5365148371670111],
			counts: [64, 59, 104, 202, 296, 542, 775, 1319, 2042, 2934, 4320, 6265, 8636, 11777, 15546, 20145, 25723, 31243, 37244, 43481, 48876, 54377, 58906, 61900, 63309, 63781, 61628, 58682, 54684, 49195, 43557, 37320, 30713, 25251, 20222, 15523, 11708, 8618, 6244, 4368, 3070, 2002, 1324, 812, 476, 304, 217, 102, 53, 61],
		},
	];

	const CLT_M_HISTOGRAMS = [
		{
			m: 100,
			counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 2, 7, 5, 6, 7, 7, 5, 4, 8, 3, 9, 4, 6, 4, 4, 3, 0, 2, 3, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
		},
		{
			m: 1000,
			counts: [0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 4, 5, 8, 11, 16, 26, 27, 24, 39, 55, 46, 59, 70, 54, 73, 62, 61, 56, 52, 46, 54, 26, 21, 21, 22, 15, 16, 6, 7, 8, 1, 4, 0, 2, 0, 0, 0, 0, 0, 0],
		},
		{
			m: 10000,
			counts: [1, 1, 0, 0, 2, 4, 8, 11, 22, 28, 37, 57, 72, 100, 156, 209, 245, 311, 392, 445, 479, 532, 586, 641, 692, 660, 625, 578, 556, 481, 412, 366, 276, 262, 177, 163, 123, 96, 63, 39, 42, 19, 11, 6, 8, 2, 2, 2, 0, 0],
		},
		{
			m: 1000000,
			counts: [42, 52, 93, 199, 300, 491, 802, 1212, 1863, 3011, 4269, 6234, 8704, 11788, 15676, 20220, 25336, 31282, 37214, 43516, 49110, 54570, 59131, 62174, 63274, 63259, 62179, 58778, 54520, 49188, 43230, 37066, 31091, 25246, 20164, 15738, 11777, 8586, 6190, 4255, 2971, 1947, 1309, 808, 451, 304, 188, 95, 37, 60],
		},
	];

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
			texFO(g, 12, 5, 120, 18, opts.titleTex, { color: "#222", size: "13px", align: "left" });
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
					y: sampleSize * binWidth * normalPdf((xValue - opts.normal.mean) / opts.normal.sd) / opts.normal.sd
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
			.call(d3.axisBottom(x).ticks(4).tickSizeOuter(0).tickFormat((d) => {
				const span = xDomain[1] - xDomain[0];
				return span < 0.2 ? d3.format(".3f")(d) : d3.format(".1f")(d);
			}))
			.call((axis) => axis.selectAll("text").attr("font-size", 10));

		if (opts.xLabelTex) {
			texFO(g, (margin.left + width - margin.right) / 2, height - 13, 72, 18, opts.xLabelTex, {
				anchor: "topcenter",
				color: "#333",
				size: "12px"
			});
		}

		g.append("g")
			.attr("transform", `translate(${margin.left},0)`)
			.call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s")))
			.call((axis) => axis.selectAll("text").attr("font-size", 10));
	}

	function drawSumGrid() {
		const svg = d3.select("#clt-sum-grid");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const panelWidth = 416;
		const panelHeight = 190;
		const notes = {
			1: "一様",
			2: "おや？三角？",
			3: "おやおや？",
			10: "正規分布が見えてくる",
			100: "期待値の近くに集中",
			1000: "さらに細く集中．X軸の範囲に注目",
		};
		const panels = CLT_MEAN_HISTOGRAMS.map((panel) => ({
			...panel,
			titleTex: `\\(n = ${panel.n}\\)`,
			note: notes[panel.n],
			normal: panel.n >= 10
		}));

		panels.forEach((panel, i) => {
			const col = i % 2;
			const row = Math.floor(i / 2);
			const x = 16 + col * 440;
			const y = 14 + row * 206;
			const g = svg.append("g").attr("transform", `translate(${x},${y})`);
			const mean = 0.5;
			const sd = Math.sqrt(1 / (12 * panel.n));
			drawHistogramPanel(g, {
				width: panelWidth,
				height: panelHeight,
				counts: panel.counts,
				xDomain: panel.xDomain,
				titleTex: panel.titleTex,
				note: panel.note,
				xLabelTex: "\\(\\bar{X}_n\\)",
				frame: false,
				normal: panel.normal ? { mean, sd } : null
			});
		});

		texFO(svg, 440, 636, 300, 18, "\\(m = 10^6\\), bins\\(\\ = 50\\)", {
			anchor: "topcenter",
			color: "#555",
			size: "14px"
		});
		typesetSvg(svg);
	}

	function drawMGrid() {
		const svg = d3.select("#clt-m-grid");
		if (!svg.node()) return;
		svg.selectAll("*").remove();

		const panelWidth = 416;
		const panelHeight = 190;
		const n = 100;
		const xDomain = [0.3845299461620748, 0.6154700538379252];
		const mean = 0.5;
		const sd = Math.sqrt(1 / (12 * n));

		CLT_M_HISTOGRAMS.forEach((panel, i) => {
			const col = i % 2;
			const row = Math.floor(i / 2);
			const x = 16 + col * 440;
			const y = 14 + row * 206;
			const g = svg.append("g").attr("transform", `translate(${x},${y})`);
			drawHistogramPanel(g, {
				width: panelWidth,
				height: panelHeight,
				counts: panel.counts,
				xDomain,
				titleTex: `\\(m = ${d3.format(",")(panel.m)}\\)`,
				note: "",
				xLabelTex: "\\(\\bar{X}_n\\)",
				frame: false,
				normal: { mean, sd }
			});
		});

		texFO(svg, 440, 430, 160, 18, "\\(n = 100\\), bins\\(\\ = 50\\)", {
			anchor: "topcenter",
			color: "#555",
			size: "14px"
		});
		typesetSvg(svg);
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

	// 雑談セクション：パステル色（オリジナル準拠）
	const N3_COLORS = { red: "#df8077", blue: "#7c91ca", green: "#7cc094" };
	function n3ColorForS(s) {
		return s < 1 ? N3_COLORS.red : (s < 2 ? N3_COLORS.blue : N3_COLORS.green);
	}
	function n3FYofS(s) {
		if (s < 1) return s * s / 2;
		if (s < 2) return -((s - 1.5) ** 2) + 0.75;
		if (s <= 3) return (3 - s) ** 2 / 2;
		return 0;
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
		const yDomain = [-13000, 56000];
		const x = d3.scaleLinear().domain(xDomain).range([margin.left, width - margin.right]);
		const y = d3.scaleLinear().domain(yDomain).range([height - margin.bottom, margin.top]);
		const m = d3.sum(panel.counts);
		const binW = 1 / panel.counts.length;
		const colors = N3_COLORS;

		svg.append("g")
			.attr("fill", "#2c6ea6")
			.attr("fill-opacity", 0.62)
			.selectAll("rect")
			.data(panel.counts.map((length, i) => ({
				x0: i * binW,
				x1: (i + 1) * binW,
				length
			})))
			.join("rect")
			.attr("x", (d) => x(d.x0) + 0.8)
			.attr("width", (d) => Math.max(0, x(d.x1) - x(d.x0) - 1.6))
			.attr("y", (d) => y(d.length))
			.attr("height", (d) => y(0) - y(d.length));

		const clipId = "clt-n3-static-clip";
		const defs = svg.append("defs");
		defs.append("clipPath").attr("id", clipId).append("rect")
			.attr("x", x(xDomain[0]))
			.attr("y", y(yDomain[1]))
			.attr("width", x(xDomain[1]) - x(xDomain[0]))
			.attr("height", y(yDomain[0]) - y(yDomain[1]));

		const densityScale = m * binW;
		const curves = [
			{ color: colors.red,   extent: [-0.08, 0.46], fn: (v) => (27 * v * v / 2) * densityScale },
			{ color: colors.blue,  extent: [0.13, 0.87], fn: (v) => (-27 * ((v - 0.5) ** 2) + 2.25) * densityScale },
			{ color: colors.green, extent: [0.54, 1.08], fn: (v) => (27 * ((1 - v) ** 2) / 2) * densityScale }
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
			.call((axis) => axis.selectAll("text").attr("font-size", 11));
		svg.append("g")
			.attr("transform", `translate(${x(0)},0)`)
			.call(d3.axisLeft(y)
				.tickValues([0, 20000, 40000])
				.tickFormat(d3.format("~s")))
			.call((axis) => axis.selectAll("text").attr("font-size", 11));

		texFO(svg, 12, 8, 90, 18, "\\(n=3\\)", {
			color: "#222",
			size: "12px",
			align: "left"
		});
		texFO(svg, width - 158, 8, 150, 18, "\\(m=10^6,\\ \\mathrm{bins}=50\\)", {
			color: "#555",
			size: "11px",
			align: "right"
		});
		texFO(svg, (x(0) + x(1)) / 2, y(0) + 24, 110, 18, "\\(\\bar{X}_3\\)", {
			anchor: "topcenter",
			color: "#333",
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
		const dm = { top: 52, right: 34, bottom: 66, left: 74 };
		const xDomain = [0, 3];
		const dx = d3.scaleLinear().domain(xDomain).range([dm.left, densW - dm.right]);
		const n3Histogram = CLT_MEAN_HISTOGRAMS.find((panel) => panel.n === 3);
		const histogramCounts = n3Histogram ? n3Histogram.counts : [];
		const m = d3.sum(histogramCounts);
		const numBins = histogramCounts.length;
		const binW = 3 / numBins;
		const fY = (v) => {
			if (v < 1) return v * v / 2;
			if (v < 2) return -((v - 1.5) ** 2) + 0.75;
			if (v <= 3) return (3 - v) ** 2 / 2;
			return 0;
		};
		const yMinFreq = 0;
		const yMaxFreq = 56000;
		const dy = d3.scaleLinear().domain([yMinFreq, yMaxFreq]).range([densH - dm.bottom, dm.top]);
		const densG = svg.append("g");

		// 背景の灰色ヒストグラム棒
		for (let i = 0; i < numBins; i++) {
			const bs = i * binW;
			const freq = histogramCounts[i];
			const bx1 = dx(bs);
			const bx2 = dx(bs + binW);
			densG.append("rect")
				.attr("x", bx1 + 0.3)
				.attr("y", dy(freq))
				.attr("width", Math.max(0, bx2 - bx1 - 0.6))
				.attr("height", dy(0) - dy(freq))
				.attr("fill", "#a8a8a8")
				.attr("fill-opacity", 0.42);
		}

		// 描画領域外の曲線を切り落とすクリップ
		const densClipId = "clt-n3-dens-clip";
		svg.select("defs").remove();
		const defs = svg.append("defs");
		defs.append("clipPath").attr("id", densClipId).append("rect")
			.attr("x", dx(xDomain[0]))
			.attr("y", dy(yMaxFreq))
			.attr("width", dx(xDomain[1]) - dx(xDomain[0]))
			.attr("height", dy(yMinFreq) - dy(yMaxFreq));

		// 3つの放物線を区間ごとに切り貼りして描く
		const curves = [
			{ color: colors.red,   extent: [0, 1], fn: v => (v * v / 2) * m * binW },
			{ color: colors.blue,  extent: [1, 2], fn: v => (-((v - 1.5) ** 2) + 0.75) * m * binW },
			{ color: colors.green, extent: [2, 3], fn: v => ((3 - v) ** 2 / 2) * m * binW }
		];
		const lineGen = d3.line().x(d => dx(d.x)).y(d => dy(d.y));
		curves.forEach(c => {
			const data = d3.range(c.extent[0], c.extent[1] + 0.001, 0.01).map(v => ({ x: v, y: c.fn(v) }));
			densG.append("path")
				.attr("clip-path", `url(#${densClipId})`)
				.datum(data)
				.attr("fill", "none")
				.attr("stroke", c.color)
				.attr("stroke-width", 6.5)
				.attr("stroke-opacity", 0.92)
				.attr("d", lineGen);
		});

		// 軸
		densG.append("g")
			.attr("transform", `translate(0, ${dy(0)})`)
			.call(d3.axisBottom(dx)
				.tickValues([0, 0.5, 1, 1.5, 2, 2.5, 3])
				.tickSizeOuter(0))
			.call((axis) => axis.selectAll("text").attr("font-size", 15));
		densG.append("g")
			.attr("transform", `translate(${dx(0)}, 0)`)
			.call(d3.axisLeft(dy)
				.tickValues([0, 20000, 40000])
				.tickFormat(d3.format("~s")))
			.call((axis) => axis.selectAll("text").attr("font-size", 15));

		// 軸ラベル
		texFO(densG, (dx(0) + dx(3)) / 2, dy(0) + 34, 200, 26, "\\(s=Y_3\\)", {
			anchor: "topcenter",
			color: "#333",
			size: "20px"
		});

		// 放物線の式ラベル
		texFO(densG, dx(0.42), dy(12500), 110, 26, "\\(s^2/2\\)", {
			anchor: "center",
			color: colors.red,
			size: "20px"
		});
		texFO(densG, dx(1.5), dy(49500), 230, 28, "\\(-(s-\\frac{3}{2})^2+\\frac{3}{4}\\)", {
			anchor: "center",
			color: colors.blue,
			size: "20px"
		});
		texFO(densG, dx(2.63), dy(12500), 140, 26, "\\((3-s)^2/2\\)", {
			anchor: "center",
			color: colors.green,
			size: "20px"
		});

		// スライダー連動カーソル（縦線＋点）
		const cursorG = svg.append("g").attr("class", "n3-density-cursor");
		typesetSvg(svg);
		return function updateCursor(s) {
			cursorG.selectAll("*").remove();
			if (s < 0 || s > 3) return;
			const freq = m * fY(s) * binW;
			const col = n3ColorForS(s);
			cursorG.append("line")
				.attr("x1", dx(s)).attr("x2", dx(s))
				.attr("y1", dy(0)).attr("y2", dy(freq))
				.attr("stroke", col)
				.attr("stroke-width", 3.2)
				.attr("stroke-opacity", 0.85);
			cursorG.append("circle")
				.attr("cx", dx(s)).attr("cy", dy(freq)).attr("r", 6)
				.attr("fill", col)
				.attr("stroke", "#fff")
				.attr("stroke-width", 1.5);
		};
	}

	// 対話的な立方体：スライダー x で断面を移動
	function setupN3InteractiveCube(updateDensityCursor) {
		const svg = d3.select("#clt-n3-cube-svg");
		const slider = document.getElementById("clt-n3-slider");
		const xOut = document.getElementById("clt-n3-x-out");
		const sOut = document.getElementById("clt-n3-s-out");
		const areaOut = document.getElementById("clt-n3-area-out");
		const fyOut = document.getElementById("clt-n3-fy-out");
		if (!svg.node() || !slider) return;
		svg.selectAll("*").remove();

		// === 投影パラメータ（_cube_camera_explorer.html で調整した値） ===
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
			.attr("stroke", "#888")
			.attr("stroke-dasharray", "5 4")
			.attr("stroke-width", 1);

		// 立方体ワイヤフレーム（固定）
		svg.append("g")
			.attr("stroke", "#222")
			.attr("stroke-width", 1)
			.attr("fill", "none")
			.selectAll("line")
			.data(edgePairs)
			.join("line")
			.attr("x1", d => project(d[0])[0])
			.attr("y1", d => project(d[0])[1])
			.attr("x2", d => project(d[1])[0])
			.attr("y2", d => project(d[1])[1]);

		// 動的グループ（断面と点 P）
		const dynG = svg.append("g").attr("class", "n3-cube-dynamic");

		const fmt3 = d3.format(".3f");
		const fmtA = d3.format(".4f");

		function update() {
			const x = parseFloat(slider.value);
			const s = 3 * x;
			const col = n3ColorForS(s);
			const fy = n3FYofS(s);
			const area = Math.sqrt(3) * fy;

			xOut.textContent = fmt3(x);
			sOut.textContent = fmt3(s);
			areaOut.textContent = fmtA(area);
			fyOut.textContent = fmt3(fy);

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
				.attr("cx", pProj[0]).attr("cy", pProj[1]).attr("r", 4.5)
				.attr("fill", col)
				.attr("stroke", "#000")
				.attr("stroke-width", 1);

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
		const meanOut = document.getElementById("clt-mean");
		const varOut = document.getElementById("clt-var");
		const seOut = document.getElementById("clt-se");

		if (!svg.node() || !distSelect || !nSelect || !mSelect || !reroll) return;

		const width = 620;
		const height = 283;
		const margin = { top: 18, right: 24, bottom: 58, left: 78 };
		let pending = false;
		let drawVersion = 0;

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

			meanOut.textContent = fmt(dist.mean);
			varOut.textContent = fmt(dist.variance);
			seOut.textContent = fmt(se);

			const loadingTimer = window.setTimeout(() => {
				if (version !== drawVersion) return;
				svg.selectAll("*").remove();
				svg.append("text")
					.attr("x", width / 2)
					.attr("y", height / 2)
					.attr("text-anchor", "middle")
					.attr("font-size", 13)
					.attr("fill", "#59636e")
					.text("計算中...");
			}, 120);

			let bins;
			try {
				bins = await generateSampleMeanHistogramFast(distKey, dist, n, m, xDomain, binsCount);
			} catch (error) {
				window.clearTimeout(loadingTimer);
				if (version !== drawVersion) return;
				const detail = error && error.message ? error.message : gpuHistogramLastError;
				const visibleDetail = detail && detail.length > 96 ? `${detail.slice(0, 93)}...` : detail;
				if (window.console && window.console.warn) {
					window.console.warn("CLT demo rendering failed:", detail, error);
				}
				svg.selectAll("*").remove();
				svg.append("text")
					.attr("x", width / 2)
					.attr("y", height / 2 - 22)
					.attr("text-anchor", "middle")
					.attr("font-size", 13)
					.attr("fill", "#59636e")
					.text("WebGPU計算に失敗しました");
				svg.append("text")
					.attr("x", width / 2)
					.attr("y", height / 2)
					.attr("text-anchor", "middle")
					.attr("font-size", 11)
					.attr("fill", "#7a8490")
					.text(visibleDetail || "原因の詳細はブラウザのコンソールを確認してください");
				svg.append("text")
					.attr("x", width / 2)
					.attr("y", height / 2 + 20)
					.attr("text-anchor", "middle")
					.attr("font-size", 11)
					.attr("fill", "#7a8490")
					.text("n または m を小さくすると CPU で描画できます");
				return;
			}
			window.clearTimeout(loadingTimer);
			if (version !== drawVersion) return;
			svg.selectAll("*").remove();

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

			const curveStep = (xDomain[1] - xDomain[0]) / 180;
			const curveData = d3.range(xDomain[0], xDomain[1] + curveStep * 0.5, curveStep)
				.map((xValue) => ({
					x: xValue,
					y: m * binWidth * normalPdf((xValue - dist.mean) / se) / se
				}));

			svg.append("path")
				.datum(curveData)
				.attr("fill", "none")
				.attr("stroke", "#111")
				.attr("stroke-opacity", 0.62)
				.attr("stroke-width", 2)
				.attr("d", curve);

			svg.append("g")
				.attr("transform", `translate(0,${height - margin.bottom})`)
				.call(d3.axisBottom(x).ticks(9))
				.call((g) => g.selectAll("text").attr("font-size", 10));

			svg.append("g")
				.attr("transform", `translate(${margin.left},0)`)
				.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("~s")))
				.call((g) => g.selectAll("text").attr("font-size", 10));

			texFO(svg, (margin.left + width - margin.right) / 2, height - 33, 280, 30,
				"\\(\\bar{X}_n\\)", {
					anchor: "topcenter",
					color: "#000",
					size: "12px"
				});
			texFO(svg, 20, (margin.top + height - margin.bottom) / 2, 42, 18, "\\(\\text{度数}\\)", {
				anchor: "center",
				color: "#000",
				size: "12px"
			}).attr("transform", `rotate(-90 20 ${(margin.top + height - margin.bottom) / 2})`);

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
			texFO(legend, 18, -12, 120, 18, "\\(\\text{simulation}\\)", {
				color: "#333",
				size: "12px",
				align: "left"
			});
			legend.append("line")
				.attr("x1", 0)
				.attr("x2", 12)
				.attr("y1", 18)
				.attr("y2", 18)
				.attr("stroke", "#111")
				.attr("stroke-opacity", 0.62)
				.attr("stroke-width", 2);
			texFO(legend, 18, 9, 130, 18, "\\(\\mathcal{N}(\\mu_X,\\sigma_X^2/n)\\)", {
				color: "#333",
				size: "12px",
				align: "left"
			});
			typesetSvg(svg);
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
		drawSumGrid();
		drawMGrid();
		drawN3StaticDistribution();
		const updateDensityCursor = drawN3Density();
		setupN3InteractiveCube(updateDensityCursor);
		setupInteractiveDemo();
	});
})();
