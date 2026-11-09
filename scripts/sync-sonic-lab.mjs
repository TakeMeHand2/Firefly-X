// 把独立复刻的运行时镜像到 public/lab/sonic-topography/。
// 组件只通过同源 iframe 加载它；源仍是 wallpaper/sonic-topography/，
// 这里不复制 tools/docs，避免把测量台带进站点产物。
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = resolve(ROOT, "wallpaper/sonic-topography");
const DST = resolve(ROOT, "public/lab/sonic-topography");

if (!existsSync(SRC)) {
	console.error("[sync-sonic] 源目录不存在:", SRC);
	process.exit(1);
}

rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });
for (const item of ["index.html", "styles.css", "src", "assets"]) {
	const from = resolve(SRC, item);
	if (existsSync(from)) cpSync(from, resolve(DST, item), { recursive: true });
}
console.log("[sync-sonic] 已镜像到 public/lab/sonic-topography/");
