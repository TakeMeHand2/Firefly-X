// 逐帧抓取器：headless Chrome + CDP，把每个刺激场景跑一遍并落盘。
//
//   node tools/mvz-lab/capture.mjs --out tools/mvz-lab/out/base --grid 64
//
// 每个场景独立开一个 target（等于一次全新页面加载），跑完立刻取回
// __mvzProbe.dump()。数据是「帧号 / 时间 / 亮度 / 帧哈希 / 频段」，
// 分析器只认这些数字，不认任何注释。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = resolve(process.cwd());
const DIST = join(ROOT, "dist");

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OUT = resolve(arg("out", join(ROOT, "tools/mvz-lab/out/base")));
const GRID = arg("grid", "64");
const W = Number(arg("w", "1280"));
const H = Number(arg("h", "720"));
const SERVE_PORT = Number(arg("port", "4411"));
const CDP_PORT = Number(arg("cdp", "9411"));
const ONLY = arg("only", "");

// 场景矩阵：注入信号是已知函数，所以「输出应该长什么样」可以事先推导。
// 每个场景回答一个具体问题，不为了多而多。
const SCENARIOS = [
	{ name: "silence", stim: "silence", q: "无信号时地形是否退化成死板" },
	{ name: "impulse", stim: "impulse", q: "阶跃：上升时间、过冲、衰减" },
	{ name: "step_sub", stim: "step0", q: "第 0 段（40-190Hz）稳态增益" },
	{ name: "step_air", stim: "step7", q: "第 7 段（7.8-11kHz）稳态增益" },
	{ name: "sweep_sub", stim: "sweep0", q: "第 0 段传递曲线与上限" },
	{ name: "sweep_mid", stim: "sweep3", q: "第 3 段传递曲线与上限" },
	{ name: "sweep_air", stim: "sweep7", q: "第 7 段传递曲线与上限" },
	{ name: "oldbin_sub", stim: "oldbin0", q: "旧顺序：第 0 段可达上限" },
	{ name: "oldbin_mid", stim: "oldbin3", q: "旧顺序：第 3 段可达上限" },
	{ name: "oldbin_air", stim: "oldbin7", q: "旧顺序：第 7 段可达上限" },
	{ name: "bin_sub", stim: "bin0", q: "现顺序：第 0 段可达上限" },
	{ name: "bin_mid", stim: "bin3", q: "现顺序：第 3 段可达上限" },
	{ name: "bin_air", stim: "bin7", q: "现顺序：第 7 段可达上限" },
	{ name: "flash20", stim: "flash2.0", q: "2.0Hz 脉冲下的实际闪烁" },
	{ name: "flash32", stim: "flash3.2", q: "3.2Hz 脉冲下的实际闪烁" },
	{ name: "fourfloor", stim: "fourfloor", q: "128BPM 四踩：端到端形态" },
	{ name: "live", stim: "", live: true, q: "真实曲目：整条真实链路的反应度" }
];

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

async function openTarget(base) {
	const res = await fetch(`${base}/json/new?about:blank`, { method: "PUT" });
	const target = await res.json();
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((ok, fail) => {
		ws.addEventListener("open", ok, { once: true });
		ws.addEventListener("error", fail, { once: true });
	});
	return { id: target.id, cdp: new CDP(ws), ws };
}

async function evaluate(cdp, expression, timeout = 30000) {
	const r = await cdp.send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
		timeout
	});
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
	return r.result.value;
}

async function runScenario(base, sc) {
	const url = sc.live
		? `http://127.0.0.1:${SERVE_PORT}/?mvz=1&rm=0&fixed=1&rec=1&seed=7&live=1&grid=${GRID}`
		: `http://127.0.0.1:${SERVE_PORT}/?mvz=1&rm=0&fixed=1&rec=1&seed=7` +
			`&stim=${encodeURIComponent(sc.stim)}&grid=${GRID}`;
	const { cdp, ws, id } = await openTarget(base);
	const t0 = Date.now();
	try {
		await cdp.send("Page.enable");
		await cdp.send("Runtime.enable");
		await cdp.send("Emulation.setDeviceMetricsOverride", {
			width: W, height: H, deviceScaleFactor: 1, mobile: false
		});
		await cdp.send("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
		});
		await cdp.send("Page.navigate", { url });

		// 等场景跑完（固定步长下由帧数决定，不依赖墙钟）
		let frames = 0;
		let ready = false;
		for (let i = 0; i < 1600; i++) {
			await sleep(250);
			const st = await evaluate(
				cdp,
				"(()=>{const p=window.__mvzProbe;return p?{d:p.done,n:p.dump().length,m:p.mode(),t:p.elapsed()}:null})()"
			).catch(() => null);
			if (st) {
				frames = st.n;
				if (st.d) { ready = true; break; }
			}
			if (Date.now() - t0 > 300000) break;
		}

		const payload = await evaluate(cdp, "window.__mvzProbe ? window.__mvzProbe.dump() : []");
		const mode = await evaluate(cdp, "window.__mvzProbe ? window.__mvzProbe.mode() : 'none'");
		let shot = null;
		try {
			const r = await cdp.send("Page.captureScreenshot", { format: "png" });
			shot = r.data;
		} catch {}

		return {
			meta: {
				scenario: sc.name, stim: sc.stim, question: sc.q,
				seed: 7, grid: Number(GRID), size: [W, H],
				ready, frames: payload.length, recMode: mode,
				wallMs: Date.now() - t0
			},
			rows: payload,
			shot
		};
	} finally {
		try { ws.close(); } catch {}
		fetch(`${base}/json/close/${id}`).catch(() => {});
	}
}

(async () => {
	if (!existsSync(DIST)) {
		console.error("dist 不存在，先 npx astro build");
		process.exit(1);
	}
	mkdirSync(OUT, { recursive: true });

	const server = spawn("python", ["-m", "http.server", String(SERVE_PORT), "--bind", "127.0.0.1"], {
		cwd: DIST, stdio: "ignore"
	});
	const userDir = join(ROOT, ".workbuddy/tmp/mvz-chrome");
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
		const list = ONLY ? SCENARIOS.filter((s) => ONLY.split(",").includes(s.name)) : SCENARIOS;

		for (const sc of list) {
			process.stdout.write(`→ ${sc.name} (${sc.stim}) ... `);
			const r = await runScenario(base, sc);
			writeFileSync(
				join(OUT, `${sc.name}.json`),
				JSON.stringify({ meta: r.meta, rows: r.rows })
			);
			if (r.shot) writeFileSync(join(OUT, `${sc.name}.png`), Buffer.from(r.shot, "base64"));
			console.log(
				`${r.meta.frames} 帧 / ${r.meta.wallMs}ms / rec=${r.meta.recMode}` +
				(r.meta.ready ? "" : " ⚠未跑完")
			);
		}
		console.log(`\n输出目录 ${OUT}`);
	} catch (e) {
		console.error("失败:", e.message);
		process.exitCode = 1;
	} finally {
		cleanup();
	}
})();
