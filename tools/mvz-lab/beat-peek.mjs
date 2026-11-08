// 拍点取景器：在节拍峰值时刻截图，而不是场景结束时刻。
//
//   node tools/mvz-lab/beat-peek.mjs --out tools/mvz-lab/out/peek --stim fourfloor
//
// 为什么不能用 capture.mjs 的末尾截图对比配色：四踩场景的收尾帧
// 大概率落在拍间低谷，峰顶色（琥珀）此刻本来就不该出现——
// 「中心不是琥珀」在这种帧上是正确的，不是 bug。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = resolve(process.cwd());
const DIST = join(ROOT, "dist");

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = resolve(arg("out", join(ROOT, "tools/mvz-lab/out/peek")));
const STIM = arg("stim", "fourfloor");
const GRID = arg("grid", "96");
const W = Number(arg("w", "1280"));
const H = Number(arg("h", "720"));
const SHOTS = Number(arg("shots", "3"));
// 强拍取景判据：默认沿用历史宽松阈值；--min-sub / --min-punch 可收紧，
// 专门抓「过曝的那一拍」，避免不同批次落在强弱不同的拍上。
const MIN_SUB = Number(arg("min-sub", "0.25"));
const MIN_PUNCH = Number(arg("min-punch", "0"));
// 收紧判据后强拍更稀疏，需放宽轮询上限（每次 120ms，默认 200=24s）。
const PATIENCE = Number(arg("patience", "200"));
// 透传任意额外查询串，如 --qs "punchGain=0&tailGain=0"（单变量 A/B）。
const EXTRA_QS = arg("qs", "");
// --fixed 打开 1/60 固定步长时钟，同一构建两次运行可逐帧对齐；
// 默认关闭，与历史截图保持同一取景条件。
const FIXED = arg("fixed", "0") !== "0";
const SERVE_PORT = Number(arg("port", "4413"));
const CDP_PORT = Number(arg("cdp", "9413"));
// 复用崩溃过的 profile 会触发 "Abnormal renderer termination"，
// 默认每次用全新目录；也可用 --profile 显式指定。
const PROFILE = resolve(arg("profile", join(ROOT, `.workbuddy/tmp/mvz-chrome-peek-${process.pid}`)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort(port, timeout = 20000) {
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
		ws.addEventListener("message", (ev) => {
			const msg = JSON.parse(ev.data);
			if (msg.id && this.pending.has(msg.id)) {
				const { ok, fail } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
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

async function evl(cdp, expression) {
	const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
	return r.result.value;
}

(async () => {
	mkdirSync(OUT, { recursive: true });
	const server = spawn("python", ["-m", "http.server", String(SERVE_PORT), "--bind", "127.0.0.1"], {
		cwd: DIST, stdio: "ignore"
	});
	const userDir = PROFILE;
	mkdirSync(userDir, { recursive: true });
	const chrome = spawn(CHROME, [
		"--headless=new",
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${userDir}`,
		"--no-first-run", "--no-default-browser-check",
		"--disable-extensions", "--hide-scrollbars", "--mute-audio",
		"--no-proxy-server",
		"--disable-background-timer-throttling",
		"--disable-renderer-backgrounding",
		"--disable-backgrounding-occluded-windows",
		"--autoplay-policy=no-user-gesture-required",
		"--use-angle=swiftshader",
		"--enable-unsafe-swiftshader",
		`--window-size=${W},${H}`,
		"about:blank"
	], { stdio: "ignore" });

	const cleanup = () => {
		try { chrome.kill(); } catch {}
		try { server.kill(); } catch {}
	};
	process.on("exit", cleanup);

	try {
		if (!(await waitPort(SERVE_PORT))) throw new Error("静态服务器未起来");
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
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: W, height: H, deviceScaleFactor: 1, mobile: false
		});
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
		});
		const url = `http://127.0.0.1:${SERVE_PORT}/?mvz=1&rm=0&seed=7&grid=${GRID}` +
			`&stim=${encodeURIComponent(STIM)}${FIXED ? "&fixed=1" : ""}` +
			(EXTRA_QS ? `&${EXTRA_QS}` : "");
		console.log("URL:", url);
		await cdp.send("Page.navigate", { url });

		// 等地形真的在动
		for (let i = 0; i < 160; i++) {
			await sleep(500);
			const st = await evl(cdp, "window.__mvzProbe ? window.__mvzProbe.state() : null").catch(() => null);
			if (st && st.bands && st.bands[0] > 0.05) break;
		}

		const states = [];
		for (let s = 0; s < SHOTS; s++) {
			// 等到一次拍点峰值
			let st = null;
			for (let i = 0; i < PATIENCE; i++) {
				st = await evl(cdp,
					"(()=>{const p=window.__mvzProbe;return p?{s:p.state(),b:p.beat()}:null})()"
				).catch(() => null);
				if (st && st.b.pulse > 0.5 && st.s.bands[0] > MIN_SUB &&
					st.s.punch > MIN_PUNCH) break;
				await sleep(120);
			}
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			const name = `beat-${s}.png`;
			writeFileSync(join(OUT, name), Buffer.from(shot.data, "base64"));
			states.push({ shot: name, state: st && st.s, beat: st && st.b });
			console.log(`${name}  warmth=${st ? st.s.warmth.toFixed(3) : "?"} ` +
				`sub=${st ? st.s.bands[0].toFixed(3) : "?"} punch=${st ? st.s.punch.toFixed(3) : "?"}`);
			await sleep(700);
		}
		writeFileSync(join(OUT, "states.json"), JSON.stringify(states, null, 2));
		ws.close();
		fetch(`${base}/json/close/${target.id}`).catch(() => {});
	} catch (e) {
		console.error("失败:", e.message);
		process.exitCode = 1;
	} finally {
		cleanup();
	}
})();
