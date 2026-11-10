# 博客评论系统接入方案

> 适用仓库：`D:/Firefly-X`（Astro 7 + Firefly 主题）
> 结论摘要：主题已内置 5 套评论组件，`src/config/commentConfig.ts` 的 `type` 目前为 `"none"`。推荐优先启用 **Giscus**（零运维、配置已预填），若面向中国大陆读者且要求稳定与访问量统计，则改用 **Twikoo（腾讯云开发 CloudBase）**。

---

## 一、现状盘点

| 事实 | 位置 | 影响 |
| --- | --- | --- |
| 内置 5 种评论实现 | `src/components/comment/{Giscus,Twikoo,Waline,Artalk,Disqus}.astro` | 无需新增前端代码，改配置即可切换 |
| 当前未启用 | `commentConfig.type: "none"` | 文章页不渲染评论区 |
| Giscus 参数已预填 | `repo: TakeMeHand2/Firefly-X`、`repoId`、`categoryId` | 只需开启仓库 Discussions + 安装 App |
| 仓库 Discussions 未开启 | GitHub API `has_discussions: false` | Giscus 无法工作，必须先开 |
| 文章级开关已存在 | posts schema `comment: boolean`（默认 `true`） | 单篇可关闭评论 |
| 组件按需加载 | Giscus 使用官方 Web Component + `loading=lazy` | 不引入 NPM 依赖，不阻塞首屏 |

---

## 二、候选方案对比

| 维度 | Giscus | Twikoo | Waline | Artalk | Disqus | 自建（EdgeOne KV/Blob） |
| --- | --- | --- | --- | --- | --- | --- |
| 存储位置 | GitHub Discussions | MongoDB / CloudBase | 自有数据库 | SQLite/MySQL/PostgreSQL | Disqus 云 | EdgeOne KV + Blob |
| 账号门槛 | GitHub 账号 | 无（可选匿名） | 无（可选匿名） | 无（可选匿名） | 需注册 | 需自行实现 |
| 部署形态 | 纯静态 + 第三方 SaaS | Serverless 函数 | Node 服务 + DB | Go 单二进制 | 纯 SaaS | Edge Functions |
| 运维成本 | 极低 | 低 | 中 | 中 | 极低 | 高（要写 CRUD、鉴权、反垃圾） |
| 国内可达性 | 一般（`giscus.app` 间歇不稳） | 好（CloudBase 国内节点） | 取决于部署地（Vercel 默认域名不可用） | 取决于服务器 | 差（基本不可用） | 好 |
| 访问量统计 | 无 | 有 | 有 | 有 | 无 | 需自建 |
| 反垃圾 | GitHub 账号天然过滤 | 内置 + 可接 Akismet | 内置 + 审核 | 内置 + 审核 | 内置 | 需自建 |
| 数据归属 | GitHub（境外） | 自有 | 自有 | 自有 | 第三方 | 自有 |
| 成本 | 免费 | 免费额度内 | 免费（自备服务器/DB） | 免费（自备服务器） | 免费（含广告） | 按量 |
| 适合场景 | 技术博客、读者有 GitHub | 中文个人博客 | 中小社区 | 有服务器、要完全自控 | 不推荐 | 有强定制需求 |

---

## 三、选型建议

### 首选：Giscus

理由：
1. **改一行配置即可上线**。`repoId`、`categoryId` 已填好，只差开启 Discussions 与安装 App。
2. **零后端**。评论以 Discussion 形式存在仓库里，天然有版本记录、可搜索、可迁移。
3. **与读者画像匹配**。技术类博客的读者大概率有 GitHub 账号，登录摩擦可接受。
4. **无 AD、无追踪脚本**，对页面性能影响可控（iframe 懒加载）。

不适用的情况：读者以非技术人群为主（要求注册 GitHub 会显著降低评论率），或站点主要受众在中国大陆且无法接受间歇性加载失败。

### 次选：Twikoo（腾讯云开发 CloudBase）

理由：国内节点、支持匿名评论、自带管理面板与访问量统计、免费额度够个人博客用。代价是需要开通云开发环境并部署云函数，属于「一次性 30 分钟」的投入。

### 不建议：Disqus

国内基本不可达，且会注入广告与追踪脚本，与独立博客的定位冲突。

### 暂不建议：自建评论

用 EdgeOne KV/Blob 自建意味着要自行实现分页、审核、验证码、防刷、XSS 过滤与迁移方案。除有强定制需求，投入产出比不成立。

---

## 四、接入步骤

### 4.1 Giscus（推荐，约 10 分钟）

1. **开启 Discussions**
   仓库 → Settings → General → Features → 勾选 `Discussions`。

2. **安装 giscus App**
   访问 <https://github.com/apps/giscus>，Install，仅授权 `TakeMeHand2/Firefly-X`。

3. **准备分类**
   仓库 Discussions → 新建分类（建议 `Comments`，类型选 `Announcements`，仅维护者可发起讨论，避免读者误建）。

4. **核对 ID**
   打开 <https://giscus.app/zh-CN>，填入仓库名，页面会给出 `data-repo-id` 与 `data-category-id`。**以该页面输出的值为准**，与 `commentConfig.ts` 中现值比对；若不一致必须替换，否则评论区空白且无报错。

5. **修改配置** `src/config/commentConfig.ts`
   ```ts
   type: "giscus",
   giscus: {
     repo: "TakeMeHand2/Firefly-X",
     repoId: "R_kgD2gfdFGd",        // 以 giscus.app 输出为准
     category: "Comments",
     categoryId: "DIC_kwDOKy9HOc4CegmW", // 同上
     mapping: "pathname",           // 比 title 稳定：改标题不丢评论
     strict: "1",                   // 仅精确匹配，避免误连到无关讨论
     reactionsEnabled: "1",
     emitMetadata: "0",
     inputPosition: "top",
     lang: "zh-CN",
     loading: "lazy",
   }
   ```

   `mapping` 取舍：`title` 可读性好，但文章改标题会产生新讨论、旧评论「消失」；`pathname` 与 URL 绑定，改标题不受影响，改 slug 才会断。博客场景推荐 `pathname`。

6. **本地验证**
   ```bash
   pnpm dev
   # 打开 http://localhost:4321/posts/<slug>/ ，确认评论框渲染
   pnpm build
   ```

7. **国内可达性优化（可选）**
   `giscus.app` 在中国大陆访问不稳定。两种缓解方式：
   - 用 Cloudflare 反向代理 `giscus.app` 与 `api.github.com`，把配置里的脚本源指向自有域名；
   - 或改用自托管 giscus 前端实例。
   两种方式都需要自有域名，属于部署后优化项，不影响首次接入。

### 4.2 Twikoo（国内优先，约 30 分钟）

1. 开通腾讯云开发 CloudBase 环境（按量计费，有免费额度，以官网为准）。
2. 在 CloudBase 云函数中部署 Twikoo（官方提供一键部署模板）。
3. 记录环境 ID，填入 `commentConfig.ts`：
   ```ts
   type: "twikoo",
   twikoo: {
     envId: "https://<你的环境ID>.service.tcloudbase.com", // 或 CloudBase 提供的访问地址
     lang: "zh-CN",
     visitorCount: true,
     jsUrl: "https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.min.js",
     cssUrl: "/assets/css/twikoo-custom.css",
   }
   ```
   `jsUrl` 用国内镜像（配置文件注释里已给出两个候选），避免 jsDelivr 在境内不稳定。
4. 首次访问 `/admin` 设置管理员密码，之后每条评论可在面板审核、删除、导出。
5. 验证同上：本地 `pnpm dev` 发表测试评论 → 后台确认收到 → `pnpm build`。

### 4.3 通用改造点（两种方案都适用）

- **文章级开关**：frontmatter 写 `comment: false` 可关闭单篇评论（schema 已支持）。
- **锚点**：「返回评论」按钮 `src/components/controls/BackToComment.astro` 依赖 `#post-comments`，切换方案后无需改动。
- **深色模式**：Giscus 通过 `theme` 属性切换；Twikoo/Waline 由 CSS 变量接管，需在自定义 CSS 中补深色规则。
- **性能**：三种方案都应保持 `loading=lazy`，避免第三方 iframe 拖累 LCP。

---

## 五、验收清单

- [ ] 未登录访客能正常看到评论区，不出现空白 iframe
- [ ] 发表一条评论，刷新后仍在，且归属到正确的文章
- [ ] 相邻两篇文章评论互不串号（重点验证 `mapping` 是否正确）
- [ ] 移动端宽度下不横向溢出
- [ ] 深色 / 浅色主题切换后评论框配色正常
- [ ] 含 `<script>` 的评论被正确转义（XSS）
- [ ] `pnpm build` 通过，`dist` 中文章页包含评论容器
- [ ] 关闭单篇 `comment: false` 后该页不渲染评论区

---

## 六、风险与合规

1. **UGC 审核义务**：评论属于用户生成内容，境内站点需具备删除、屏蔽、举报能力，并保留日志。Giscus 的删除入口在 GitHub，对普通访客不直观，但站点方仍可通过仓库管理。
2. **数据出境**：Giscus 的评论数据存储于 GitHub（境外）。若站点面向境内公众且涉及备案，需评估这一点的合规影响；Twikoo/Waline 自持数据可规避。
3. **账号门槛**：Giscus 要求 GitHub 登录，会显著降低非技术读者的评论意愿。若评论量是核心指标，应直接选 Twikoo。
4. **第三方可用性**：`giscus.app` 在境内存在间歇性不可达，属于外部依赖风险，无法通过本站代码消除，只能反代或换方案。
