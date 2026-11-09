// 音频链路：128 band 输入 -> 512 上采样 -> 8 频段 + 6 个音色度量 -> Auto Beat 触发。
// 度量与触发逻辑逐行对应原壁纸打包产物中的 tG / uC 两个类；差异只在「128 band 从哪来」：
// Wallpaper Engine 由宿主投喂已归一化的分频响度，浏览器里改为 WebAudio 分析器 + 全局 AGC。

const BAND_COUNT = 128;
const DATA_LEN = 512;
const FMAX = 16000; // WE 的 128 band 覆盖 0..16kHz；分频范围与前 64 个 band 对应

// 原包 uC 的默认构造值；属性面板会在启动时覆盖为 project.json 的默认值。
class FreqTrigger {
	constructor(action) {
		this.action = action;
		this.enabled = true;
		this.mode = "Auto Beat";
		this.freqIndex = -1;
		this.threshold = 0.5;
		this.sensitivity = 0.15;
		this.cooldown = 60;
		this.bandStart = 0;
		this.bandEnd = 16;
		this.pulseStrength = 0.2;
		this.currentCooldown = 0;
		this.beatHold = 0;
		this.lastEvalEnergy = 0;
		this.lastEvalThresh = 0;
		this.fluxHistory = new Array(40).fill(0);
		this.fluxHistoryIndex = 0;
		this.smoothedFlux = 0;
		this.prevSmoothedFlux = 0;
		if (action === "Pulse") {
			this.bandStart = 0;
			this.bandEnd = 12;
			this.sensitivity = 0.22;
			this.cooldown = 45;
			this.pulseStrength = 0.25;
		} else if (action === "Meteor") {
			this.bandStart = 92;
			this.bandEnd = 340;
			this.sensitivity = 0.4;
			this.cooldown = 180;
			this.pulseStrength = 0.5;
		}
	}

	getTriggerRange() {
		if (this.mode === "Auto Beat") return [this.bandStart, this.bandEnd];
		const e = this.freqIndex >= 0 ? this.freqIndex : Math.floor(0.2 * 512);
		return [Math.max(0, e - 2), Math.min(511, e + 2)];
	}
}

export class AudioEngine {
	constructor() {
		this.ctx = null;
		this.analyser = null;
		this.byteData = null;
		this.sourceNode = null;
		this.stream = null;
		this.audioEl = null;
		this.audioUrl = null;
		this.mode = "silence"; // silence | demo | external | analyser
		this.label = "静音";
		this.hasAudioSource = true; // WE 始终投喂数据；这里从「静音源」开始，使空闲波浪可用
		this.isPlaying = false;

		this.bands = new Float32Array(BAND_COUNT);
		this.wallpaperAudioData = new Float32Array(DATA_LEN);
		this.prevData = new Float32Array(DATA_LEN);

		this.pulseTrigger = new FreqTrigger("Pulse");
		this.meteorTrigger = new FreqTrigger("Meteor");

		this.smoothedData = {
			bass: 0, mid: 0, treble: 0, energy: 0,
			subBass: 0, lowMid: 0, highMid: 0,
			presence: 0, brilliance: 0, air: 0,
			warmth: 0, brightness: 0, sharpness: 0,
			smoothness: 0, density: 0, spectralCentroid: 0,
		};
		this.prevBrightness = 0;

		this.lastActiveTime = 0;
		this.lastIdleTime = 0;
		this.idleEnergyThreshold = 0.02;
		this.currentIdleIntensity = 0;
		this.debounceDuration = 1;
		this.idleFadeOutDuration = 1;
		this.idleStartTime = 0;

		this.onFreqTrigger = null;
		this.onMedia = null;
		this.media = {
			title: "", artist: "", thumbnail: "", isPlaying: false, position: 0, duration: 0,
		};

		// 调试/对拍口：读取本帧各频段与度量
		this.lastBands = new Float32Array(BAND_COUNT);
	}

	// ---------- 输入源 ----------

	async _ensureCtx() {
		if (!this.ctx) {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			this.ctx = new Ctx();
			// WE 的 128 值是「左 64 + 右 64」，每声道 64 段覆盖 0..16kHz 线性分频，
			// 0..1 对应 48dB 动态范围（-48dB..0dB）。这里逐项对齐：
			const mk = () => {
				const a = this.ctx.createAnalyser();
				a.fftSize = 2048;
				a.smoothingTimeConstant = 0; // WE 不做时间平滑，交给壁纸自己的 1ms 包络
				a.minDecibels = -48;
				a.maxDecibels = 0;
				return a;
			};
			this.analyserL = mk();
			this.analyserR = mk();
			this.analyser = this.analyserL; // 兼容旧字段
			this.splitter = this.ctx.createChannelSplitter(2);
			this.splitter.connect(this.analyserL, 0);
			this.splitter.connect(this.analyserR, 1);
			// getFloatFrequencyData 是 dBFS；WebAudio 的窗函数会让单音读数比真实值低约 14dB，
			// WE 的 48dB 刻度没有这部分损失，故补偿后再映射到 0..1。
			this.floatL = new Float32Array(this.analyserL.frequencyBinCount);
			this.floatR = new Float32Array(this.analyserR.frequencyBinCount);
			this.byteData = this.floatL;
		}
		if (this.ctx.state === "suspended") {
			try { await this.ctx.resume(); } catch { /* 需要用户激活 */ }
		}
		return this.ctx;
	}

	_connectAnalysers(node) {
		const ch = node.channelCount || 2;
		if (ch === 1) {
			// 单声道（麦克风）：直接复制到左右两个分析器，避免右声道恒 0。
			node.connect(this.analyserL);
			node.connect(this.analyserR);
		} else {
			node.connect(this.splitter);
		}
	}

	_disconnectSource() {
		if (this._mediaTimer) { clearTimeout(this._mediaTimer); this._mediaTimer = 0; }
		if (this.sourceNode) {
			try { this.sourceNode.disconnect(); } catch { /* noop */ }
			this.sourceNode = null;
		}
		if (this.stream) {
			for (const t of this.stream.getTracks()) t.stop();
			this.stream = null;
		}
		if (this.audioEl) {
			try { this.audioEl.pause(); } catch { /* noop */ }
			this.audioEl.src = "";
			this.audioEl = null;
		}
		if (this.audioUrl) {
			URL.revokeObjectURL(this.audioUrl);
			this.audioUrl = null;
		}
	}

	_disconnectAnalyser() {
		// splitter→analyser 是固定接线，不能随源切换拆掉；只重建一次，防止重复连接。
		if (!this.splitter || !this.analyserL) return;
		try { this.splitter.disconnect(); } catch { /* noop */ }
		this.splitter.connect(this.analyserL, 0);
		this.splitter.connect(this.analyserR, 1);
	}

	async useSystemAudio() {
		this._disconnectSource();
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: true,
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
			},
		});
		const audioTracks = stream.getAudioTracks();
		if (!audioTracks.length) {
			for (const t of stream.getTracks()) t.stop();
			throw new Error("未捕获到系统音频，请在共享窗口时勾选「分享音频」");
		}
		// 视频轨只用于满足浏览器采集约束，随即关闭，避免额外解码。
		for (const t of stream.getVideoTracks()) t.stop();
		stream.addEventListener("inactive", () => {
			if (this.stream === stream) this.useSilence();
		});
		const ctx = await this._ensureCtx();
		this.sourceNode = ctx.createMediaStreamSource(stream);
		this._disconnectAnalyser();
		this._connectAnalysers(this.sourceNode);
		this.stream = stream;
		this.mode = "analyser";
		this.label = "系统音频";
		this._clearMedia("");
		this.onSource?.("system");
	}

	async useMic() {
		this._disconnectSource();
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
		});
		const ctx = await this._ensureCtx();
		this.sourceNode = ctx.createMediaStreamSource(stream);
		this._disconnectAnalyser();
		// 麦克风通常是单声道，直接双接，避免 splitter 右声道恒 0。
		this.sourceNode.connect(this.analyserL);
		this.sourceNode.connect(this.analyserR);
		this.stream = stream;
		this.mode = "analyser";
		this.label = "麦克风";
		this._clearMedia("");
		this.onSource?.("mic");
	}

	async useFile(file) {
		this._disconnectSource();
		const ctx = await this._ensureCtx();
		const url = URL.createObjectURL(file);
		const el = new Audio();
		el.src = url;
		el.loop = false;
		el.crossOrigin = "anonymous";
		this.audioUrl = url;
		this.audioEl = el;

		const src = ctx.createMediaElementSource(el);
		this._disconnectAnalyser();
		this._connectAnalysers(src);
		src.connect(ctx.destination); // 本地文件需要能听见
		this.sourceNode = src;
		this.mode = "analyser";
		this.label = "本地音频";

		el.addEventListener("play", () => { this.isPlaying = true; this._pushMedia({ isPlaying: true }); });
		el.addEventListener("pause", () => { this.isPlaying = false; this._pushMedia({ isPlaying: false }); });
		el.addEventListener("ended", () => { this.isPlaying = false; this._pushMedia({ isPlaying: false }); });
		el.addEventListener("loadedmetadata", () => {
			this._pushMedia({ duration: Number.isFinite(el.duration) ? el.duration : 0 });
		});
		const tick = () => {
			if (this.audioEl !== el) return;
			this._pushMedia({
				position: el.currentTime || 0,
				duration: Number.isFinite(el.duration) ? el.duration : 0,
			});
			this._mediaTimer = setTimeout(tick, 200);
		};
		this._mediaTimer && clearTimeout(this._mediaTimer);
		tick();

		const meta = await readMetadata(file);
		this._clearMedia("");
		this.media = {
			title: meta.title || file.name.replace(/\.[^.]+$/, ""),
			artist: meta.artist || "本地文件",
			thumbnail: meta.cover || "",
			isPlaying: false,
			position: 0,
			duration: Number.isFinite(el.duration) ? el.duration : 0,
		};
		this._emitMedia();
		await el.play().catch(() => { /* 自动播放策略：保留暂停态 */ });
		this.onSource?.("file");
	}

	useDemo(t0) {
		this._disconnectSource();
		this.mode = "demo";
		this.label = "演示信号";
		this.isPlaying = true;
		this._demoStart = Number.isFinite(t0) ? t0 : performance.now() / 1000;
		this.media = {
			title: "Sonic Topography",
			artist: "Demo Signal · 128 BIN",
			thumbnail: demoCover(),
			isPlaying: true,
			position: 0,
			duration: 240,
		};
		this._emitMedia();
		this.onSource?.("demo");
	}

	// 直接消费 Wallpaper Engine 宿主的 128 band（0..1），跳过浏览器分析器。
	// 这是唯一一条与本体完全同源的输入路径。
	useHostBands(bands) {
		if (this.mode !== "host") {
			this._disconnectSource();
			this.mode = "host";
			this.label = "Wallpaper Engine";
			// 不清媒体：WE 的媒体回调可能先于音频到达，清掉会让面板永久消失。
			this.onSource?.("host");
		}
		const n = Math.min(bands.length || 128, 512);
		this.hostBands = Float32Array.from(bands.subarray ? bands.subarray(0, n) : Array.prototype.slice.call(bands, 0, n));
	}

	useExternal() {
		this._disconnectSource();
		this.mode = "external";
		this.label = "外部注入";
		this._clearMedia("");
		this.onSource?.("external");
	}

	useSilence() {
		this._disconnectSource();
		this.mode = "silence";
		this.label = "静音";
		this.isPlaying = false;
		this._clearMedia("");
		this.onSource?.("silence");
	}

	_clearMedia(label) {
		this.media = {
			title: label || "", artist: "", thumbnail: "", isPlaying: false, position: 0, duration: 0,
		};
		this._emitMedia();
	}

	_pushMedia(patch) {
		Object.assign(this.media, patch);
		this._emitMedia();
	}

	_emitMedia() {
		this.onMedia?.({ ...this.media });
	}

	// ---------- 128 band 生成 ----------

	updateBands(t) {
		const out = this.bands;
		if (this.mode === "host") {
			const hb = this.hostBands;
			if (hb) {
				for (let i = 0; i < BAND_COUNT; i++) out[i] = hb[Math.min(i, hb.length - 1)] || 0;
			} else out.fill(0);
		} else if (this.mode === "demo") {
			fillDemo(out, t);
		} else if (this.mode === "external") {
			const ext = window.__externalBands;
			if (ext && ext.length >= BAND_COUNT) {
				for (let i = 0; i < BAND_COUNT; i++) out[i] = Math.max(0, Math.min(1, ext[i]));
			} else {
				out.fill(0);
			}
		} else if (this.mode === "analyser" && this.analyserL) {
			// WE 以 30Hz 投喂；高于此频率重复读只会放大逐帧抖动。
			if (t - (this._lastAudioRead || 0) < 1 / 30) return;
			this._lastAudioRead = t;
			this.analyserL.getFloatFrequencyData(this.floatL);
			this.analyserR.getFloatFrequencyData(this.floatR);
			fillBands64(out, this.floatL, this.floatR, this.ctx.sampleRate, this.analyserL.fftSize);
		} else {
			out.fill(0);
		}
		this.lastBands.set(out);
		this.setBands(out);
		if (this.mode === "demo") {
			const pos = ((t - this._demoStart) % this.media.duration + this.media.duration) % this.media.duration;
			if (Math.abs(pos - this.media.position) > 0.25) this._pushMedia({ position: pos });
		}
	}

	setBands(bands) {
		const len = bands.length || 128;
		if (!this._everReceived) {
			this.lastActiveTime = performance.now();
			this.lastIdleTime = 0;
			this._everReceived = true;
		}
		for (let n = 0; n < DATA_LEN; n++) {
			const r = Math.floor((n * len) / DATA_LEN);
			this.wallpaperAudioData[n] = bands[r] || 0;
		}
	}

	// ---------- 度量（原包 getAudioData 的逐行移植）----------

	tick(dt) {
		const t = performance.now();
		const data = this.wallpaperAudioData;
		const n = DATA_LEN;
		let r = 0, o = 0, c = 0, h = 0, d = 0, m = 0, v = 0, y = 0, x = 0, b = 0, M = 0, R = 0, A = 0, E = 0;

		this.isPlaying = true;
		for (let i = 0; i < n; i++) {
			const De = data[i] || 0;
			r += De;
			o += i * De;
			c += De;
			const Qe = this.prevData[i] || 0;
			R += Math.abs(De - Qe);
			if (i >= this.pulseTrigger.bandStart && i <= this.pulseTrigger.bandEnd) {
				const ve = De - Qe;
				if (ve > 0) A += ve;
			}
			if (i >= this.meteorTrigger.bandStart && i <= this.meteorTrigger.bandEnd) {
				const ve = De - Qe;
				if (ve > 0) E += ve;
			}
			this.prevData[i] = De;
			if (i <= 4) h += De;
			else if (i <= 12) d += De;
			else if (i <= 24) m += De;
			else if (i <= 45) v += De;
			else if (i <= 81) y += De;
			else if (i <= 120) x += De;
			else if (i <= 180) b += De;
			else if (i <= 255) M += De;
		}

		const C = r / n;
		if (C > this.idleEnergyThreshold) this.lastActiveTime = t;
		else this.lastIdleTime = t;

		this.evaluateTrigger(this.pulseTrigger, A, data, dt);
		this.evaluateTrigger(this.meteorTrigger, E, data, dt);

		const L = h / 5;
		const P = d / 9;
		const z = m / 13;
		const U = v / 21;
		const F = y / 37;
		const I = x / 40;
		const B = b / 61;
		const G = M / 76;
		const W = (h + d + m) / 27;
		const J = (v + y) / 58;
		const ae = (x + b + M) / 177;
		const he = r > 0 ? (h + d + m + v) / r : 0;
		const Q = r > 0 ? (x + b + M) / r : 0;
		const Y = Math.max(0, Q - this.prevBrightness) * 10;
		this.prevBrightness = Q;

		const K = Math.max(0, 1 - (R / n) * 2);
		const ue = C * 1.5;
		let ge = 0;
		if (L > ue) ge++;
		if (P > ue) ge++;
		if (z > ue) ge++;
		if (U > ue) ge++;
		if (F > ue) ge++;
		if (I > ue) ge++;
		if (B > ue) ge++;
		if (G > ue) ge++;
		const Re = ge / 8;
		const q = c > 0 ? o / c : 0;
		const ne = r > 0 ? 0.15 : 0.08;

		const s = this.smoothedData;
		s.bass += (W - s.bass) * ne;
		s.mid += (J - s.mid) * ne;
		s.treble += (ae - s.treble) * ne;
		s.energy += (C - s.energy) * ne;
		s.subBass += (L - s.subBass) * ne;
		s.lowMid += (z - s.lowMid) * ne;
		s.highMid += (F - s.highMid) * ne;
		s.presence += (I - s.presence) * ne;
		s.brilliance += (B - s.brilliance) * ne;
		s.air += (G - s.air) * ne;
		s.warmth += (he - s.warmth) * ne;
		s.brightness += (Q - s.brightness) * ne;
		s.sharpness += (Y - s.sharpness) * ne;
		s.smoothness += (K - s.smoothness) * ne;
		s.density += (Re - s.density) * ne;
		s.spectralCentroid += (q - s.spectralCentroid) * ne;
	}

	evaluateTrigger(e, flux, data, dt) {
		if (!e.enabled) return;
		const o = 512;
		let c = 0, h = false;
		const [d, m] = e.getTriggerRange();
		if (e.mode === "Advanced" && e.freqIndex >= 0 && e.freqIndex < o) {
			let v = 0, y = 0;
			for (let x = d; x <= m; x++) { v += data[x] || 0; y++; }
			c = v / y;
			e.lastEvalThresh = e.threshold;
			if (e.currentCooldown <= 0 && c > e.threshold) h = true;
			e.lastEvalEnergy = c;
			if (h) {
				this.onFreqTrigger?.(c, "Advanced", e.action);
				e.currentCooldown = 60;
			}
		}

		if (e.currentCooldown > 0) {
			e.currentCooldown -= dt * 60;
			if (e.currentCooldown < 0) e.currentCooldown = 0;
		}

		if (e.mode === "Auto Beat") {
			const v = 1 - Math.pow(0.6, dt * 60);
			e.smoothedFlux += (flux - e.smoothedFlux) * v;
			e.fluxHistory[e.fluxHistoryIndex] = e.smoothedFlux;
			e.fluxHistoryIndex = (e.fluxHistoryIndex + 1) % e.fluxHistory.length;

			let y = 0, x = 0;
			for (let E = 0; E < e.fluxHistory.length; E++) y += e.fluxHistory[E];
			y /= e.fluxHistory.length;
			for (let E = 0; E < e.fluxHistory.length; E++) x += Math.pow(e.fluxHistory[E] - y, 2);
			x /= e.fluxHistory.length;
			const b = Math.sqrt(x);
			const M = Math.max(0.1, 5 - e.sensitivity * 4);
			const R = Math.max(0.05, y + b * M);
			const A = e.prevSmoothedFlux > R && e.prevSmoothedFlux >= e.smoothedFlux;
			if (e.beatHold > 0) e.beatHold -= dt * 60;
			else if (A && e.prevSmoothedFlux - e.smoothedFlux > 1e-4) {
				this.onFreqTrigger?.(e.prevSmoothedFlux * 2.2 * e.pulseStrength, "Kick", e.action);
				e.beatHold = e.cooldown;
			}
			e.lastEvalEnergy = e.smoothedFlux * 2;
			e.lastEvalThresh = R * 2;
			e.prevSmoothedFlux = e.smoothedFlux;
		}
	}

	// ---------- 空闲波浪（原包 getIdleWaveIntensity 的逐行移植）----------

	getIdleWaveIntensity(dt) {
		const t = performance.now();
		let n;
		if (this.hasAudioSource) {
			if (this.lastActiveTime > this.lastIdleTime) {
				n = 0;
				this.idleStartTime = 0;
			} else {
				if (this.idleStartTime === 0) this.idleStartTime = t;
				n = (t - this.idleStartTime) / 1000 >= this.debounceDuration ? 1 : 0;
			}
		} else {
			n = this.isPlaying ? 0 : 1;
		}
		const o = (1 / this.idleFadeOutDuration) * dt;
		if (n > this.currentIdleIntensity) this.currentIdleIntensity = Math.min(n, this.currentIdleIntensity + o);
		else if (n < this.currentIdleIntensity) this.currentIdleIntensity = Math.max(n, this.currentIdleIntensity - o);
		return this.currentIdleIntensity;
	}

	setIdleWaveDebounce(v) { this.debounceDuration = v; }
	setIdleFadeOutDuration(v) { this.idleFadeOutDuration = v; }
}

// ---------- 前端：WebAudio -> 128 band ----------

// 每声道 64 段，0–16kHz 指数分频：首段 0–35Hz，其后每段 ×1.0999（约 7.3 段/倍频程）。
// 依据：WE 官方文档的「左 64 + 右 64」布局；社区实测「首段约 0–35Hz、高频段指数展宽」。
// 低频段窄、高频段宽，单音不会被宽频带平均稀释。
const BAND_EDGES = (() => {
	const e = new Float32Array(65);
	e[0] = 0;
	e[1] = 35;
	const r = Math.pow(FMAX / 35, 1 / 63);
	for (let i = 2; i <= 64; i++) e[i] = e[i - 1] * r;
	e[64] = FMAX;
	return e;
})();

function fillBands64(out, left, right, sampleRate, fftSize) {
	const binHz = sampleRate / fftSize;
	const WINDOW_DB = 14; // WebAudio 窗函数/单边谱归一化的固定损失
	for (let ch = 0; ch < 2; ch++) {
		const data = ch === 0 ? left : right;
		for (let b = 0; b < 64; b++) {
			const f0 = BAND_EDGES[b];
			const f1 = BAND_EDGES[b + 1];
			let a = f0 / binHz;
			let z = f1 / binHz;
			if (a < 1) a = 1;
			if (z > data.length - 1) z = data.length - 1;
			const k0 = Math.floor(a);
			const k1 = Math.ceil(z);
			let sum = 0, wsum = 0, peak = 0;
			for (let k = k0; k < k1; k++) {
				const lo = Math.max(a, k);
				const hi = Math.min(z, k + 1);
				if (hi <= lo) continue;
				const db = data[k] + WINDOW_DB;
				const v = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 48) / 48)) : 0;
				sum += v * (hi - lo);
				wsum += hi - lo;
				if (v > peak) peak = v;
			}
			// 平均保留持续音，峰值保留瞬态；纯平均会把窄带单音稀释掉。
			out[ch * 64 + b] = wsum > 0 ? (sum / wsum) * 0.5 + peak * 0.5 : 0;
		}
	}
}

function fillDemo(out, t) {
	const phase = ((t * 128) / 60) % 1;
	const beat = Math.exp(-phase * 5.5);
	const N = out.length;
	for (let i = 0; i < N; i++) {
		const x = i / N;
		let v = 0.85 * Math.pow(1 - x, 2.1) * (0.45 + 0.55 * beat);
		v += 0.3 * Math.exp(-Math.pow((x - 0.06) / 0.02, 2)) * beat;
		v += 0.26 * Math.exp(-Math.pow((x - 0.3 - 0.04 * Math.sin(t * 0.7)) / 0.06, 2));
		v += 0.14 * Math.exp(-Math.pow((x - 0.62) / 0.05, 2)) * (0.45 + 0.55 * Math.sin(t * 2.1));
		out[i] = Math.max(0, Math.min(1, v));
	}
}

// ---------- 媒体元数据 ----------

function decodeText(bytes, enc) {
	if (enc === 0) return new TextDecoder("latin1").decode(bytes).replace(/\0+$/, "");
	if (enc === 3) return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "");
	if (enc === 2) return new TextDecoder("utf-16be").decode(bytes).replace(/\0+$/, "");
	if (enc === 1) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2)).replace(/\0+$/, "");
		if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2)).replace(/\0+$/, "");
		return new TextDecoder("utf-16le").decode(bytes).replace(/\0+$/, "");
	}
	return new TextDecoder("utf-8").decode(bytes).replace(/\0+$/, "");
}

function syncsafe(b, o) {
	return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

export async function readMetadata(file) {
	const result = { title: "", artist: "", cover: "" };
	try {
		const buf = new Uint8Array(await file.slice(0, Math.min(file.size, 768 * 1024)).arrayBuffer());
		if (String.fromCharCode(buf[0], buf[1], buf[2]) !== "ID3") return result;
		const ver = buf[3];
		const flags = buf[5];
		let size = syncsafe(buf, 6);
		let off = 10;
		if (flags & 0x40) {
			const ext = (buf[10] << 24) | (buf[11] << 16) | (buf[12] << 8) | buf[13];
			off += ext + 4;
		}
		const end = Math.min(buf.length, 10 + size);
		while (off + 10 < end) {
			const id = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
			if (!/^[A-Z0-9]{4}$/.test(id)) break;
			let fsize;
			if (ver === 4) fsize = syncsafe(buf, off + 4);
			else fsize = (buf[off + 4] << 24) | (buf[off + 5] << 16) | (buf[off + 6] << 8) | buf[off + 7];
			if (fsize <= 0 || off + 10 + fsize > buf.length) break;
			const body = buf.subarray(off + 10, off + 10 + fsize);
			if (id === "TIT2") result.title = decodeText(body.subarray(1), body[0]);
			else if (id === "TPE1") result.artist = decodeText(body.subarray(1), body[0]);
			else if (id === "APIC") {
				const enc = body[0];
				let p = 1;
				while (p < body.length && body[p] !== 0) p++;
				const mime = new TextDecoder("latin1").decode(body.subarray(1, p)) || "image/jpeg";
				p++;
				p++; // picture type
				if (enc === 1 || enc === 2) {
					while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2;
					p += 2;
				} else {
					while (p < body.length && body[p] !== 0) p++;
					p++;
				}
				if (p < body.length) {
					const blob = new Blob([body.subarray(p)], { type: mime });
					result.cover = URL.createObjectURL(blob);
				}
			}
			off += 10 + fsize;
		}
	} catch { /* 元数据失败不影响播放 */ }
	return result;
}

function demoCover() {
	const c = document.createElement("canvas");
	c.width = 256; c.height = 256;
	const g = c.getContext("2d");
	const bg = g.createLinearGradient(0, 0, 256, 256);
	bg.addColorStop(0, "#120a2a");
	bg.addColorStop(0.55, "#3a1d6e");
	bg.addColorStop(1, "#0a0a16");
	g.fillStyle = bg;
	g.fillRect(0, 0, 256, 256);
	g.globalAlpha = 0.55;
	for (let i = 0; i < 26; i++) {
		const x = 20 + (i * 37) % 216;
		const h = 12 + ((i * 53) % 90);
		g.fillStyle = i % 5 === 0 ? "#ffb066" : "#8f6bff";
		g.fillRect(x, 220 - h, 7, h);
	}
	g.globalAlpha = 1;
	g.fillStyle = "rgba(255,255,255,0.92)";
	g.font = "600 20px system-ui, sans-serif";
	g.fillText("SONIC", 22, 48);
	g.fillText("TOPOGRAPHY", 22, 72);
	g.fillStyle = "rgba(255,255,255,0.45)";
	g.font = "11px ui-monospace, monospace";
	g.fillText("128 BIN DEMO SIGNAL", 22, 92);
	return c.toDataURL("image/png");
}
