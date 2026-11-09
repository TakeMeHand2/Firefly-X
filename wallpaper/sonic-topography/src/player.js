// 播放器面板：结构、尺寸、动效曲线取自原壁纸的 React 组件。
// 原实现用 framer-motion 的 AnimatePresence；这里用两层 DOM + CSS keyframes
// 复现同样的进入/退出时序（封面 .15s / 标题 .25s / 艺术家 .3s，时长 1s）。

const SIZES = {
	small: { width: 300, cover: 76, padding: 14, gap: 12, title: 14, artist: 11, progressHeight: 4, timeText: 9.5 },
	medium: { width: 360, cover: 92, padding: 16, gap: 14, title: 15.5, artist: 12, progressHeight: 4.5, timeText: 10 },
	large: { width: 420, cover: 110, padding: 20, gap: 18, title: 18, artist: 13.5, progressHeight: 5, timeText: 11 },
};

const fmt = (s) => {
	if (!s || Number.isNaN(s)) return "0:00";
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${String(sec).padStart(2, "0")}`;
};

export class PlayerPanel {
	constructor() {
		this.root = document.getElementById("player");
		this.card = document.getElementById("playerCard");
		this.coverWrap = document.getElementById("coverWrap");
		this.cover = document.getElementById("cover");
		this.glow = document.getElementById("coverGlow");
		this.title = document.getElementById("trackTitle");
		this.artist = document.getElementById("trackArtist");
		this.progressRow = document.getElementById("progressRow");
		this.fill = document.getElementById("progressFill");
		this.time = document.getElementById("timeText");

		this.media = { title: "", artist: "", thumbnail: "", isPlaying: false, position: 0, duration: 0 };
		this.visible = false;
		this.size = "large";
		this.x = 2;
		this.y = 3;
		this.accent = "#8050ff";
		this._lastKey = "";
		this._animTimer = 0;
		this.setSize("large");
		this.setPosition(2, 3);
	}

	setSize(name) {
		const s = SIZES[name] || SIZES.large;
		this.size = SIZES[name] ? name : "large";
		this.root.style.setProperty("--pw", `${s.width}px`);
		this.root.style.setProperty("--cover", `${s.cover}px`);
		this.root.style.setProperty("--pad", `${s.padding}px`);
		this.root.style.setProperty("--gap", `${s.gap}px`);
		this.root.style.setProperty("--title-size", `${s.title}px`);
		this.root.style.setProperty("--artist-size", `${s.artist}px`);
		this.root.style.setProperty("--progress-h", `${s.progressHeight}px`);
		this.root.style.setProperty("--time-size", `${s.timeText}px`);
	}

	setPosition(x, y) {
		this.x = x;
		this.y = y;
		this.root.style.top = `${y}vh`;
		this.root.style.right = `${x}vw`;
	}

	setAccent(hex) {
		if (!hex || hex === this.accent) return;
		this.accent = hex;
		this.glow.style.background = `linear-gradient(140deg, ${hex}35, transparent 55%, ${hex}18)`;
		this.fill.style.background = `linear-gradient(90deg, ${hex}dd, ${hex})`;
		this.fill.style.boxShadow = `0 0 10px ${hex}44, 0 0 20px ${hex}12`;
		const dot = this.fill.querySelector(".progress-dot");
		if (dot) {
			dot.style.backgroundColor = hex;
			dot.style.boxShadow = `0 0 8px ${hex}88, 0 0 16px ${hex}44`;
		}
	}

	setVisible(v) {
		if (this.visible === v) return;
		this.visible = v;
		this.root.classList.toggle("visible", v);
		this.root.setAttribute("aria-hidden", v ? "false" : "true");
	}

	update(media, showCover) {
		this.media = media;

		const key = `${media.title}|${media.artist}|${media.thumbnail}`;
		const changed = key !== this._lastKey;
		this._lastKey = key;

		if (changed) this._animateSwap(media, showCover);
		else {
			this._applyCover(media, showCover);
			this._applyText(media);
		}

		const hasDuration = media.duration > 0;
		this.progressRow.style.display = hasDuration ? "flex" : "none";
		this.card.querySelector(".player-main").style.gap = hasDuration ? "8px" : "0";
		if (hasDuration) {
			const pct = Math.min((media.position / media.duration) * 100, 100);
			this.fill.style.width = `${pct}%`;
			this.time.textContent = `${fmt(media.position)}/${fmt(media.duration)}`;
		}
	}

	_applyCover(media, showCover) {
		const has = showCover && !!media.thumbnail;
		this.coverWrap.classList.toggle("empty", !has);
		if (has && this.cover.getAttribute("src") !== media.thumbnail) {
			this.cover.src = media.thumbnail;
		}
	}

	_applyText(media) {
		this.title.textContent = media.title || "--";
		this.artist.textContent = media.artist || "--";
		this.title.title = media.title || "";
		this.artist.title = media.artist || "";
	}

	_animateSwap(media, showCover) {
		clearTimeout(this._animTimer);
		this.card.classList.remove("swap-in");
		this.card.classList.add("swap-out");
		this._animTimer = window.setTimeout(() => {
			this._applyCover(media, showCover);
			this._applyText(media);
			this.card.classList.remove("swap-out");
			// 强制 reflow 让动画重新开始
			void this.card.offsetWidth;
			this.card.classList.add("swap-in");
		}, 500);
	}
}
