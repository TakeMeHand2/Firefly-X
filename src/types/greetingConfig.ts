/** 一天中被区分问候的时段。跨越午夜的时段（深夜）由 end < start 表示 */
export type GreetingPeriod =
	| "dawn"
	| "morning"
	| "noon"
	| "afternoon"
	| "evening"
	| "night"
	| "lateNight";

/**
 * 时段的钟点区间，左闭右开 [start, end)。
 * end 小于 start 时表示跨越午夜（例如 23 → 5）。
 */
export interface GreetingPeriodWindow {
	period: GreetingPeriod;
	start: number;
	end: number;
}

export interface GreetingConfig {
	/** 是否启用问候卡片 */
	enable: boolean;

	/**
	 * 自动消失延时（毫秒）。设为 0 则常驻，需手动关闭。
	 * 鼠标悬停或键盘聚焦时计时暂停。
	 */
	autoHide: number;

	/** 同一浏览器会话内只问候一次（关闭标签页后再次访问会重新问候） */
	oncePerSession: boolean;

	/**
	 * 记录并展示回访次数。首次访问显示「初次见面」，之后显示「第 N 次来访」。
	 * 计数保存在访客本机的 localStorage，不会上报任何数据。
	 */
	countVisits: boolean;

	/** 移动端（<768px）是否显示。手机屏幕空间紧张时可关闭 */
	showOnMobile: boolean;

	/** 卡片层级。需低于导航面板（1100），避免遮挡抽屉与浮层 */
	zIndex: number;

	/** 问候语时段划分，按时段覆盖默认的 7 段 */
	periods: GreetingPeriodWindow[];

	/** 各时段的问候语，留空则使用 i18n 默认文案 */
	salutation: Partial<Record<GreetingPeriod, string>>;

	/** 通用问候文案池，随机取一句；留空则使用 i18n 默认文案 */
	messages: string[];

	/** 按时段的文案池，命中时优先于 messages，未配置则回落到 messages */
	messagesByPeriod: Partial<Record<GreetingPeriod, string[]>>;
}
