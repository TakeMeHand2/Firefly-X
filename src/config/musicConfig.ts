import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 固定配色：不再对歌曲封面取色。
	// accent 只决定侧边栏迷你播放器的强调色；全屏可视化场景的配色
	// 已与 Wallpaper Engine《音域回响》(nocturnal/霁紫) 硬锁一致，
	// 不再吃这里的任何颜色。
	// fullscreenAccent / fullscreenGlass 只作用于全屏卡片，与场景配色解耦。
	// fullscreenAccent 取场景 coolCore (#591ae6, 色相 259°) 的提亮版
	// #b8a6ff（252°）：卡片的描边/圆环/图标色与地形同属一个紫族，
	// 避免出现「紫色地形上浮着一块蓝色控制台」的割裂感。
	theme: {
		accent: "#e0365c",
		fullscreenAccent: "#b8a6ff",
		fullscreenGlass: "#0a0b11",
	},

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "meting",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// 元数据接口：歌单（标题/歌手/封面/歌词）
		// QQ 音乐（tencent）下各公共实例的能力不一致，实测（2026-11）：
		//   injahow 歌单 0.27s、封面正常 → 适合取元数据
		//   moeyao  封面接口失效，但直链 302 到 https CDN → 适合取音频
		//   i-meto  直链接口 401/404 且耗时 1.5s+，仅作兜底
		// 因此这里拆成 api（元数据）+ audioApi（音频）两个源。
		api: "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
		// 音频直链接口：loadTrack() 会用它生成每首歌的首选地址并排到队首
		audioApi:
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "tencent",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		// QQ 歌单需为公开歌单，ID 取分享链接里的数字：
		// https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=<这段>
		id: "9041353293",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		// 顺序即直链重试顺序：loadTrack() 会按此顺序生成本曲的候选音频地址。
		fallbackApis: [
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		playlist: [
			{
				name: "使一颗心免于哀伤",
				artist: "知更鸟 / HOYO-MiX / Chevy",
				url: "/assets/music/使一颗心免于哀伤-哼唱.mp3",
				cover: "/assets/music/cover/109951169585655912.webp",
				lrc: "",

				// 可视化元数据（均可选）：
				// album 会写入系统媒体信息面板；trackNo 决定全屏层右下角的大号数字；
				// 填了 bpm，节拍脉冲按精确相位走，不填则用低频能量包络估算。
				album: "崩坏：星穹铁道",
				trackNo: 1,
				// bpm: 72,
			},
		],
	},
};
