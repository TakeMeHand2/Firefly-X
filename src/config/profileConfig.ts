import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	// 注意：动图必须放 public 目录并走 "/" 路径。Astro 的图像优化会丢弃动画帧，只保留首帧。
	avatar: "/assets/images/avatar.webp",

	// 名字
	name: "序号",

	// 个人签名
	bio: "我本可以忍受黑暗，若我不曾见过太阳",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/TakeMeHand2",
			showName: false,
		},
		{
			name: "Email",
			icon: "fa7-solid:envelope",
			url: "mailto:656475090@qq.com",
			showName: false,
		},
		{
			name: "哔哩哔哩",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/3494377393490309",
			showName: false,
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false,
		},
		{
			name: "Atom",
			icon: "fa7-solid:atom",
			url: "/atom/",
			showName: false,
		},
	],
};
