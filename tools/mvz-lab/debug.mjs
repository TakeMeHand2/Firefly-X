// 一次性诊断：确认 rec 为何没启用、WebGL 版本、遮罩矩形。
import { spawn } from "node:child_process";
import net from "node:net";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const ROOT = resolve(process.cwd());
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SERVE = 4412, CDP = 9412;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPort(p) {
	for (let i = 0; i < 100; i++) {
		const ok = await new Promise((res) => {
			const s = net.connect(p, "127.0.0.1");
			s.once("connect", () => { s.destroy(); res(true); });
			s.once("error", () => res(false));
		});
		if (ok) return true;
		await sleep(150);
	}
	return false;
}

const server = spawn("python", ["-m", "http.server", String(SERVE), "--bind", "127.0.0.1"], {
	cwd: join(ROOT, "dist"), stdio: "ignore"
});
const userDir = join(ROOT, ".workbuddy/tmp/mvz-chrome2");
mkdirSync(userDir, { recursive: true });
const chrome = spawn(CHROME, [
	"--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${userDir}`,
	"--no-first-run", "--no-proxy-server", "--hide-scrollbars", "--mute-audio",
	"--use-angle=swiftshader", "--enable-unsafe-swiftshader",
	"--window-size=1280,720", "about:blank"
], { stdio: "ignore" });

try {
	await waitPort(SERVE); await waitPort(CDP);
	const base = `http://127.0.0.1:${CDP}`;
	const t = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	await new Promise((r) => ws.addEventListener("open", r, { once: true }));
	let id = 0; const pend = new Map();
	ws.addEventListener("message", (e) => {
		const m = JSON.parse(e.data);
		if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
	});
	const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
	const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.value;

	await send("Page.enable"); await send("Runtime.enable");
	await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
	await send("Page.navigate", { url: `http://127.0.0.1:${SERVE}/?mvz=1&rm=0&fixed=1&rec=1&seed=7&stim=silence&grid=64` });
	await sleep(6000);

	console.log(await ev(`(()=>{
		const p = window.__mvzProbe;
		const cvs = [...document.querySelectorAll('canvas')];
		return JSON.stringify({
			rec: p && p.rec,
			mode: p && p.mode(),
			err: window.__recErr || null,
			why: window.__recWhy || null,
			why: window.__recWhy || null,
			elapsed: p && p.elapsed(),
			frames: p && p.dump().length,
			canvases: cvs.map(c=>({cls:c.className, w:c.width, h:c.height, gl2: !!c.getContext('webgl2')})),
			search: location.search
		}, null, 1);
	})()`));

	console.log(await ev(`(()=>{
		try{
			const c=document.querySelector('.mvz-gl');
			const g=c.getContext('webgl2');
			const tex=g.createTexture();
			g.bindTexture(g.TEXTURE_2D,tex);
			g.texImage2D(g.TEXTURE_2D,0,g.RGBA,120,68,0,g.RGBA,g.UNSIGNED_BYTE,null);
			const fb=g.createFramebuffer();
			g.bindFramebuffer(g.FRAMEBUFFER,fb);
			g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,tex,0);
			const st=g.checkFramebufferStatus(g.FRAMEBUFFER);
			const err=g.getError();
			g.bindFramebuffer(g.FRAMEBUFFER,null);
			return JSON.stringify({status:st, complete:g.FRAMEBUFFER_COMPLETE, err, maxTex:g.getParameter(g.MAX_TEXTURE_SIZE)});
		}catch(e){return 'EX '+e.message}
	})()`));

	ws.close();
} finally {
	chrome.kill(); server.kill();
}
