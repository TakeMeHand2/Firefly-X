// 参照渲染器：让《音域回响》本体在 headless Chrome 里真正跑起来。
//
//   node tools/mvz-lab/ref-capture.mjs --out tools/mvz-lab/out/ref-beat --shots 3
//
// 壁纸是 web 型（React19 + R3F），只依赖三个宿主 API：
//   wallpaperRegisterAudioListener(cb)  ← 喂 128 长度的 0..1 频谱
//   wallpaperPropertyListener           ← 属性变更（用默认值即可）
//   wallpaperReady()
// 用 Page.addScriptToEvaluateOnNewDocument 在模块脚本之前注入 shim，
// 于是「配色到底长什么样」不再靠读代码推断，而是同一张图直接比。
//
// 注意：preview.gif 只有 50 帧 / 2 秒，全是空闲段，看不出强奏下的
// 峰顶色与暖度渐变。要验证这些，必须让它真的吃音频。
//
// ── 拍点对齐 ────────────────────────────────────────────────
// 旧版是「等固定 8 秒后截一帧」，而被测端 beat-peek.mjs 截的是拍点峰值帧，
// 两者不同口径：参照帧可能落在拍间低谷，峰顶琥珀此刻本来就不该出现。
// 现在 shim 暴露节拍相位与跨拍计数，CDP 检测到跨拍后滞后 1 帧再截图
// （壁纸阶跃 t90≈17ms，即 1 帧），多帧取样并记录每帧实际相位。
// 128 BPM → 拍间隔 468.75ms；CDP 轮询 8ms，跨拍窗口足够宽。
// 已知限制：CDP 截图不与 rAF 同步，仍有 1–2 帧抖动，绝对亮度只作量级参考。
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = resolve(process.cwd());
const REF = "E:\\steam\\steamapps\\workshop\\content\\431960\\3747222633";

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const OUT = resolve(arg("out", join(ROOT, "tools/mvz-lab/out/ref-beat")));
const W = Number(arg("w", "1280"));
const H = Number(arg("h", "720"));
// --secs 语义改为「热身秒数」：等 React 挂载与壁纸内部包络收敛。
const WARM = Number(arg("secs", "4"));
const SHOTS = Number(arg("shots", "3"));
// --interval MS > 0：连续取帧、不做跨拍判据，覆盖拍间低谷。
// 与 beat-peek --interval 同口径，用来比较「暖核在拍间是否还在」。
const INTERVAL = Number(arg("interval", "0"));
const SERVE_PORT = Number(arg("port", "4412"));
const CDP_PORT = Number(arg("cdp", "9412"));
const PROFILE = resolve(arg("profile", join(ROOT, `.workbuddy/tmp/mvz-chrome-ref-${process.pid}`)));

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

// 注入到页面最前面：WE 宿主 API + 已知刺激
const SHIM = `
window.wallpaperReady = function(){ window.__ready = true; };
window.wallpaperPropertyListener = { applyUserProperties: function(){} };
window.wallpaperRegisterAudioListener = function(cb){ window.__audioCb = cb; };
window.__frames = 0;
// 节拍相位与跨拍计数：被测端 beat-peek 用 probe.beat().pulse 判峰，
// 这里没有 probe，就用注入信号自身的相位（两者同源，都是 128 BPM 四踩）。
window.__beat = { phase: 0, peaks: 0, lastPeakFrame: -1 };
(function drive(){
  var t0 = performance.now();
  var N = 128;
  var arr = new Array(N);
  function spectrum(t, phase){
    // 128 BPM 四踩 + 音乐化频谱形态。phase≈0 即拍点，beat 在此取峰值 1。
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
      window.__beat.lastPeakFrame = window.__frames;
    }
    window.__beat.phase = phase;
    if (window.__audioCb) {
      window.__audioCb(spectrum(t, phase));
      window.__frames++;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
`;

(async () => {
	mkdirSync(OUT, { recursive: true });
	const server = spawn("python", ["-m", "http.server", String(SERVE_PORT), "--bind", "127.0.0.1"], {
		cwd: REF, stdio: "ignore"
	});
	// 复用崩溃过的 profile 会触发 "Abnormal renderer termination"，每次用新目录。
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
		await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
		await cdp.send("Page.navigate", { url: `http://127.0.0.1:${SERVE_PORT}/index.html` });

		// 等音频回调被注册（React 挂载完成）
		for (let i = 0; i < 120; i++) {
			await sleep(500);
			const r = await cdp.send("Runtime.evaluate", {
				expression: "({cb:!!window.__audioCb, f:window.__frames||0, ready:!!window.__ready})",
				returnByValue: true
			});
			const v = r.result.value;
			if (v && v.cb && v.f > 10) {
				console.log(`音频回调已注册，${v.f} 帧后进入计时`);
				break;
			}
			if (i === 119) console.log("⚠ 音频回调未注册，仍尝试截图", JSON.stringify(v));
		}
		const read = async () => {
			const r = await cdp.send("Runtime.evaluate", {
				expression: "({f:window.__frames||0, phase:window.__beat.phase, " +
					"peaks:window.__beat.peaks, peakFrame:window.__beat.lastPeakFrame, " +
					"ready:!!window.__ready})",
				returnByValue: true
			});
			return r.result.value;
		};
		// 量化软光栅帧率：若 rAF 远低于 60fps，壁纸内部按帧的平滑会失真，
		// 「拍点相位」只是输入相位，不能当作画面响应峰值的严格证据。
		const w0 = await read();
		const wall0 = Date.now();
		await sleep(WARM * 1000);
		const w1 = await read();
		const fps = (w1 && w0 ? w1.f - w0.f : 0) / ((Date.now() - wall0) / 1000);
		console.log(`热身期间渲染帧率 ≈ ${fps.toFixed(1)} fps（SwiftShader 软光栅）`);
		const states = [];
		for (let s = 0; s < SHOTS; s++) {
			const base = await read();
			const basePeaks = base && base.peaks ? base.peaks : 0;
			let st = base;
			let hit = false;
			if (INTERVAL > 0) {
				// 连续取帧：不做跨拍判据，覆盖拍间低谷。
				await sleep(INTERVAL);
				st = await read();
				hit = true;
			} else {
				// 等一次跨拍；要求相位仍在峰后 0.18 内（≈84ms），且壁纸已走完 1 帧。
				// 400×8ms=3.2s 覆盖 6 拍以上，CDP 轮询抖动也能命中。
				for (let i = 0; i < 400; i++) {
					st = await read();
					if (st && st.peaks > basePeaks && st.phase < 0.18 &&
						st.f >= st.peakFrame + 1) { hit = true; break; }
					await sleep(8);
				}
			}
			const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
			const name = `beat-${s}.png`;
			writeFileSync(join(OUT, name), Buffer.from(shot.data, "base64"));
			states.push({ shot: name, hit, ...st });
			console.log(`${name}  ${hit ? "命中" : "未命中"}  peaks=${st ? st.peaks : "?"} ` +
				`phase=${st && st.phase != null ? st.phase.toFixed(3) : "?"} ` +
				`frames=${st ? st.f : "?"}`);
			if (INTERVAL <= 0) await sleep(220);   // 拉开到下一拍之后，避免同一拍重复取景
		}
		writeFileSync(join(OUT, "states.json"), JSON.stringify(states, null, 2));
		console.log("截图与状态目录:", OUT);
		ws.close();
		fetch(`${base}/json/close/${target.id}`).catch(() => {});
	} catch (e) {
		console.error("失败:", e.message);
		process.exitCode = 1;
	} finally {
		cleanup();
	}
})();
