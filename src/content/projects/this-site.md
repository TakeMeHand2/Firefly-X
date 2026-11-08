---
title: "序号的小站"
slug: this-site
published: 2026-11-01
draft: false
order: 100
description: "本站源码。基于 Astro 与 Firefly 主题定制，静态生成，无需服务器。"
image: ""
status: "published"
tags:
  - Astro
  - 博客
link:
  - label: "GitHub"
    icon: "fa7-brands:github"
    value: "https://github.com/TakeMeHand2/Firefly-X"
lang: ""
---

## 项目简介

这是「序号的小站」的源码仓库。

基于 [Astro](https://astro.build) 的静态站点生成，主题源自 [Firefly](https://github.com/CuteLeaf/Firefly)，在配色、身份信息、页面结构与内容组织上做了本地化改造。

## 技术要点

| 项 | 说明 |
|---|---|
| 框架 | Astro（静态生成，输出纯 HTML/CSS/JS） |
| 主题 | Firefly，定制主题色为紫罗兰色相 285 |
| 内容 | Markdown 驱动，文章 / 动态 / 项目 / 相册四类集合 |
| 依赖 | Node ≥ 22.23，pnpm 11.22 |

## 定制记录

- 身份信息、导航、页脚与社交媒体链接全部替换为本站配置
- 移除了主题自带的演示文章与示例相册，归档保留在仓库的 `_demo-archive/`
- 关闭了模板作者的打赏收款码，待接入本人收款方式后再逐项开启
- 背景视频改为关闭，去掉了对模板作者自建 CDN 的依赖
