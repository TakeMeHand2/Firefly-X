// 参数与配置项：键名、类型、范围、步进、默认值全部对齐原壁纸 project.json。
// 面板是 Wallpaper Engine 属性页的浏览器等价物，额外提供持久化与 WE 格式导入导出。

import { THEME_ORDER, THEMES } from "./themes.js";

const THEME_OPTIONS = [
	{ label: "自动轮询 / Auto Cycle", value: "cycle" },
	...THEME_ORDER.map((id) => {
		const t = THEMES[id];
		const zh = t.name;
		const en = {
			nocturnal: "Violet", "ocean-deep": "Deep Blue", "arctic-aurora": "Ice Blue",
			"cyber-forest": "Emerald", "golden-hour": "Gold", "ember-fire": "Ember",
			"crimson-sunset": "Crimson", "coral-mirage": "Coral", "neon-tokyo": "Neon",
			"minimal-monochrome": "Ink", "teal-depth": "Teal", "lavender-dream": "Lavender",
			"cherry-blossom": "Cherry Blossom", "copper-forge": "Copper", "mint-fresh": "Mint",
		}[id];
		return { label: `${zh} / ${en}`, value: id };
	}),
];

const GRID_OPTIONS = [120, 160, 320, 640, 1080, 4096].map((v) => ({
	label: `${v}x${v}`,
	value: v,
}));

export const DEFAULTS = {
	theme: "nocturnal",
	themeCycleInterval: 60,
	lightMode: false,
	peakColorEnabled: true,
	peakColorIntensity: 1,
	gridSize: 160,

	responseRange: 1,
	centralEnabled: true,
	centralIntensity: 1,
	ringEnabled: true,
	ringIntensity: 1,
	flowEnabled: true,
	flowIntensity: 1,
	riverEnabled: true,
	riverIntensity: 1,
	spikeEnabled: true,
	spikeIntensity: 1,

	pulseEnabled: true,
	pulseSensitivity: 0.2,
	pulseCooldown: 0,
	pulseIntensity: 1,
	meteorEnabled: true,
	meteorSensitivity: 0.35,
	meteorCooldown: 60,
	meteorIntensity: 1,
	meteorClickEnabled: true,
	idleWaveEnabled: true,
	idleWaveDebounce: 1,
	idleWaveFadeDuration: 1,

	cameraDistance: 85,
	cameraAngleX: 120,
	cameraAngleY: 25,
	autoRotateEnabled: false,
	autoRotateSpeed: 10,

	showPlayerController: true,
	showAlbumCover: true,
	controllerSize: "large",
	controllerX: 2,
	controllerY: 3,

	fpsLimit: 0,
};

const SECTIONS = [
	{
		key: "appearance",
		title: "外观 / Appearance",
		items: [
			{ key: "theme", type: "combo", label: "颜色主题", en: "Color Theme", options: THEME_OPTIONS },
			{ key: "themeCycleInterval", type: "slider", label: "轮询间隔", en: "Cycle Interval", min: 10, max: 300, step: 10, unit: "s", visibleWhen: (s) => s.theme === "cycle" },
			{ key: "lightMode", type: "bool", label: "浅色模式", en: "Light Mode" },
			{ key: "peakColorEnabled", type: "bool", label: "启用强调色", en: "Peak Color" },
			{ key: "peakColorIntensity", type: "slider", label: "强调色强度", en: "Peak Color Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "gridSize", type: "combo", label: "渲染精度", en: "Render Resolution", options: GRID_OPTIONS },
		],
	},
	{
		key: "audio",
		title: "音频响应 / Audio Response",
		items: [
			{ key: "responseRange", type: "slider", label: "响应范围", en: "Response Range", min: 0.3, max: 2, step: 0.1 },
			{ key: "centralEnabled", type: "bool", label: "中心隆起", en: "Central Rise" },
			{ key: "centralIntensity", type: "slider", label: "中心隆起强度", en: "Central Rise Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "ringEnabled", type: "bool", label: "中部环形", en: "Mid Ring" },
			{ key: "ringIntensity", type: "slider", label: "中部环形强度", en: "Mid Ring Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "flowEnabled", type: "bool", label: "全域流动", en: "Global Flow" },
			{ key: "flowIntensity", type: "slider", label: "全域流动强度", en: "Global Flow Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "riverEnabled", type: "bool", label: "河流对角线", en: "River Flow" },
			{ key: "riverIntensity", type: "slider", label: "河流对角线强度", en: "River Flow Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "spikeEnabled", type: "bool", label: "高频尖刺", en: "High Spikes" },
			{ key: "spikeIntensity", type: "slider", label: "高频尖刺强度", en: "High Spikes Intensity", min: 0, max: 2, step: 0.1 },
		],
	},
	{
		key: "effects",
		title: "效果 / Effects",
		items: [
			{ key: "pulseEnabled", type: "bool", label: "启用波纹", en: "Enable Ripple" },
			{ key: "pulseIntensity", type: "slider", label: "波纹强度", en: "Ripple Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "pulseSensitivity", type: "slider", label: "波纹灵敏度", en: "Ripple Sensitivity", min: 0.05, max: 0.5, step: 0.01 },
			{ key: "pulseCooldown", type: "slider", label: "波纹冷却", en: "Ripple Cooldown", min: 0, max: 200, step: 5, unit: "帧" },
			{ key: "meteorEnabled", type: "bool", label: "启用流星", en: "Enable Meteor" },
			{ key: "meteorIntensity", type: "slider", label: "流星强度", en: "Meteor Intensity", min: 0, max: 2, step: 0.1 },
			{ key: "meteorSensitivity", type: "slider", label: "流星灵敏度", en: "Meteor Sensitivity", min: 0.1, max: 0.8, step: 0.05 },
			{ key: "meteorCooldown", type: "slider", label: "流星冷却", en: "Meteor Cooldown", min: 0, max: 400, step: 10, unit: "帧" },
			{ key: "meteorClickEnabled", type: "bool", label: "点击触发流星", en: "Click Meteor" },
			{ key: "idleWaveEnabled", type: "bool", label: "启用空闲波浪", en: "Idle Wave" },
			{ key: "idleWaveDebounce", type: "slider", label: "空闲波浪防抖", en: "Idle Debounce", min: 0.5, max: 5, step: 0.5, unit: "s" },
			{ key: "idleWaveFadeDuration", type: "slider", label: "空闲波浪过渡", en: "Idle Fade", min: 0.5, max: 5, step: 0.5, unit: "s" },
		],
	},
	{
		key: "camera",
		title: "视角 / Camera",
		items: [
			{ key: "cameraDistance", type: "slider", label: "视角距离", en: "Camera Distance", min: 20, max: 100, step: 5 },
			{ key: "cameraAngleX", type: "slider", label: "水平角度", en: "Horizontal Angle", min: 0, max: 360, step: 5, unit: "°" },
			{ key: "cameraAngleY", type: "slider", label: "垂直仰角", en: "Vertical Angle", min: 10, max: 70, step: 5, unit: "°" },
			{ key: "autoRotateEnabled", type: "bool", label: "自动旋转", en: "Auto Rotate" },
			{ key: "autoRotateSpeed", type: "slider", label: "旋转速度", en: "Rotate Speed", min: 1, max: 60, step: 1 },
		],
	},
	{
		key: "player",
		title: "播放器 / Player",
		items: [
			{ key: "showPlayerController", type: "bool", label: "显示播放器控制器", en: "Show Player" },
			{ key: "showAlbumCover", type: "bool", label: "显示专辑封面", en: "Show Album Cover" },
			{
				key: "controllerSize", type: "combo", label: "控制器尺寸", en: "Controller Size",
				options: [{ label: "小 / Small", value: "small" }, { label: "中 / Medium", value: "medium" }, { label: "大 / Large", value: "large" }],
			},
			{ key: "controllerX", type: "slider", label: "控制器水平位置", en: "Controller X", min: 0, max: 80, step: 1, unit: "%" },
			{ key: "controllerY", type: "slider", label: "控制器垂直位置", en: "Controller Y", min: 0, max: 90, step: 1, unit: "%" },
		],
	},
	{
		key: "system",
		title: "系统 / System",
		items: [
			{
				key: "fpsLimit", type: "combo", label: "帧率上限", en: "FPS Limit",
				options: [
					{ label: "不限 / Unlimited", value: 0 },
					{ label: "144", value: 144 },
					{ label: "120", value: 120 },
					{ label: "90", value: 90 },
					{ label: "60", value: 60 },
					{ label: "30", value: 30 },
				],
			},
		],
	},
];

const STORE_KEY = "sonic-topography.props.v1";

function decimals(step) {
	const s = String(step);
	return s.includes(".") ? s.split(".")[1].length : 0;
}

export function loadState() {
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw);
		const out = { ...DEFAULTS };
		for (const k of Object.keys(DEFAULTS)) {
			if (parsed[k] !== undefined) out[k] = parsed[k];
		}
		return out;
	} catch {
		return { ...DEFAULTS };
	}
}

export class PropertiesPanel {
	constructor(state, onChange) {
		this.state = state;
		this.onChange = onChange;
		this.root = document.getElementById("props");
		this.body = document.getElementById("propsBody");
		this.rows = new Map();
		this.open = false;
		this._build();
	}

	_build() {
		this.body.innerHTML = "";
		for (const sec of SECTIONS) {
			const el = document.createElement("section");
			el.className = "prop-sec";
			el.dataset.section = sec.key;
			const h = document.createElement("h3");
			h.textContent = sec.title;
			el.appendChild(h);
			for (const item of sec.items) el.appendChild(this._row(item));
			this.body.appendChild(el);
		}
	}

	_row(item) {
		const row = document.createElement("div");
		row.className = `prop-row type-${item.type}`;
		row.dataset.key = item.key;

		const head = document.createElement("div");
		head.className = "prop-head";
		const label = document.createElement("span");
		label.className = "prop-label";
		label.innerHTML = `${item.label}<em>${item.en || ""}</em>`;
		head.appendChild(label);

		const val = document.createElement("span");
		val.className = "prop-val";
		head.appendChild(val);
		row.appendChild(head);

		if (item.type === "slider") {
			const input = document.createElement("input");
			input.type = "range";
			input.min = item.min;
			input.max = item.max;
			input.step = item.step;
			input.value = this.state[item.key];
			const paint = () => {
				const min = Number(input.min), max = Number(input.max);
				const p = ((Number(input.value) - min) / (max - min)) * 100;
				input.style.setProperty("--p", `${p}%`);
			};
			input.addEventListener("input", () => {
				const v = Number(input.value);
				this.state[item.key] = v;
				this._readout(item, val);
				paint();
				this.onChange(item.key, v);
				this._save();
			});
			row.appendChild(input);
			this._readout(item, val);
			paint();
			this.rows.set(item.key, { row, val, input, paint });
		} else if (item.type === "bool") {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "switch";
			btn.setAttribute("role", "switch");
			btn.addEventListener("click", () => {
				const v = !this.state[item.key];
				this.state[item.key] = v;
				btn.setAttribute("aria-checked", String(v));
				btn.classList.toggle("on", v);
				this.onChange(item.key, v);
				this._save();
				this.refreshVisibility();
			});
			head.appendChild(btn);
			btn.setAttribute("aria-checked", String(!!this.state[item.key]));
			btn.classList.toggle("on", !!this.state[item.key]);
			this.rows.set(item.key, { row, val, btn });
		} else if (item.type === "combo") {
			const sel = document.createElement("select");
			for (const o of item.options) {
				const opt = document.createElement("option");
				opt.value = String(o.value);
				opt.textContent = o.label;
				sel.appendChild(opt);
			}
			sel.value = String(this.state[item.key]);
			sel.addEventListener("change", () => {
				const raw = sel.value;
				const opt = item.options.find((o) => String(o.value) === raw);
				const v = opt ? opt.value : raw;
				this.state[item.key] = v;
				this.onChange(item.key, v);
				this._save();
				this.refreshVisibility();
			});
			row.appendChild(sel);
			this.rows.set(item.key, { row, val, sel });
		}

		return row;
	}

	_readout(item, el) {
		const v = this.state[item.key];
		const d = item.type === "slider" ? decimals(item.step) : 0;
		el.textContent = `${Number(v).toFixed(d)}${item.unit || ""}`;
	}

	refreshVisibility() {
		for (const sec of SECTIONS) {
			for (const item of sec.items) {
				if (!item.visibleWhen) continue;
				const r = this.rows.get(item.key);
				if (r) r.row.style.display = item.visibleWhen(this.state) ? "" : "none";
			}
		}
	}

	refreshAll() {
		for (const sec of SECTIONS) {
			for (const item of sec.items) {
				const r = this.rows.get(item.key);
				if (!r) continue;
				if (item.type === "slider") {
					r.input.value = this.state[item.key];
					this._readout(item, r.val);
					r.paint();
				} else if (item.type === "bool") {
					const v = !!this.state[item.key];
					r.btn.setAttribute("aria-checked", String(v));
					r.btn.classList.toggle("on", v);
				} else if (item.type === "combo") {
					r.sel.value = String(this.state[item.key]);
				}
			}
		}
		this.refreshVisibility();
	}

	_save() {
		clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch { /* 隐私模式 */ }
		}, 200);
	}

	setOpen(v) {
		this.open = v;
		this.root.classList.toggle("open", v);
		this.root.setAttribute("aria-hidden", v ? "false" : "true");
	}

	toggle() {
		this.setOpen(!this.open);
	}
}

export function toWeConfig(state) {
	const out = {};
	for (const [k, v] of Object.entries(state)) {
		if (k === "fpsLimit") continue;
		out[k] = { value: v };
	}
	return out;
}

export function fromWeConfig(cfg) {
	const out = {};
	for (const [k, v] of Object.entries(cfg || {})) {
		if (v && typeof v === "object" && "value" in v) out[k] = v.value;
		else out[k] = v;
	}
	return out;
}
