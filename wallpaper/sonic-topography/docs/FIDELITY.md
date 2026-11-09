# 保真度报告 · 音域回响复刻

本文件只记录**可重跑的测量**与**可复核的取证**，不写观感形容词。

- 参照本体：`E:\steam\steamapps\workshop\content\431960\3747222633`
  （web 型，React 19 + R3F，`project.json` v2，workshop `3747222633`）
- 复刻位置：`D:\Firefly-X\wallpaper\sonic-topography`
- 测量环境：Chrome headless new + SwiftShader，1280×720，DPR 1，`--disable-background-timer-throttling`

## 1. 代码级取证

### 1.1 着色器

从 1.27 MB 打包产物中提取全部 313 个模板字符串，按 `void main` / `uniform` 过滤出 66 段
GLSL，其中仅两段是地形自定义着色器（9,780 / 7,077 字符），其余为 three 内置材质。

复刻的 `src/shaders.js` 保留原注释与表达式，仅补：

- `precision highp float/int`
- `attribute vec3 position/normal/uv`、`attribute mat4 instanceMatrix`
- `uniform mat4 viewMatrix/projectionMatrix`（three 内置，原生 GL 需手传）

归一化（去注释、去空白、合并分号）后比对：

```
VS len 5475 5475 equal true
FS len 3804 3804 equal true
```

### 1.2 主题表

从 bundle 中求值 `Td` 字面量，导出 15 套主题的 8 个颜色通道 + `uGlowIntensity`，
与 `src/themes.js` 逐值比较（容差 1e-9）：`themes all match`。

浅色模式三个常量同样取自 bundle：`base1 (1,1,1)`、`base2 (0.93,0.94,0.96)`、
雾/背景参考 `(0.88,0.9,0.94)`。

背景色分支也按原包区分：深色走 `getHexString("srgb-linear")`（线性值直接写 hex），
浅色走默认 sRGB。这是最容易漏掉的一处：两者亮度差一档。

### 1.3 配置表

用脚本把 `project.json` 的 39 个属性与本项目 `DEFAULTS` / `SECTIONS` 逐项比对：

```
ALL MATCH
defaults keys 40 project props 39
```

40 = 39 项壁纸属性 + WE 通用属性 `fpsLimit`。`fpsLimit` 不写进 `project.json`，
由 WE 的 `applyGeneralProperties({fps})` 注入，浏览器面板里作为「系统」项提供。

### 1.4 几何与相机

| 量 | 原包 | 复刻 |
|---|---|---|
| 世界尺度 | `Re = 168` | `GRID_EXTENT = 168` |
| 半宽 | `De = 84` | `HALF_EXTENT = 84` |
| 间距 | `q = 168 / grid` | 同 |
| 柱宽 | `ne = q * 0.857` | 同 |
| 实例平移 | `(i*q - 84, 0.5, j*q - 84)` | 同 |
| 相机 | `fov 45`，`dist 85`，`angleX 120`，`angleY 25`，`lookAt(0,0,0)` | 同 |
| 雾 | `Fog(base1, 30, 95)` | 同（仅 basic 材质） |

### 1.5 音频下游

`src/audio.js` 的 `tick()` 是原包 `tG.getAudioData` 的逐行移植：

- 128 值 → 512：`data[n] = bands[floor(n*128/512)]`
- 频段划分（512 索引）：`0–4 / 5–12 / 13–24 / 25–45 / 46–81 / 82–120 / 121–180 / 181–255`
- 8 段均值分母：`5 / 9 / 13 / 21 / 37 / 40 / 61 / 76`
- 音色：`warmth=(h+d+m+v)/r`、`brightness=(x+b+M)/r`、`sharpness=Δbrightness*10`、
  `smoothness=1-2*flux/n`、`density=超均值段数/8`、`spectralCentroid=Σi·v/Σv`
- 平滑：每次 tick `α=0.15`（静音 0.08），与原包一致
- 触发：`Auto Beat` 通量均值+标准差阈值，`M=max(0.1,5-sens*4)`；
  Pulse `0–12 / 0.25 / 45f`，Meteor `92–340 / 0.5 / 180f`（随后被属性覆盖为 0.2/0 与 0.35/60）
- 空闲：能量阈值 0.02、防抖 1 s、淡入淡出 1 s、`ease` 斜率 `1/duration`

1 ms 节拍、`prevData` 更新顺序、`beatHold` 扣减方式均保持。

### 1.6 效果参数

| 项 | 原包 | 复刻 |
|---|---|---|
| 涟漪槽 | 20（着色器只读 0–9） | 同，**不修**这个浪费 |
| 涟漪速度/宽度/衰减/高度 | 14 / 5 / 22 / 3.0 | 同 |
| 流星涟漪 | 18 / 2.5 / 18 / 1.8 | 同 |
| 流星池 | 40，半径 10–45，y 30–40，speed 1–1.5+2.5·strength | 同 |
| 撞击 | 白色涟漪 `strength*1.5` + 10 粒子 `speed*1.5` | 同 |
| 拖尾 | 每 1 ms 70% 概率，池 200 | 同（更新留在 1 ms 节拍） |
| 点击流星 | 0.3 s 冷却，y=0 平面射线 | 同 |

## 2. 端到端 A/B

### 2.1 方法

1. `tools/ref-shot.mjs` 让本体在 headless 中运行；shim 在模块给
   `wallpaperPropertyListener` 赋值的一瞬间注入属性，使主题从第一帧生效。
2. `tools/capture.mjs` 给复刻注入**同一条** 128 值刺激（128 BPM 四踩 + 音乐化频谱），
   两者都在跨拍后相位 <0.18 截图。
3. 关闭流星（`--nometeor 1`）隔离白色重波纹，各取 10 帧、间隔 400 ms，
   统计中位数；单帧不作为结论。

### 2.2 数据

| 指标 | 原壁纸中位 | 复刻中位 | 偏差 |
|---|---|---|---|
| mean | 0.0847 | 0.0851 | +0.5% |
| P90 | 0.2040 | 0.2089 | +2.4% |
| bright >0.25 | 8.02% | 8.10% | +1.0% |
| amber | 1.715% | 1.750% | +2.0% |
| >0.45 | 4.44% | 4.23% | −4.7% |

单相位帧（phase 0.172 对 0.155）另测：暗区均色两者均为 `#03050f`，
亮区主色相 281° / 286°，集中度 0.63 / 0.62。

### 2.3 已定位的偏差

- **开启流星时 P90 偏高 10–18%**：SwiftShader 下只有 2.5 fps，逐帧频谱跳变远大于 60 fps，
  通量检测因此更密、流星重波纹更强。7.2 fps（80² 网格）时白色条带消失，验证为帧率相关，
  非着色器/参数错误。
- **单帧琥珀面积波动**：取决于拍点相位与 `uWarmth` 的 1 ms 包络，10 帧中位已对齐。
- **主题单帧偏亮**：原实现材质色按 0.05/帧 lerp，软光栅 2.5 fps 下 7 s 只收敛约 60%；
  复刻同样从默认色起步，但截图时刻更晚，收敛更多。这是采样问题，不是色板差异。

## 3. 浏览器音频前端

### 3.1 事实

Wallpaper Engine 官方文档明确：`wallpaperRegisterAudioListener` 的数组长度 128，
**0–63 为左声道，64–127 为右声道**，每声道低频在前。原壁纸的 512 划分因此只对左声道
做 8 段求和，右声道只参与总能量/通量/质心；流星窗口 `92–340` 实际横跨「左声道高频 +
右声道低中频」。这是本体的真实行为，照搬。

WE 未公开精确频段边界。社区实测（Wallpaper Engine 可视化作者、WallpaperMachine 独立实现）
一致指向非等宽：首段约 0–35 Hz，高频按指数展宽至约 15–16 kHz。

### 3.2 复刻策略

- 宿主模式：`useHostBands()` 直接接收 WE 的 128 值，**零变换**进入下游；
  这是唯一完全同源的路径。
- 浏览器模式：
  - 两个 `AnalyserNode`（L/R），`fftSize 2048`、`smoothing 0`、30 Hz 读取
  - 64 段指数分频：`0–35 Hz`，之后 `×1.0999`（约 7.3 段/倍频程），上限 16 kHz
  - 每段取「面积平均 ×0.5 + 峰值 ×0.5」：纯平均会稀释窄带单音，纯峰值会随噪声跳
  - 48 dB 刻度：`(dB + 48) / 48`，并对 WebAudio 窗函数/单边谱的固定损失补偿 **14 dB**
  - 校准：220 Hz 正弦（真实峰值 −18.5 dBFS）落在第 20 段，读数 **0.605**；
    理论 `(48−18.5)/48 = 0.615`
- 单声道麦克风直接双接两个分析器；立体声经 `ChannelSplitter`。

### 3.3 未验证

- 真实 GPU 60/144 Hz 下的长时间稳定性（代码层与帧率无关，但只在软光栅跑过）
- 在真实 Wallpaper Engine 客户端内加载（已实现并模拟宿主 API，未安装到 WE 实测）
- Windows 上 Chrome 的「共享音频」在不同版本/设备上的可用性
- 4096² 档（显式拒绝，约 1 GB 实例缓冲）

## 4. 复现命令

```bash
# 复刻端：10 帧分布
node tools/capture.mjs --out out/continuous --grid 160 --shots 10 --interval 400 --secs 5

# 复刻端：关流星隔离特效
node tools/capture.mjs --out out/nm --grid 160 --shots 10 --interval 400 --secs 5 --nometeor 1

# 原壁纸：同一条 128 band 刺激
node tools/ref-shot.mjs --out out/ref --shots 3 --secs 7

# 原壁纸：指定主题（模块赋值瞬间注入，避免 lerp 未收敛）
node tools/ref-shot.mjs --out out/ref-gold --theme golden-hour --shots 3

# 指标
python tools/compare.py out/ref/ref-0.png out/ours/shot-0.png
```

## 5. 一句话总结

**下游（着色器、色板、参数、几何、音频度量、触发、特效、面板）是同源移植；
上游（浏览器如何得到 128 band）是唯一近似，且在 WE 宿主模式下也被消除。**
