/**
 * Twikoo 自托管服务入口（Node + Express）
 *
 * 设计要点：
 * - 复用官方 @twikoojs/common 的业务逻辑与 pipeline，只实现 request/response 两个端口。
 * - 存储使用 LokiDatabase（单文件持久化），避免依赖 Docker / MongoDB。
 * - 后续迁移到 MongoDB 时，只需把 database 换成 new MongoDatabase({ uri })。
 */
import path from "node:path";
import fs from "node:fs";
import express from "express";
import {
	createHandler,
	scaffoldAdapters,
	LokiDatabase,
	FULL_CAPABILITIES,
} from "@twikoojs/common";

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.TWIKOO_DATA || path.resolve("data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const database = new LokiDatabase({ dataDir: DATA_DIR });

const requestPort = {
	toTkRequest(raw) {
		const headers = {};
		for (const [k, v] of Object.entries(raw.headers || {})) {
			headers[k.toLowerCase()] = Array.isArray(v) ? v.join(",") : String(v);
		}
		return {
			method: String(raw.method || "POST").toUpperCase(),
			path: raw.path || "/",
			query: raw.query || {},
			body: raw.body || {},
			headers,
			ip: raw.ip || "",
			raw,
		};
	},
};

const responsePort = {
	fromTkResponse(response) {
		return response;
	},
};

const handler = createHandler(
	scaffoldAdapters({
		request: requestPort,
		response: responsePort,
		database,
		capabilities: FULL_CAPABILITIES,
	}),
);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
	res.json({ ok: true, dataDir: DATA_DIR, ts: Date.now() });
});

app.use(async (req, res) => {
	const forwarded = String(req.headers["x-forwarded-for"] || "");
	const ip =
		forwarded.split(",")[0].trim() ||
		req.socket.remoteAddress ||
		"";

	try {
		const tkRequest = requestPort.toTkRequest({
			method: req.method,
			path: req.path,
			query: req.query,
			body: req.body,
			headers: req.headers,
			ip,
		});
		const out = responsePort.fromTkResponse(await handler(tkRequest));
		for (const [k, v] of Object.entries(out.headers || {})) {
			res.setHeader(k, v);
		}
		res.status(out.status || 200).json(out.body ?? {});
	} catch (err) {
		console.error("[twikoo] request failed:", err);
		res.status(500).json({ code: 500, message: String(err?.message || err) });
	}
});

app.listen(PORT, () => {
	console.log(`[twikoo] listening on http://127.0.0.1:${PORT}`);
	console.log(`[twikoo] data dir: ${DATA_DIR}`);
});
