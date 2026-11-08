// 音乐播放器配置
export type MusicPlayerConfig = {
	// 使用方式：'meting' 或 'local'
	mode?: "meting" | "local"; // "meting" 使用 Meting API，"local" 使用本地音乐列表

	// 默认音量 (0-1)
	volume?: number;

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode?: "list" | "one" | "random";

	// 是否显示歌词
	showLyrics?: boolean;

	// 是否在导航栏显示音乐播放器
	showInNavbar?: boolean;

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar?: boolean;

	// 固定配色（不随歌曲封面取色）
	// 不配置时沿用旧行为：从封面主色提取强调色。
	theme?: {
		// 播放器 UI 与音频响应场景的单一状态色（hex）
		// 同时决定侧边栏强调色与全屏地形的色相，全站只有这一个色。
		accent?: string;

		// 全屏层的独立功能色（hex）
		// 只作用于全屏卡片：进度弧、收藏、高光、卡片晕染。
		// 与 accent 解耦，壁纸怎么响应音频都不会带动卡片配色。
		fullscreenAccent?: string;

		// 全屏毛玻璃基底色（hex，建议深色）
		fullscreenGlass?: string;
	};

	// Meting API 配置
	meting?: {
		// Meting API 地址
		api?: string;

		// 音频直链专用地址（可选）
		// 元数据与音频由不同实例提供时使用：歌单/封面/歌词仍走 api，
		// 每首歌的音频优先用此模板生成（:type 会被替换为 url）。
		// 未配置时沿用歌单接口返回的 url 字段。
		audioApi?: string;

		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server?: "netease" | "tencent" | "kugou" | "xiami" | "baidu";

		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type?: "song" | "playlist" | "album" | "search" | "artist";

		// 歌单/专辑/单曲 ID 或搜索关键词
		id?: string;

		// 认证 token（可选）
		auth?: string;

		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis?: string[];
	};

	// 本地音乐配置（当 mode 为 'local' 时使用）
	local?: {
		playlist?: Array<{
			name: string; // 歌曲名称
			artist: string; // 艺术家
			url: string; // 音乐文件路径（相对于 public 目录）
			cover?: string; // 封面图片路径（相对于 public 目录）
			lrc?: string; // 歌词内容，支持 LRC 格式

			// ── 可视化 / 系统媒体信息用到的元数据（均可选）──
			album?: string; // 专辑名，同时写入系统媒体信息面板
			trackNo?: number | string; // 曲目编号，全屏层右下角的大号数字
			bpm?: number; // 填了节拍脉冲按精确相位走，否则用低频能量包络估算
		}>;
	};
};
