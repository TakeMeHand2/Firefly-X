// 无头取帧：与原壁纸 ref-capture.mjs 同一套 CDP + SwiftShader 环境。
// 用同一条 128 BIN 刺激（128 BPM 四踩 + 音乐化频谱）驱动复刻端，
// 在拍点后 1 帧截图，便于和参照图做同口径比较。
//
//   node tools/capture.mjs --out out/base --shots 3
//   node tools/capture.mjs --out out/idle --stim silence --interval 500 --shots 6
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = resolve(arg("out", join(ROOT, "out", "cap")));
const W = Number(arg("w", "1280"));
const H = Number(arg("h", "720"));
const DPR = Number(arg("dpr", "1"));
const WARM = Number(arg("secs", "5"));
const SHOTS = Number(arg("shots", "3"));
const INTERVAL = Number(arg("interval", "0"));
const STIM = arg("stim", "ref");
const GRID = arg("grid", "");
const THEME = arg("theme", "");
const FPSPARAM = arg("fps", "");
const NOFX = arg("nofx", "0") === "1";
const NOMETEOR = arg("nometeor", "0") === "1";
const NOPULSE = arg("nopulse", "0") === "1";
const UI = arg("ui", "0") === "1";
const PANEL = arg("panel", "0") === "1";
const DEBUG = arg("debug", "0") === "1";
const FILE = arg("file", "");
const LIGHT = arg("light", "0") === "1";
const HOST = arg("host", "0") === "1";
const PHASE_MIN = Number(arg("phaseMin", "0"));
const PHASE_MAX = Number(arg("phaseMax", "0.18"));
const PORT = Number(arg("port", "5188"));
const CDP_PORT = Number(arg("cdp", "9512"));
const PROFILE = resolve(arg("profile", join(process.env.TEMP || "/tmp", `st-chrome-${process.pid}`)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort(port, timeout = 25000) {
	const t0 = Date.now();
	while (Date.now() - t0 < timeout) {
		const ok = await new Promise((res) => {
			const s = net.connect(port, "127.0.0.1");
			s.once("connect", () => { s.destroy(); res(true); });
			s.once("error", () => res(false));
			s.setTimeout(600, () => { s.destroy(); res(false); });
		});
		if (ok) return true;
		await sleep(120);
	}
	return false;
}

class CDP {
	constructor(ws) {
		this.ws = ws;
		this.id = 0;
		this.pending = new Map();
		this.events = [];
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { ok, fail } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
			} else if (msg.method) {
				this.events.push(msg);
			}
		});
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((ok, fail) => {
			this.pending.set(id, { ok, fail });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
}

// 与原壁纸 ref-capture.mjs 完全相同的刺激函数与相位定义
const SHIM = `
window.__beat = { phase: 0, peaks: 0, lastPeakFrame: -1 };
(function drive(){
  var t0 = performance.now();
  var N = 128;
  var arr = new Array(N);
  window.__externalBands = arr;
  function spectrum(t, phase){
    var beat = Math.exp(-phase * 5.5);
    for (var i = 0; i < N; i++) {
      var x = i / N;
      var v = 0.85 * Math.pow(1 - x, 2.1) * (0.45 + 0.55 * beat);
      v += 0.30 * Math.exp(-Math.pow((x - 0.06) / 0.02, 2)) * beat;
      v += 0.26 * Math.exp(-Math.pow((x - 0.30 - 0.04 * Math.sin(t * 0.7)) / 0.06, 2));
      v += 0.14 * Math.exp(-Math.pow((x - 0.62) / 0.05, 2)) * (0.45 + 0.55 * Math.sin(t * 2.1));
      arr[i] = Math.max(0, Math.min(1, v));
    }
    return arr;
  }
  function tick(){
    var t = (performance.now() - t0) / 1000;
    var phase = (t * 128 / 60) % 1;
    if (phase < window.__beat.phase) {
      window.__beat.peaks++;
      window.__beat.lastPeakFrame = window.__st ? window.__st.frame : -1;
    }
    window.__beat.phase = phase;
    window.__beat.t = t;
    spectrum(t, phase);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
`;

(async () => {
	mkdirSync(OUT, { recursive: true });
	const server = spawn(process.execPath, [join(ROOT, "tools/serve.mjs"), String(PORT)], {
		cwd: ROOT, stdio: "ignore",
	});
	mkdirSync(PROFILE, { recursive: true });
	const chrome = spawn(CHROME, [
		"--headless=new",
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${PROFILE}`,
		"--no-first-run", "--no-default-browser-check",
		"--disable-extensions", "--hide-scrollbars",
		"--no-proxy-server",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--disable-backgrounding-occluded-windows",
		"--autoplay-policy=no-user-gesture-required",
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		`--window-size=${W},${H}`,
		"about:blank",
	], { stdio: "ignore" });

	const cleanup = () => {
		try { chrome.kill(); } catch { /* noop */ }
		try { server.kill(); } catch { /* noop */ }
	};
	process.on("exit", cleanup);

	try {
		if (!(await waitPort(PORT))) throw new Error("静态服务器未起来");
		if (!(await waitPort(CDP_PORT))) throw new Error("Chrome 调试端口未起来");
		const base = `http://127.0.0.1:${CDP_PORT}`;
		const res = await fetch(`${base}/json/new?about:blank`, { method: "PUT" });
		const target = await res.json();
		const ws = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise((ok, fail) => {
			ws.addEventListener("open", ok, { once: true });
			ws.addEventListener("error", fail, { once: true });
		});
		const cdp = new CDP(ws);
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Log.enable");
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: W, height: H, deviceScaleFactor: DPR, mobile: false,
		});
		if (HOST) {
			await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
				window.wallpaperRegisterAudioListener = function(cb){ window.__hostCb = cb; };
				window.wallpaperReady = function(){ window.__hostReady = true; };
				(function(){
					var N=128, arr=new Array(N), t0=performance.now();
					function tick(){
						var t=(performance.now()-t0)/1000, phase=(t*128/60)%1, beat=Math.exp(-phase*5.5);
						for(var i=0;i<N;i++){var x=i/N;
							var v=0.85*Math.pow(1-x,2.1)*(0.45+0.55*beat);
							v+=0.30*Math.exp(-Math.pow((x-0.06)/0.02,2))*beat;
							v+=0.26*Math.exp(-Math.pow((x-0.30)/0.06,2));
							arr[i]=v;
						}
						if(window.__hostCb) window.__hostCb(arr);
						requestAnimationFrame(tick);
					}
					requestAnimationFrame(tick);
				})();
			` });
		} else if (STIM === "ref") {
			await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
		}
		const qs = new URLSearchParams();
		qs.set("stim", HOST ? "silence" : (STIM === "ref" ? "external" : STIM));
		if (GRID) qs.set("grid", GRID);
		if (THEME) qs.set("theme", THEME);
		if (FPSPARAM) qs.set("fps", FPSPARAM);
		if (LIGHT) qs.set("light", "1");
		if (DPR) qs.set("dpr", String(DPR));
		qs.set("stats", "0");
		qs.set("ui", UI ? "1" : "0");
		if (PANEL) qs.set("panel", "1");
		await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?${qs}` });

		for (let i = 0; i < 120; i++) {
			await sleep(250);
			const r = await cdp.send("Runtime.evaluate", {
				expression: "({st:!!window.__st, f:window.__st?window.__st.frame:0})",
				returnByValue: true,
			});
			if (r.result.value && r.result.value.st && r.result.value.f > 5) break;
			if (i === 119) {
				const errs = cdp.events
					.filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded")
					.slice(-8)
					.map((e) => JSON.stringify(e.params).slice(0, 600));
				console.log("⚠ 页面未就绪", JSON.stringify(r.result.value), errs.join("\n"));
			}
		}
		const read = async () => {
			const r = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const st = window.__st;
					const b = window.__beat || {};
					return { probe: st ? st.probe() : null, phase: b.phase, peaks: b.peaks, frame: st ? st.frame : -1 };
				})()`,
				returnByValue: true,
			});
			return r.result.value;
		};

		const w0 = await read();
		const wall0 = Date.now();
		await sleep(WARM * 1000);
		const w1 = await read();
		const fps = (w1 && w0 ? w1.frame - w0.frame : 0) / ((Date.now() - wall0) / 1000);
		console.log(`热身 ${WARM}s，渲染帧率 ≈ ${fps.toFixed(1)} fps（SwiftShader）`);
		console.log("probe:", JSON.stringify(w1 && w1.probe));
		if (FILE) {
			const r = await cdp.send("Runtime.evaluate", {
				expression: `__st.loadFile(${JSON.stringify(FILE)}, ${JSON.stringify(FILE.split('/').pop())})`,
				awaitPromise: true,
				userGesture: true,
				returnByValue: true,
			});
			console.log("loadFile:", JSON.stringify(r.result.value));
			await sleep(3200);
		}
		if (DEBUG) {
			const dbg = await cdp.send("Runtime.evaluate", {
				expression: `(() => {
					const p = document.getElementById('player');
					const cs = getComputedStyle(p);
					const m = window.__st.audio.media;
					return { cls: p.className, op: cs.opacity, disp: cs.display, rect: p.getBoundingClientRect().toJSON(),
						media: { title: m.title, artist: m.artist, playing: m.isPlaying, pos: m.position, dur: m.duration, cover: !!m.thumbnail },
						show: window.__st.state.showPlayerController,
						cover: !!document.getElementById('cover').src, title: document.getElementById('trackTitle').textContent,
						audio: (() => {
							const a = window.__st.audio;
							const b = a.byteData ? Array.from(a.byteData.slice(0, 12)) : [];
							let mx = 0, mi = -1; if (a.byteData) for (let i=0;i<a.byteData.length;i++){ const v=a.byteData[i]; if (v > mx) { mx = v; mi = i; } }
							return { mode: a.mode, ctx: a.ctx && a.ctx.state, sr: a.ctx && a.ctx.sampleRate,
								el: a.audioEl ? { paused: a.audioEl.paused, muted: a.audioEl.muted, vol: a.audioEl.volume, t: a.audioEl.currentTime } : null,
								maxByte: mx, maxBin: mi, bins: b, bands: Array.from(a.bands.slice(0, 8)),  data: Array.from(a.wallpaperAudioData.slice(0, 12)), sm: { sub: a.smoothedData.subBass, energy: a.smoothedData.energy } };
						})() };
				})()`,
				returnByValue: true,
			});
			console.log("player:", JSON.stringify(dbg.result.value));
		}
		if (NOFX || NOMETEOR || NOPULSE) {
			const expr = [];
			if (NOFX || NOPULSE) expr.push("__st.onPropChange('pulseEnabled', false)");
			if (NOFX || NOMETEOR) expr.push("__st.onPropChange('meteorEnabled', false)");
			await cdp.send("Runtime.evaluate", { expression: expr.join(";") });
			await sleep(2600);
		}

		const states = [];
		for (let s = 0; s < SHOTS; s++) {
			let st = await read();
			let hit = false;
			if (INTERVAL > 0) {
				await sleep(INTERVAL);
				st = await read();
				hit = true;
			} else {
				const basePeaks = st && st.peaks ? st.peaks : 0;
				for (let i = 0; i < 400; i++) {
					st = await read();
					if (st && st.peaks > basePeaks && st.phase >= PHASE_MIN && st.phase < PHASE_MAX) {
						hit = true;
						break;
					}
					await sleep(8);
				}
			}
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			const name = `shot-${s}.png`;
			writeFileSync(join(OUT, name), Buffer.from(shot.data, "base64"));
			states.push({ shot: name, hit, ...st });
			console.log(`${name} ${hit ? "命中" : "未命中"} phase=${st && st.phase != null ? st.phase.toFixed(3) : "?"} ${JSON.stringify(st && st.probe)}`);
			if (INTERVAL <= 0) await sleep(220);
		}
		writeFileSync(join(OUT, "states.json"), JSON.stringify(states, null, 2));

		const errors = cdp.events
			.filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded")
			.slice(-10)
			.map((e) => e.params);
		if (errors.length) {
			console.log("⚠ 控制台事件：");
			for (const e of errors) console.log(JSON.stringify(e).slice(0, 900));
		}
		console.log("输出目录:", OUT);
		ws.close();
	} catch (e) {
		console.error("失败:", e.message);
		process.exitCode = 1;
	} finally {
		cleanup();
	}
})();
