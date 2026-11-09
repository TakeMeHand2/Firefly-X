import { AudioEngine } from "./audio.js";
import { Effects } from "./effects.js";
import { PlayerPanel } from "./player.js";
import { DEFAULTS, PropertiesPanel, fromWeConfig, loadState, toWeConfig } from "./properties.js";
import { Renderer } from "./renderer.js";
import { LIGHT, THEMES, THEME_ORDER, lerp3, lerpTheme, linearToHex, linearToHexRaw } from "./themes.js";

// 在覆盖任何全局之前捕获宿主能力：只有 Wallpaper Engine 提供这套函数。
const HOST = {
	isWE: typeof window.wallpaperRegisterAudioListener === "function",
	registerAudio: window.wallpaperRegisterAudioListener,
	ready: window.wallpaperReady,
};

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "1";
let embedActive = true;
const FIXED = params.get("fixed") === "1";
const DPR_OVERRIDE = params.has("dpr") ? Number(params.get("dpr")) : 0;
const DPR_OK = Number.isFinite(DPR_OVERRIDE) && DPR_OVERRIDE > 0;

// ---------- 状态 ----------

const state = loadState();
if (params.has("theme")) state.theme = params.get("theme");
if (params.has("grid")) state.gridSize = Number(params.get("grid"));
if (params.has("panel")) state.__panel = params.get("panel") === "1";
if (params.get("ui") === "0") document.body.classList.add("clean");
if (EMBED) document.body.classList.add("embed");
if (params.has("fps")) state.fpsLimit = Number(params.get("fps"));
if (params.get("light") === "1") state.lightMode = true;

const clock = {
	fixed: FIXED,
	t: 0,
	_t0: performance.now(),
	advance() {
		if (this.fixed) this.t += 1 / 60;
		else this.t = (performance.now() - this._t0) / 1000;
		return this.t;
	},
	now() {
		return this.fixed ? this.t : (performance.now() - this._t0) / 1000;
	},
	nowMs() {
		return this.fixed ? this.t * 1000 : performance.now();
	},
};

const canvas = document.getElementById("gl");
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

// 嵌入模式：由父页面（博客全屏层）以 30Hz 投喂 128 值，等价于 WE 宿主。
// 父页面同时负责卡片/控件；这里只渲染场景，并把点击与指针回传。
if (EMBED) {
	window.addEventListener("message", (ev) => {
		if (ev.source !== parent) return;
		const d = ev.data;
		if (!d || typeof d !== "object") return;
		if (d.type === "bands" && Array.isArray(d.data)) {
			audio.useHostBands(Float32Array.from(d.data));
		} else if (d.type === "active") {
			embedActive = !!d.value;
		}
	});
	canvas.addEventListener("pointerdown", () => {
		try { parent.postMessage({ type: "poke" }, "*"); } catch { /* 独立打开 */ }
	});
	window.addEventListener("keydown", (ev) => {
		if (ev.key === " " || ev.code === "Space" || ev.key === "ArrowLeft" ||
			ev.key === "ArrowRight" || ev.key === "Escape") {
			ev.preventDefault();
		}
		try {
			parent.postMessage({
				type: "key", key: ev.key, code: ev.code, shiftKey: !!ev.shiftKey,
			}, "*");
		} catch { /* 独立打开 */ }
	});
	let lastPtr = 0;
	window.addEventListener("pointermove", (ev) => {
		const now = performance.now();
		if (now - lastPtr < 40) return;
		lastPtr = now;
		try { parent.postMessage({ type: "pointer", x: ev.clientX, y: ev.clientY }, "*"); } catch { /* noop */ }
	});
}
const effects = new Effects(clock);
effects.cache = { state, meteorTrigger: audio.meteorTrigger, pulseTrigger: audio.pulseTrigger };

audio.onFreqTrigger = (strength, type, action) => effects.handleTrigger(strength, type, action);

// ---------- 主题 ----------

const themeCtl = {
	index: 0,
	progress: 0,
	acc: 0,
	last: performance.now(),
	current() {
		if (state.theme !== "cycle") return THEMES[state.theme] || THEMES.nocturnal;
		const a = THEMES[THEME_ORDER[this.index % THEME_ORDER.length]];
		const b = THEMES[THEME_ORDER[(this.index + 1) % THEME_ORDER.length]];
		return lerpTheme(a, b, this.progress);
	},
	tick(dt) {
		if (state.theme !== "cycle") {
			this.progress = 0;
			this.acc = 0;
			return;
		}
		// 原实现的轮询进度由 1s 定时器推进（React state），不是每帧推进；
		// 这决定了 CSS 背景只按秒变化，而材质色仍按帧 lerp。
		this.acc += dt;
		if (this.acc < 1) return;
		this.acc -= 1;
		this.progress += 1 / Math.max(1, state.themeCycleInterval);
		if (this.progress >= 1) {
			this.progress = 0;
			this.index = (this.index + 1) % THEME_ORDER.length;
		}
	},
};

const cur = {
	base1: [0.005, 0.008, 0.025],
	base2: [0.015, 0.025, 0.07],
	coolCore: [0.35, 0.1, 0.9],
	coolEdge: [0.15, 0, 0.45],
	warmCore: [0.65, 0.25, 1],
	warmEdge: [0.5, 0.1, 0.8],
	ripple: [0.5, 0.2, 1],
	peak: [1, 0.55, 0.05],
	glow: 1,
	light: 0,
	fog: [0.005, 0.008, 0.025],
	meteor: [0.895, 0.775, 1],
};

const runtime = {
	angleX: state.cameraAngleX,
	angleY: state.cameraAngleY,
	dist: state.cameraDistance,
	lastBg: "",
	lastAccent: "",
};

// ---------- UI ----------

const player = new PlayerPanel();
const props = new PropertiesPanel(state, onPropChange);

const toastEl = document.getElementById("toast");
let toastTimer = 0;
function toast(msg, ms = 2600) {
	toastEl.textContent = msg;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function onPropChange(key, value) {
	switch (key) {
		case "gridSize":
			applyGrid(value);
			break;
		case "pulseSensitivity":
			audio.pulseTrigger.sensitivity = value;
			break;
		case "pulseCooldown":
			audio.pulseTrigger.cooldown = value;
			break;
		case "pulseEnabled":
			audio.pulseTrigger.enabled = !!value;
			break;
		case "meteorSensitivity":
			audio.meteorTrigger.sensitivity = value;
			break;
		case "meteorCooldown":
			audio.meteorTrigger.cooldown = value;
			break;
		case "meteorEnabled":
			audio.meteorTrigger.enabled = !!value;
			break;
		case "idleWaveDebounce":
			audio.setIdleWaveDebounce(value);
			break;
		case "idleWaveFadeDuration":
			audio.setIdleFadeOutDuration(value);
			break;
		case "cameraAngleX":
			runtime.angleX = value;
			if (!state.autoRotateEnabled) renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
			break;
		case "cameraAngleY":
			runtime.angleY = value;
			if (!state.autoRotateEnabled) renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
			break;
		case "cameraDistance":
			runtime.dist = value;
			if (!state.autoRotateEnabled) renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
			break;
		case "autoRotateEnabled":
			if (!value) {
				runtime.angleX = state.cameraAngleX;
				renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
			}
			break;
		case "controllerSize":
			player.setSize(value);
			break;
		case "controllerX":
		case "controllerY":
			player.setPosition(state.controllerX, state.controllerY);
			break;
		case "showAlbumCover":
			player.update(audio.media, !!value);
			break;
		case "showPlayerController":
			updatePlayerVisibility();
			break;
		case "theme":
			themeCtl.progress = 0;
			break;
		default:
			break;
	}
}

function applyGrid(n) {
	if (n > 1080) {
		toast("4096×4096 需要约 1 GB 实例缓冲，浏览器中会直接崩溃；已拒绝启用。");
		const fallback = renderer.grid || 160;
		state.gridSize = fallback;
		if (!renderer.grid) renderer.setGrid(fallback); // 启动即被拒绝时也要建出基础网格
		props.refreshAll();
		return;
	}
	if (n > 640) toast("高精度档会显著占用显存，若掉帧请回到 320 或 160。", 3200);
	renderer.setGrid(n);
}

// ---------- 播放器面板 ----------

let mediaState = { title: "", artist: "", thumbnail: "", isPlaying: false, position: 0, duration: 0 };
let playingSince = 0;
let audioActive = true;
let idleSince = 0;

audio.onMedia = (m) => {
	const wasPlaying = mediaState.isPlaying;
	mediaState = m;
	if (m.isPlaying && !wasPlaying) playingSince = performance.now();
	if (!m.isPlaying) playingSince = 0;
	player.update(m, !!state.showAlbumCover);
	updatePlayerVisibility();
};

let hostClock = { pos: 0, at: 0, playing: false, dur: 0 };

// WE 的 timeline 回调频率低，面板需要按 200ms 插值（与本体一致）。
function applyHostMedia(m) {
	hostClock = {
		pos: m.position || 0,
		at: performance.now(),
		playing: !!m.isPlaying,
		dur: m.duration || 0,
	};
	audio.media = {
		title: m.title || "",
		artist: m.artist || "",
		thumbnail: m.thumbnail || "",
		isPlaying: !!m.isPlaying,
		position: m.position || 0,
		duration: m.duration || 0,
	};
	audio.onMedia?.(audio.media);
}

setInterval(() => {
	if (!HOST.isWE || !mediaState.isPlaying || !(mediaState.duration > 0)) return;
	const p = Math.min(hostClock.pos + (performance.now() - hostClock.at) / 1000, hostClock.dur);
	if (Math.abs(p - mediaState.position) > 0.05) {
		mediaState.position = p;
		player.update(mediaState, !!state.showAlbumCover);
	}
}, 200);

function updatePlayerVisibility() {
	const hasMedia = !!(mediaState.title || mediaState.artist || mediaState.thumbnail);
	const playingLong = mediaState.isPlaying && hasMedia && performance.now() - playingSince > 1000;
	const visible = !!state.showPlayerController && hasMedia && (playingLong || (audioActive && hasMedia));
	player.setVisible(visible);
}

setInterval(() => {
	const e = audio.smoothedData.energy;
	if (e > 0.05) {
		audioActive = true;
		idleSince = 0;
	} else {
		if (!idleSince) idleSince = performance.now();
		if (performance.now() - idleSince > 3000) audioActive = false;
	}
	updatePlayerVisibility();
}, 300);

// ---------- 音频源 ----------

const audioMenu = document.getElementById("audioMenu");
const sourceLabel = document.getElementById("sourceLabel");
const fileInput = document.getElementById("fileInput");

function setSourceLabel(text) {
	sourceLabel.textContent = text;
}

async function loadAudioUrl(url, name) {
	const blob = await fetch(new URL(url, document.baseURI).href).then((r) => r.blob());
	await audio.useFile(new File([blob], name || "audio.mp3", { type: blob.type || "audio/mpeg" }));
}

async function switchSource(kind) {
	audioMenu.classList.remove("open");
	try {
		if (kind === "system") {
			await audio.useSystemAudio();
			setSourceLabel("系统音频");
			toast("已接入系统音频（回环）。关闭共享即可停止。");
		} else if (kind === "mic") {
			await audio.useMic();
			setSourceLabel("麦克风");
			toast("已接入麦克风。");
		} else if (kind === "file") {
			fileInput.click();
			return;
		} else if (kind === "builtin") {
			await loadAudioUrl("assets/demo-track.mp3", "demo-track.mp3");
			setSourceLabel("内置示例曲");
			toast("内置示例曲：完整走 WebAudio 分析 → 128 band → 视觉链路。");
			return;
		} else if (kind === "demo") {
			audio.useDemo(clock.now());
			setSourceLabel("演示信号");
			toast("演示信号：128 BIN 合成频谱，用于无音源时评估响应。");
		} else if (kind === "silence") {
			audio.useSilence();
			setSourceLabel("静音");
			toast("静音：约 1 秒后进入空闲波浪。");
		}
	} catch (err) {
		setSourceLabel("演示信号");
		audio.useDemo(clock.now());
		toast(`${err && err.message ? err.message : "音频接入失败"}；已回退到演示信号。`, 4200);
	}
}

document.querySelectorAll("[data-source]").forEach((btn) => {
	btn.addEventListener("click", () => switchSource(btn.dataset.source));
});

fileInput.addEventListener("change", async () => {
	const f = fileInput.files && fileInput.files[0];
	if (!f) return;
	try {
		await audio.useFile(f);
		setSourceLabel("本地音频");
		toast(`正在播放：${f.name}`);
	} catch (err) {
		audio.useDemo(clock.now());
		setSourceLabel("演示信号");
		toast(`无法播放该文件：${err && err.message ? err.message : err}`);
	}
	fileInput.value = "";
});

// ---------- 相机 / 交互 ----------

renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);

canvas.addEventListener("click", (e) => {
	if (!state.meteorClickEnabled) return;
	if (audioActive) return;
	const rect = canvas.getBoundingClientRect();
	effects.clickAt(e.clientX, e.clientY, {
		eye: renderer.eye,
		angleX: runtime.angleX,
		angleY: runtime.angleY,
		fov: renderer.fov,
		aspect: renderer.aspect || 1,
	}, rect, state.meteorIntensity);
});

// ---------- 尺寸 ----------

function resize() {
	const dpr = DPR_OK ? DPR_OVERRIDE : Math.min(window.devicePixelRatio || 1, 2);
	renderer.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener("resize", resize);
resize();

// ---------- 主循环 ----------

function step(dt) {
	if (EMBED && !embedActive) return;
	audio.tick(dt);
	effects.tick(dt);
	audio.currentIdleIntensity = audio.getIdleWaveIntensity(dt);

	if (state.autoRotateEnabled) {
		runtime.angleX = (runtime.angleX + state.autoRotateSpeed * dt) % 360;
		renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
	}
}

let fixedAcc = 0;
if (!FIXED) {
	let lastStep = performance.now();
	setInterval(() => {
		const now = performance.now();
		const dt = Math.min((now - lastStep) / 1000, 0.1);
		lastStep = now;
		step(dt);
	}, 1);
}

const u = {
	uTime: 0,
	uIdleWave: 0,
	uCentralIntensity: 1,
	uRingIntensity: 1,
	uFlowIntensity: 1,
	uRiverIntensity: 1,
	uSpikeIntensity: 1,
	uResponseRange: 1,
	uSubBass: 0,
	uBass: 0,
	uLowMid: 0,
	uMid: 0,
	uHighMid: 0,
	uPresence: 0,
	uBrilliance: 0,
	uAir: 0,
	uWarmth: 0,
	uBrightness: 0,
	uSharpness: 0,
	uSmoothness: 0,
	uDensity: 0,
	uEnergy: 0,
	uBaseColor1: cur.base1,
	uBaseColor2: cur.base2,
	uCoolCore: cur.coolCore,
	uCoolEdge: cur.coolEdge,
	uWarmCore: cur.warmCore,
	uWarmEdge: cur.warmEdge,
	uRippleColor: cur.ripple,
	uPeakColor: cur.peak,
	uGlowIntensity: 1,
	uPeakEnabled: 1,
	uPeakIntensity: 1,
	uLightMode: 0,
};

function updateVisual(dt) {
	themeCtl.tick(dt);
	const th = themeCtl.current();

	const tb1 = state.lightMode ? LIGHT.base1 : th.uBaseColor1;
	const tb2 = state.lightMode ? LIGHT.base2 : th.uBaseColor2;
	cur.base1 = lerp3(cur.base1, tb1, 0.05);
	cur.base2 = lerp3(cur.base2, tb2, 0.05);
	cur.coolCore = lerp3(cur.coolCore, th.uCoolCore, 0.05);
	cur.coolEdge = lerp3(cur.coolEdge, th.uCoolEdge, 0.05);
	cur.warmCore = lerp3(cur.warmCore, th.uWarmCore, 0.05);
	cur.warmEdge = lerp3(cur.warmEdge, th.uWarmEdge, 0.05);
	cur.ripple = lerp3(cur.ripple, th.uRippleColor, 0.05);
	cur.peak = lerp3(cur.peak, th.uPeakColor, 0.05);
	cur.glow += (th.uGlowIntensity - cur.glow) * 0.05;
	cur.light += ((state.lightMode ? 1 : 0) - cur.light) * 0.05;
	cur.fog = lerp3(cur.fog, state.lightMode ? LIGHT.bg : th.uBaseColor1, 0.05);
	cur.meteor = lerp3(cur.meteor, lerp3(th.uWarmCore, [1, 1, 1], 0.7), 0.05);

	const bg = state.lightMode ? LIGHT.bg : lerp3(th.uBaseColor1, th.uBaseColor2, 0.4);
	const bgHex = state.lightMode ? linearToHex(bg) : linearToHexRaw(bg);
	if (bgHex !== runtime.lastBg) {
		runtime.lastBg = bgHex;
		document.body.style.backgroundColor = bgHex;
	}
	const accent = linearToHex(th.uRippleColor);
	if (accent !== runtime.lastAccent) {
		runtime.lastAccent = accent;
		player.setAccent(accent);
	}

	const s = audio.smoothedData;
	u.uTime = clock.now();
	u.uIdleWave = state.idleWaveEnabled ? audio.currentIdleIntensity : 0;
	u.uCentralIntensity = state.centralEnabled ? state.centralIntensity : 0;
	u.uRingIntensity = state.ringEnabled ? state.ringIntensity : 0;
	u.uFlowIntensity = state.flowEnabled ? state.flowIntensity : 0;
	u.uRiverIntensity = state.riverEnabled ? state.riverIntensity : 0;
	u.uSpikeIntensity = state.spikeEnabled ? state.spikeIntensity : 0;
	u.uResponseRange = state.responseRange;

	u.uSubBass = s.subBass;
	u.uBass = s.bass;
	u.uLowMid = s.lowMid;
	u.uMid = s.mid;
	u.uHighMid = s.highMid;
	u.uPresence = s.presence;
	u.uBrilliance = s.brilliance;
	u.uAir = s.air;
	u.uWarmth = s.warmth;
	u.uBrightness = s.brightness;
	u.uSharpness = s.sharpness;
	u.uSmoothness = s.smoothness;
	u.uDensity = s.density;
	u.uEnergy = s.energy;

	u.uBaseColor1 = cur.base1;
	u.uBaseColor2 = cur.base2;
	u.uCoolCore = cur.coolCore;
	u.uCoolEdge = cur.coolEdge;
	u.uWarmCore = cur.warmCore;
	u.uWarmEdge = cur.warmEdge;
	u.uRippleColor = cur.ripple;
	u.uPeakColor = cur.peak;
	u.uGlowIntensity = cur.glow;
	u.uPeakEnabled = state.peakColorEnabled ? 1 : 0;
	u.uPeakIntensity = state.peakColorIntensity;
	u.uLightMode = cur.light;
}

let frameNo = 0;
let lastFrame = performance.now();
let fpsEma = 60;
let renderAcc = 0;
let lastStats = 0;
const hud = document.getElementById("stats");

function loop(now) {
	requestAnimationFrame(loop);
	if (EMBED && !embedActive) { lastFrame = now; return; }
	const dtReal = Math.min((now - lastFrame) / 1000, 0.1);
	const dtVisual = FIXED ? 1 / 60 : dtReal;
	lastFrame = now;
	if (dtReal > 1e-4) fpsEma += (1 / dtReal - fpsEma) * 0.08;

	clock.advance();
	audio.updateBands(clock.now());

	if (FIXED) {
		fixedAcc += 1 / 60;
		while (fixedAcc >= 0.001) {
			step(0.001);
			fixedAcc -= 0.001;
		}
	}

	const interval = state.fpsLimit > 0 ? 1000 / state.fpsLimit : 0;
	renderAcc += dtReal * 1000;
	if (interval && renderAcc < interval) return;
	renderAcc = interval ? renderAcc % interval : 0;

	updateVisual(dtVisual);
	renderer.render({
		u,
		ripples: effects.ripples,
		meteors: effects.meteors,
		particles: effects.particles,
		fogColor: cur.fog,
		meteorColor: cur.meteor,
		particleColor: cur.meteor,
	});
	frameNo++;

	if (now - lastStats > 500) {
		lastStats = now;
		if (hud && hud.classList.contains("show")) {
			hud.textContent =
				`${fpsEma.toFixed(0)} fps · ${(1000 / Math.max(1, fpsEma)).toFixed(1)} ms · ` +
				`网格 ${renderer.grid}² (${(renderer.count / 1000).toFixed(0)}k) · ` +
				`e ${audio.smoothedData.energy.toFixed(2)} · sub ${audio.smoothedData.subBass.toFixed(2)} · ` +
				`meteor ${effects.activeMeteors()} · ripple ${effects.ripples.filter((r) => r.isActive).length}`;
		}
	}
}

// ---------- 全局入口 / 探针 ----------

window.__st = {
	state,
	audio,
	effects,
	renderer,
	clock,
	onPropChange,
	get frame() { return frameNo; },
	get theme() { return themeCtl.current(); },
	setBands: (arr) => { window.__externalBands = arr; },
	loadFile: loadAudioUrl,
	probe: () => ({
		frame: frameNo,
		time: clock.now(),
		energy: audio.smoothedData.energy,
		subBass: audio.smoothedData.subBass,
		presence: audio.smoothedData.presence,
		warmth: audio.smoothedData.warmth,
		sharpness: audio.smoothedData.sharpness,
		density: audio.smoothedData.density,
		ripples: effects.ripples.filter((r) => r.isActive).length,
		meteors: effects.activeMeteors(),
		spawnedMeteors: effects.counters.meteors,
		clickMeteors: effects.counters.clicks,
		particles: effects.activeParticles(),
		idle: audio.currentIdleIntensity,
		theme: themeCtl.current().id,
		grid: renderer.grid,
		mode: audio.mode,
		label: audio.label,
	}),
};

window.wallpaperPropertyListener = {
	applyUserProperties: (propsIn) => {
		const patch = fromWeConfig(propsIn);
		let gridChanged = false;
		for (const [k, v] of Object.entries(patch)) {
			if (!(k in state)) continue;
			if (k === "gridSize") {
				state.gridSize = v;
				gridChanged = true;
			} else {
				state[k] = v;
				onPropChange(k, v);
			}
		}
		if (gridChanged) applyGrid(state.gridSize);
		props.refreshAll();
	},
	applyGeneralProperties: (g) => {
		if (g && g.fps !== undefined) state.fpsLimit = g.fps;
	},
};

// ---------- 启动 ----------

applyGrid(state.gridSize);
props.refreshAll();
if (state.__panel) {
	delete state.__panel;
	props.setOpen(true);
}
setSourceLabel("演示信号");

const stim = params.get("stim");
if (EMBED && (!stim || stim === "bridge")) {
	audio.useSilence();
	setSourceLabel("博客全屏");
} else if (HOST.isWE) {
	if (HOST.registerAudio) HOST.registerAudio((bands) => audio.useHostBands(bands));
	const hs = window.__mediaState;
	if (hs) {
		hs._callbacks.push(applyHostMedia);
		applyHostMedia(hs);
	}
	setSourceLabel("Wallpaper Engine");
	if (typeof HOST.ready === "function") {
		try { HOST.ready(); } catch { /* host 已卸载 */ }
	}
} else {
	if (stim === "external") audio.useExternal();
	else if (stim === "system") switchSource("system");
	else if (stim === "mic") switchSource("mic");
	else if (stim === "silence") audio.useSilence();
	else {
		audio.useDemo(clock.now());
	}
}

if (params.get("stats") === "1") hud.classList.add("show");
if (params.get("panel") === "1") props.setOpen(true);

document.getElementById("btnProps").addEventListener("click", () => props.toggle());
document.getElementById("btnAudio").addEventListener("click", () => audioMenu.classList.toggle("open"));
document.getElementById("btnCloseProps").addEventListener("click", () => props.setOpen(false));
document.getElementById("btnReset").addEventListener("click", () => {
	Object.assign(state, DEFAULTS);
	audio.pulseTrigger.sensitivity = state.pulseSensitivity;
	audio.pulseTrigger.cooldown = state.pulseCooldown;
	audio.pulseTrigger.enabled = state.pulseEnabled;
	audio.meteorTrigger.sensitivity = state.meteorSensitivity;
	audio.meteorTrigger.cooldown = state.meteorCooldown;
	audio.meteorTrigger.enabled = state.meteorEnabled;
	audio.setIdleWaveDebounce(state.idleWaveDebounce);
	audio.setIdleFadeOutDuration(state.idleWaveFadeDuration);
	player.setSize(state.controllerSize);
	player.setPosition(state.controllerX, state.controllerY);
	runtime.angleX = state.cameraAngleX;
	runtime.angleY = state.cameraAngleY;
	runtime.dist = state.cameraDistance;
	renderer.setCamera(runtime.angleX, runtime.angleY, runtime.dist);
	applyGrid(state.gridSize);
	props.refreshAll();
	toast("已恢复默认参数。");
});
document.getElementById("btnExport").addEventListener("click", () => {
	const blob = new Blob([JSON.stringify(toWeConfig(state), null, 2)], { type: "application/json" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "sonic-topography.we-config.json";
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById("btnImport").addEventListener("click", () => document.getElementById("cfgInput").click());
document.getElementById("cfgInput").addEventListener("change", async (e) => {
	const f = e.target.files[0];
	if (!f) return;
	try {
		const cfg = JSON.parse(await f.text());
		const patch = fromWeConfig(cfg);
		for (const [k, v] of Object.entries(patch)) {
			if (k in state) state[k] = v;
		}
		props.refreshAll();
		applyGrid(state.gridSize);
		audio.pulseTrigger.sensitivity = state.pulseSensitivity;
		audio.pulseTrigger.cooldown = state.pulseCooldown;
		audio.meteorTrigger.sensitivity = state.meteorSensitivity;
		audio.meteorTrigger.cooldown = state.meteorCooldown;
		player.setSize(state.controllerSize);
		player.setPosition(state.controllerX, state.controllerY);
		toast("配置已导入。");
	} catch {
		toast("配置解析失败：需要 JSON。");
	}
	e.target.value = "";
});

window.addEventListener("keydown", (e) => {
	if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
	if (e.key === "p" || e.key === "P") props.toggle();
	else if (e.key === "a" || e.key === "A") audioMenu.classList.toggle("open");
	else if (e.key === "h" || e.key === "H") hud.classList.toggle("show");
	else if (e.key === "Escape") {
		props.setOpen(false);
		audioMenu.classList.remove("open");
	}
});

requestAnimationFrame(loop);
if (EMBED) {
	try { parent.postMessage({ type: "ready" }, "*"); } catch { /* noop */ }
}
