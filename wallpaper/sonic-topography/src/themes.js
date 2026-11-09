// 主题色板：数值逐项取自原壁纸打包产物中的 Td 表（linear 工作空间，与 three.Color 同语义）。
// 不要「调好看」——这些小数是着色器的直接输入，改动即偏离。

export const THEME_ORDER = [
	"nocturnal",
	"ocean-deep",
	"arctic-aurora",
	"cyber-forest",
	"golden-hour",
	"ember-fire",
	"crimson-sunset",
	"coral-mirage",
	"neon-tokyo",
	"minimal-monochrome",
	"teal-depth",
	"lavender-dream",
	"cherry-blossom",
	"copper-forge",
	"mint-fresh",
];

const T = (name, id, b1, b2, cc, ce, wc, we, rip, peak, glow) => ({
	name,
	id,
	uBaseColor1: b1,
	uBaseColor2: b2,
	uCoolCore: cc,
	uCoolEdge: ce,
	uWarmCore: wc,
	uWarmEdge: we,
	uRippleColor: rip,
	uPeakColor: peak,
	uGlowIntensity: glow,
});

export const THEMES = {
	nocturnal: T(
		"霁紫", "nocturnal",
		[0.005, 0.008, 0.025], [0.015, 0.025, 0.07],
		[0.35, 0.1, 0.9], [0.15, 0, 0.45],
		[0.65, 0.25, 1], [0.5, 0.1, 0.8],
		[0.5, 0.2, 1], [1, 0.55, 0.05], 1,
	),
	"ocean-deep": T(
		"沧蓝", "ocean-deep",
		[0.002, 0.008, 0.028], [0.005, 0.018, 0.06],
		[0, 0.25, 1], [0, 0.08, 0.35],
		[0.15, 0.55, 1], [0.05, 0.35, 0.85],
		[0.1, 0.5, 1], [1, 0.75, 0.1], 1.1,
	),
	"arctic-aurora": T(
		"冰蓝", "arctic-aurora",
		[0.003, 0.015, 0.022], [0.01, 0.03, 0.055],
		[0, 0.75, 0.85], [0, 0.3, 0.5],
		[0.2, 1, 0.85], [0.05, 0.6, 0.6],
		[0.1, 0.9, 0.9], [1, 0.25, 0.35], 1.25,
	),
	"cyber-forest": T(
		"碧翠", "cyber-forest",
		[0.003, 0.018, 0.005], [0.01, 0.045, 0.018],
		[0, 0.85, 0.35], [0, 0.35, 0.15],
		[0.4, 1, 0.3], [0.15, 0.65, 0.2],
		[0.3, 1, 0.4], [1, 0.2, 0.5], 1.3,
	),
	"golden-hour": T(
		"流金", "golden-hour",
		[0.018, 0.015, 0.005], [0.045, 0.035, 0.012],
		[0.85, 0.6, 0.05], [0.5, 0.3, 0.02],
		[1, 0.92, 0.35], [0.85, 0.7, 0.15],
		[1, 0.85, 0.25], [0.2, 0.5, 1], 1.2,
	),
	"ember-fire": T(
		"余烬", "ember-fire",
		[0.022, 0.008, 0.002], [0.05, 0.018, 0.005],
		[1, 0.45, 0], [0.6, 0.15, 0],
		[1, 0.78, 0.15], [0.9, 0.55, 0.05],
		[1, 0.65, 0.1], [0.1, 0.4, 1], 1.5,
	),
	"crimson-sunset": T(
		"赤焰", "crimson-sunset",
		[0.025, 0.003, 0.005], [0.055, 0.01, 0.015],
		[1, 0.05, 0.08], [0.65, 0, 0.06],
		[1, 0.35, 0.2], [0.85, 0.12, 0.1],
		[1, 0.15, 0.1], [0.1, 0.9, 0.7], 1.4,
	),
	"coral-mirage": T(
		"霞粉", "coral-mirage",
		[0.02, 0.006, 0.01], [0.045, 0.015, 0.022],
		[1, 0.25, 0.3], [0.7, 0.08, 0.18],
		[1, 0.55, 0.55], [0.9, 0.3, 0.35],
		[1, 0.4, 0.4], [0.1, 0.7, 1], 1.3,
	),
	"neon-tokyo": T(
		"幻紫", "neon-tokyo",
		[0.01, 0.002, 0.025], [0.03, 0.008, 0.065],
		[1, 0.05, 0.6], [0.55, 0.02, 0.85],
		[1, 0.25, 0.85], [0.8, 0.1, 0.7],
		[1, 0.2, 0.75], [0.95, 1, 0.15], 1.6,
	),
	"minimal-monochrome": T(
		"水墨", "minimal-monochrome",
		[0.012, 0.012, 0.012], [0.045, 0.045, 0.045],
		[0.8, 0.8, 0.8], [0.3, 0.3, 0.3],
		[1, 1, 1], [0.6, 0.6, 0.6],
		[1, 1, 1], [1, 1, 1], 0.7,
	),
	"teal-depth": T(
		"幽青", "teal-depth",
		[0.002, 0.018, 0.02], [0.008, 0.04, 0.045],
		[0, 0.55, 0.55], [0, 0.25, 0.28],
		[0.2, 0.85, 0.75], [0.08, 0.55, 0.5],
		[0.15, 0.8, 0.7], [1, 0.45, 0.15], 1.2,
	),
	"lavender-dream": T(
		"薰衣草", "lavender-dream",
		[0.012, 0.008, 0.022], [0.03, 0.02, 0.055],
		[0.55, 0.35, 0.85], [0.3, 0.15, 0.55],
		[0.75, 0.55, 1], [0.5, 0.3, 0.75],
		[0.65, 0.45, 1], [1, 0.8, 0.25], 1.1,
	),
	"cherry-blossom": T(
		"樱", "cherry-blossom",
		[0.018, 0.005, 0.012], [0.04, 0.012, 0.025],
		[1, 0.55, 0.65], [0.7, 0.2, 0.35],
		[1, 0.72, 0.78], [0.85, 0.45, 0.55],
		[1, 0.6, 0.7], [0.25, 0.9, 0.55], 1.15,
	),
	"copper-forge": T(
		"锻铜", "copper-forge",
		[0.02, 0.01, 0.005], [0.045, 0.025, 0.012],
		[0.85, 0.45, 0.2], [0.5, 0.22, 0.08],
		[1, 0.65, 0.3], [0.75, 0.38, 0.15],
		[0.9, 0.55, 0.25], [0.3, 0.65, 0.35], 1.3,
	),
	"mint-fresh": T(
		"薄荷", "mint-fresh",
		[0.003, 0.02, 0.015], [0.01, 0.045, 0.035],
		[0.3, 0.9, 0.65], [0.1, 0.45, 0.3],
		[0.5, 1, 0.8], [0.25, 0.7, 0.5],
		[0.4, 1, 0.7], [1, 0.3, 0.55], 1.2,
	),
};

// 浅色模式的三个常量，同样取自原包：base1 / base2 / 雾-背景参考色。
export const LIGHT = {
	base1: [1, 1, 1],
	base2: [0.93, 0.94, 0.96],
	bg: [0.88, 0.9, 0.94],
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// 对应原包 sG(i,e,t)：进度 <0.5 取前一套的名字，颜色线性插值。
export function lerpTheme(a, b, t) {
	const k = Math.max(0, Math.min(1, t));
	return {
		name: k < 0.5 ? a.name : b.name,
		id: k < 0.5 ? a.id : b.id,
		uBaseColor1: lerp3(a.uBaseColor1, b.uBaseColor1, k),
		uBaseColor2: lerp3(a.uBaseColor2, b.uBaseColor2, k),
		uCoolCore: lerp3(a.uCoolCore, b.uCoolCore, k),
		uCoolEdge: lerp3(a.uCoolEdge, b.uCoolEdge, k),
		uWarmCore: lerp3(a.uWarmCore, b.uWarmCore, k),
		uWarmEdge: lerp3(a.uWarmEdge, b.uWarmEdge, k),
		uRippleColor: lerp3(a.uRippleColor, b.uRippleColor, k),
		uPeakColor: lerp3(a.uPeakColor, b.uPeakColor, k),
		uGlowIntensity: lerp(a.uGlowIntensity, b.uGlowIntensity, k),
	};
}

const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex2 = (c) => Math.round(Math.max(0, Math.min(1, srgb(c))) * 255).toString(16).padStart(2, "0");

// 与 three.Color.getHexString() 同语义：linear -> sRGB -> #rrggbb
export function linearToHex(c) {
	return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
}

// three.Color.getHexString("srgb-linear")：直接把线性分量当 0..1 写进 hex。
// 原包背景色用的是这一支（Uf = "srgb-linear"），所以比 sRGB 分支暗一档。
export function linearToHexRaw(c) {
	const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
	return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}
