// 参照端取帧：让本机 Wallpaper Engine 壁纸在 headless Chrome 里跑起来，
// 并在「模块赋值 wallpaperPropertyListener 的瞬间」灌入属性，使主题从第一帧生效
// （否则原实现的颜色 lerp 是 0.05/帧，软光栅下要几十秒才收敛）。
//
//   node tools/ref-shot.mjs --out out/ref-gold --theme golden-hour --shots 3
//   node tools/ref-shot.mjs --out out/ref-idle --stim silence --interval 600 --shots 6
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const REF = "E:\\steam\\steamapps\\workshop\\content\\431960\\3747222633";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = resolve(arg("out", join(ROOT, "out", "ref")));
const W = Number(arg("w", "1280"));
const H = Number(arg("h", "720"));
const WARM = Number(arg("secs", "6"));
const SHOTS = Number(arg("shots", "3"));
const INTERVAL = Number(arg("interval", "0"));
const STIM = arg("stim", "ref");
const THEME = arg("theme", "");
const LIGHT = arg("light", "0") === "1";
const GRID = arg("grid", "");
const PORT = Number(arg("port", "4422"));
const CDP_PORT = Number(arg("cdp", "9422"));
const PROFILE = resolve(arg("profile", join(process.env.TEMP || "/tmp", `st-ref-${process.pid}`)));

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
			} else if (msg.method) this.events.push(msg);
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

const PROPS = {};
if (THEME) PROPS.theme = { value: THEME };
if (LIGHT) PROPS.lightMode = { value: true };
if (GRID) PROPS.gridSize = { value: Number(GRID) };

const SHIM = `
window.__frames = 0;
window.wallpaperReady = function(){ window.__ready = true; };
window.wallpaperRegisterAudioListener = function(cb){ window.__audioCb = cb; };
window.wallpaperPropertyListener = { applyUserProperties: function(){} };
window.__props = ${JSON.stringify(PROPS)};
// 拦截模块对 wallpaperPropertyListener 的赋值：赋值即调用，属性进入 pending，
// React 挂载后第一帧就拿到目标主题。
(function(){
  var real = window.wallpaperPropertyListener;
  Object.defineProperty(window, 'wallpaperPropertyListener', {
    configurable: true,
    get: function(){ return real; },
    set: function(v){
      real = v;
      if (v && v.applyUserProperties && Object.keys(window.__props).length) {
        try { v.applyUserProperties(window.__props); } catch(e) { window.__propErr = String(e); }
      }
    }
  });
  window.__wallpaperPropertyListener = real;
})();
window.__beat = { phase: 0, peaks: 0, lastPeakFrame: -1 };
(function drive(){
  var t0 = performance.now();
  var N = 128, arr = new Array(N);
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
    if (phase < window.__beat.phase) { window.__beat.peaks++; window.__beat.lastPeakFrame = window.__frames; }
    window.__beat.phase = phase;
    if (window.__stimOff) { arr.fill(0); }
    else spectrum(t, phase);
    if (window.__audioCb) { window.__audioCb(arr); window.__frames++; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
`;

(async () => {
	mkdirSync(OUT, { recursive: true });
	const server = spawn("python", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
		cwd: REF, stdio: "ignore",
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
			width: W, height: H, deviceScaleFactor: 1, mobile: false,
		});
		await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
		await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });

		for (let i = 0; i < 120; i++) {
			await sleep(400);
			const r = await cdp.send("Runtime.evaluate", {
				expression: "({cb:!!window.__audioCb, f:window.__frames||0, ready:!!window.__ready, err:window.__propErr||null})",
				returnByValue: true,
			});
			if (r.result.value && r.result.value.cb && r.result.value.f > 8) {
				console.log("属性已注入:", JSON.stringify(PROPS), "err:", r.result.value.err);
				break;
			}
			if (i === 119) console.log("⚠ 音频回调未注册", JSON.stringify(r.result.value));
		}
		if (STIM === "silence") {
			await cdp.send("Runtime.evaluate", { expression: "window.__stimOff = true;" });
		}

		const read = async () => {
			const r = await cdp.send("Runtime.evaluate", {
				expression: "({f:window.__frames||0, phase:window.__beat.phase, peaks:window.__beat.peaks, peakFrame:window.__beat.lastPeakFrame})",
				returnByValue: true,
			});
			return r.result.value;
		};
		const w0 = await read();
		const wall0 = Date.now();
		await sleep(WARM * 1000);
		const w1 = await read();
		const fps = (w1 && w0 ? w1.f - w0.f : 0) / ((Date.now() - wall0) / 1000);
		console.log(`热身 ${WARM}s，参照帧率 ≈ ${fps.toFixed(1)} fps`);

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
					if (st && st.peaks > basePeaks && st.phase < 0.18 && st.f >= st.peakFrame + 1) {
						hit = true;
						break;
					}
					await sleep(8);
				}
			}
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			const name = `ref-${s}.png`;
			writeFileSync(join(OUT, name), Buffer.from(shot.data, "base64"));
			states.push({ shot: name, hit, ...st });
			console.log(`${name} ${hit ? "命中" : "未命中"} phase=${st && st.phase != null ? st.phase.toFixed(3) : "?"}`);
			if (INTERVAL <= 0) await sleep(220);
		}
		writeFileSync(join(OUT, "states.json"), JSON.stringify(states, null, 2));
		console.log("输出目录:", OUT);
		ws.close();
	} catch (e) {
		console.error("失败:", e.message);
		process.exitCode = 1;
	} finally {
		cleanup();
	}
})();
