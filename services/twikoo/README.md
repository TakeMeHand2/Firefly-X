# Twikoo 自托管后端

为本站提供 Twikoo 评论服务。**不依赖 Docker，也不依赖 MongoDB**：业务逻辑复用官方 `@twikoojs/common`，存储使用其内置的 `LokiDatabase`（单文件持久化）。

## 运行

```bash
# 在仓库根目录
pnpm comments
# 或在当前目录
pnpm start
```

默认监听 `127.0.0.1:8080`，数据写入 `services/twikoo/data/db.json`。

环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `TWIKOO_DATA` | `./data` | 数据目录 |

健康检查：`GET /healthz`。

## 与博客的对接

`src/config/commentConfig.ts`：

```ts
type: "twikoo",
twikoo: {
  envId: "http://127.0.0.1:8080", // 换成公网地址
  jsUrl: "https://registry.npmmirror.com/twikoo/2.0.17/files/dist/twikoo.min.js",
}
```

前端 `jsUrl` 的版本需与服务端 `@twikoojs/common` 主版本对齐（当前均为 2.0.17），
否则客户端会触发版本校验并提示升级云函数。

## 部署到公网时的三个必做项

1. **换 `envId`**：改成公网可访问的 HTTPS 地址（云函数 / VPS / 容器均可）。
2. **放通跨域**：本服务默认仅放行 `localhost` 来源。上线前需在 Twikoo 管理面板
   的「安全 → 允许的源」中填入站点域名（如 `https://954555.xyz`），
   否则浏览器会拦截 `POST`。
3. **持久化数据目录**：容器化部署时把 `data/` 挂到卷上，或把 `LokiDatabase`
   换成 `MongoDatabase({ uri })`——后者只需改 `server.mjs` 的 `database` 一行。

## 实现说明

`server.mjs` 只做了三件事：

- 把 Express 的请求归一化成 `TkRequest`（`requestPort.toTkRequest`）；
- 把内部 `TkResponse` 原样落回 HTTP 响应（`responsePort.fromTkResponse`）；
- 用 `scaffoldAdapters` 把数据库、能力声明装配成 `createHandler` 所需的适配器集合。

Twikoo 的鉴权、限流、XSS 过滤、验证码、垃圾检测等逻辑都在公共库里，未做任何改写。

## 已知边界

- 单进程、单文件存储，适合个人博客；多实例并发写同一 `db.json` 会冲突。
- 未启用邮件通知与图片上传（需要额外配置 SMTP / 图床能力）。
- 公网部署前必须完成上文的跨域配置，否则前端报网络错误且无明确提示。
