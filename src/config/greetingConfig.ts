import type { GreetingConfig } from "../types/greetingConfig";

// 访客问候卡片配置
// 访客首次进入站点时，右下角滑入一张玻璃质感的问候卡片：
// 按时段（清晨 / 上午 / 中午 / 下午 / 傍晚 / 夜晚 / 深夜）切换问候语与图标。
// 全部文案与时段都可在下方覆盖，留空的项回落到 i18n 内置文案。

export const greetingConfig: GreetingConfig = {
	// 是否启用问候卡片
	enable: true,

	// 自动消失延时（毫秒）。设为 0 则常驻，需访客手动关闭。
	// 鼠标悬停或键盘聚焦卡片时计时暂停，移开后继续计时。
	autoHide: 9000,

	// 同一浏览器会话内只问候一次（Swup 切页不会重复弹出，关闭标签页后再访问会重新问候）
	oncePerSession: true,

	// 记录并展示回访次数：首次访问显示「初次见面」，之后显示「第 N 次来访」。
	// 计数只保存在访客本机 localStorage，不会上报任何数据
	countVisits: true,

	// 移动端（<768px）是否显示。手机屏幕空间紧张时可关掉
	showOnMobile: true,

	// 卡片层级。需低于导航面板（1100），避免遮挡抽屉与浮层
	zIndex: 900,

	// 时段划分，左闭右开 [start, end)，按小时（0-23）判断。
	// end 小于 start 表示跨越午夜；未覆盖到的钟点回落到离它最近的时段
	periods: [
		{ period: "dawn", start: 5, end: 7 },
		{ period: "morning", start: 7, end: 11 },
		{ period: "noon", start: 11, end: 13 },
		{ period: "afternoon", start: 13, end: 17 },
		{ period: "evening", start: 17, end: 19 },
		{ period: "night", start: 19, end: 23 },
		// 23:00 - 05:00 跨越午夜
		{ period: "lateNight", start: 23, end: 5 },
	],

	// 各时段的问候语，留空则使用 i18n 默认文案
	salutation: {},

	// 通用问候文案池，每次访问随机取一句（会尽量避免与上次相同）。
	// 留空数组则使用 i18n 内置文案
	messages: [],

	// 按时段的文案池，命中时优先于 messages。
	// 例如给深夜单独准备几句"早点睡"，白天访问不会看到
	messagesByPeriod: {},
};
