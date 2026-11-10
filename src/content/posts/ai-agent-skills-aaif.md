---
title: 把标准交出去：Agent Skills 捐给 AAIF，与 Agent 基础设施的“中立化”
published: 2026-11-10
description: 10 月 22 日，Anthropic 把 Agent Skills 的商标、GitHub 组织与域名交给 Linux 基金会旗下的 AAIF。同一天，OpenAI、Hugging Face、阿里也各交出一件东西。
tags: [AI, 智能体, Agent Skills, AAIF, 开放标准]
category: AI
lang: zh-CN
image: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/5681-M15hrscD9QHN.jpg"
---

2026 年 10 月 22 日，Anthropic 宣布把 Agent Skills 开放标准捐赠给 Linux 基金会旗下的 Agentic AI Foundation（AAIF）。捐赠范围包括标准的名称与标识、GitHub 组织，以及 agentskills.io 域名。

这件事的技术含量不高，制度含量很高。

## 一个技能，就是一个文件夹

Agent Skills 的形态刻意做得极简：一个文件夹，核心是一份 `SKILL.md`，用来教智能体完成某类具体任务，再附上需要的脚本与参考资料。

它源自 Claude Code 的开发经验。2025 年 10 月上线后，开发者几周内自发写出数千个技能，并为 Codex、Cursor 等工具做了加载器；同年 12 月，Anthropic 将其定为开放标准，放到独立的 GitHub 组织与域名下。

按照 Anthropic 自己公布的数字：超过 70 个智能体平台完成接入（包括 ChatGPT、Cursor、GitHub Copilot、VS Code），社区累计发布约 100 万个技能，安装量接近 2.8 亿次。

**需要标注的是**：上述三项数据均来自 Anthropic 单方口径，截至发稿未见独立核实。作为对比，MCP 在捐给同一基金会后十个月内积累了 1 万多个服务器——那个数字有较广泛的第三方观测支撑。

## 同一天，四件东西换了主人

AAIF 在 10 月 22 日一次性新增四个托管项目：

| 项目 | 贡献方 | 对应层次 |
| --- | --- | --- |
| Agent Skills | Anthropic | 技能封装 |
| Open Responses | OpenAI | 多厂商模型接口 |
| OpenEnv | Hugging Face | 强化学习环境 |
| OpenSandbox | 阿里巴巴 | 智能体安全执行 |

基金会项目总数从成立首年的 3 个增至 10 个。AAIF 本身由 Anthropic、Block 与 OpenAI 于 2025 年共同创立；此前 MCP 已捐入同一基金会。

维护结构也已明确：由来自 Anthropic、Google、OpenAI 等公司的工程师以**个人身份**参与维护，David Soria Parra 与 Mahesh Murag 为首席维护者。

## 捐的是治理权，不是产品

这个区别很关键。Anthropic 交出去的是标准名称、标识、GitHub 组织与域名；留在手里的是 Claude Code 的智能体实现，以及 Anthropic 自建的技能。**标准转移，产品不转移。**

这套打法此前已经用过一次：把 MCP 捐给 AAIF 后，MCP 成为跨厂商的连接事实标准，包括直接竞争对手在内的产品都在用。逻辑并不复杂——标准的中立性降低采用门槛，采用门槛降低带来更多智能体，更多智能体带来更多推理调用，而 Anthropic 的生意是卖推理，不是管标准。

对已有技能库的团队，短期没有迁移成本：`SKILL.md` 完全向后兼容，不加入 AAIF 也可以继续使用和贡献。变化在于流程——议题与提案转到 AAIF 的 GitHub，基金会提出的路线图包括版本化发布、正式提案流程（思路接近 Python 的 PEP），以及面向技能作者与使用者的安全指南。

**需要保留的怀疑**：上述路线图目前是 Anthropic 提出的建议，尚未见到 AAIF 或 Linux 基金会对其正式背书；捐赠本身也只有 Anthropic 单方公告为源。

## 真正的风险在供应链，不在标准

技能可以包含可执行脚本，而安装量已接近 2.8 亿次（Anthropic 口径）。这意味着一个被忽略的事实：**安装一个来路不明的技能，等于让智能体照着陌生人的说明书和脚本办事。**

这不是理论风险。技能的加载机制决定了它天然具备较高权限——读文件、跑命令、访问网络。基金会把“安全指南”列入路线图，方向是对的，但指南是建议，不是沙箱。

对此更务实的判断是：标准中立化解决了“会不会被单一厂商卡住”的问题，没有解决“这个技能能不能信”的问题。前者靠治理，后者只能靠审计。

## 结语

把 Agent Skills、Open Responses、OpenEnv、OpenSandbox 放在一起看，2026 年的智能体生态正在重复互联网早期的路径：先由单一厂商做出可用原型，再通过捐赠换取跨厂商采用，最后由基金会承担治理成本。

对开发者而言，短期收益是确定的——同一份技能在更多平台可用；长期风险也是确定的——权限边界仍在标准之外。这两件事同时成立，不矛盾。

---

**资料来源**：Anthropic 官方公告（2026-10-22）、AAIF / Linux 基金会项目清单、AIMag 对捐赠范围的核对报道、Web Pulse 对四项捐赠的分析。

**配图**：`https://s4.anilist.co/file/anilistcdn/media/anime/banner/5681-M15hrscD9QHN.jpg`（动画电影《夏日大作战》官方视觉图，主题借图；版权归原权利方）
