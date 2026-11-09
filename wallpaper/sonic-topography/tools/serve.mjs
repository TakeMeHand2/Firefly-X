// 零依赖静态服务器。用法：node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || 5178);

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url || "/", "http://127.0.0.1");
		let p = decodeURIComponent(url.pathname);
		if (p === "/") p = "/index.html";
		const file = normalize(join(ROOT, p));
		if (!file.startsWith(ROOT)) {
			res.writeHead(403).end("forbidden");
			return;
		}
		const st = await stat(file).catch(() => null);
		if (!st || !st.isFile()) {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
			return;
		}
		const body = await readFile(file);
		res.writeHead(200, {
			"content-type": MIME[extname(file)] || "application/octet-stream",
			"cache-control": "no-store",
		});
		res.end(body);
	} catch (e) {
		res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String(e));
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`音域回响 → http://127.0.0.1:${PORT}/`);
	console.log(`参数直达 → http://127.0.0.1:${PORT}/?panel=1&stats=1`);
});
