#!/usr/bin/env python3
"""配色核验：截图 → 主色统计 → 与《音域回响》nocturnal 理论色对照。

纯标准库 + ffmpeg 解码（PNG → rgb24 raw），不依赖 PIL/numpy。

用法：
  python colorcheck.py shot1.png [shot2.png ...]
  python colorcheck.py --mask 0,250,360,470 shot1.png shot2.png   # 剔除播放器卡片区

参照色来自壁纸打包产物里的主题表（nocturnal/霁紫），是运行时
直接喂给着色器的 uniform 值：
  bg    baseColor1  (0.005, 0.008, 0.025)  #010206
  deep  baseColor2  (0.015, 0.025, 0.070)  #040612
  core  coolCore    (0.350, 0.100, 0.900)  #591ae6
  edge  coolEdge    (0.150, 0.000, 0.450)  #260073
  warm  warmCore    (0.650, 0.250, 1.000)  #a640ff
  rip   rippleColor (0.500, 0.200, 1.000)  #8033ff
  peak  peakColor   (1.000, 0.550, 0.050)  #ff8c0d
"""
import math
import subprocess
import sys
import tempfile
import os

REF = {
    "bg":   (0.005, 0.008, 0.025),
    "deep": (0.015, 0.025, 0.070),
    "core": (0.350, 0.100, 0.900),
    "edge": (0.150, 0.000, 0.450),
    "warm": (0.650, 0.250, 1.000),
    "rip":  (0.500, 0.200, 1.000),
    "peak": (1.000, 0.550, 0.050),
}

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def decode(path, w, h):
    """PNG → (w,h,3) 字节串。先用 ffmpeg 探尺寸再转 raw。"""
    probe = subprocess.run(
        [FFMPEG, "-i", path, "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # 从 stderr 里抠尺寸
    size = None
    for tok in probe.stderr.replace(",", " ").split():
        if tok.endswith("x") is False and "x" in tok:
            try:
                a, b = tok.split("x", 1)
                a, b = int(a), int(b[:0] or 0) if False else int("".join(c for c in b if c.isdigit()))
                if 16 <= a <= 8192 and 16 <= b <= 8192:
                    size = (a, b)
            except ValueError:
                continue
    if not size:
        raise RuntimeError("无法解析图片尺寸: " + path)
    w, h = size
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as f:
        raw = f.name
    try:
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", path,
             "-vf", f"scale={w}:{h}", "-pix_fmt", "rgb24",
             "-f", "rawvideo", raw],
            check=True,
        )
        with open(raw, "rb") as f:
            data = f.read()
    finally:
        os.unlink(raw)
    return data, w, h


def rgb_to_hsl(r, g, b):
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h * 60, s, l


def dist2(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2))


def analyze(path, mask=None):
    """mask=(x0,y0,x1,y1) 像素矩形：整块剔除，所有比率基于剩余有效像素。

    用途：被测帧左侧有播放器卡片（半透明玻璃 + 粉色封面），参照壁纸没有 UI。
    诊断已确认封面几乎不贡献琥珀像素（0–1.9%），但仍占约 8.6% 画幅并
    轻微影响亮度统计。用同一矩形对两端都剔除，可做敏感性检验。
    """
    data, w, h = decode(path, 0, 0)
    n = len(data) // 3
    if n == 0:
        raise RuntimeError("空图像: " + path)

    lumas = []
    hue_w = {}      # 5° 一桶的色相直方图（按亮度加权，只统计亮区）
    lit_r = lit_g = lit_b = lit_n = 0
    dark_r = dark_g = dark_b = dark_n = 0
    amber_n = violet_n = masked_n = 0

    for i in range(n):
        if mask:
            x, y = i % w, i // w
            if mask[0] <= x < mask[2] and mask[1] <= y < mask[3]:
                masked_n += 1
                continue
        r, g, b = data[i * 3], data[i * 3 + 1], data[i * 3 + 2]
        l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
        lumas.append(l)
        if l > 0.045:  # 亮区：参与主色统计
            lit_r += r; lit_g += g; lit_b += b; lit_n += 1
            hh, ss, _ = rgb_to_hsl(r, g, b)
            if ss > 0.18:
                bucket = int(hh // 5) * 5
                hue_w[bucket] = hue_w.get(bucket, 0) + l
            # 色族判定。原写法 `min(d_amb, 99) < 0.09` 有两个问题：
            #   ① dist2 的上界是 3，min(...,99) 恒等于 d_amb，是无效分支；
            #   ② 0.09 的 RGB 距离只认「几乎等于 peakColor 本身」的像素。
            # 峰顶经辉光 + 软压缩后实际是蜜桃色（≈#ffd0a0），距 #ff8c0d
            # 约 0.6，于是参照图和被测图双双报 0——是指标失真，不是没有琥珀。
            # 改用色相族判据：暖峰 12–70°、紫族 240–315°，并保留近距离兜底。
            d_amb = dist2((r / 255, g / 255, b / 255), REF["peak"])
            d_vio = dist2((r / 255, g / 255, b / 255), REF["core"])
            d_wam = dist2((r / 255, g / 255, b / 255), REF["warm"])
            is_amber = 12 <= hh <= 70 and ss > 0.18 and l > 0.20
            is_violet = 240 <= hh <= 315 and ss > 0.18
            if is_amber or d_amb < 0.09:
                amber_n += 1
            elif is_violet or d_vio < 0.12 or d_wam < 0.12:
                violet_n += 1
        elif l > 0.002:
            dark_r += r; dark_g += g; dark_b += b; dark_n += 1

    lumas.sort()
    valid = len(lumas)
    if valid == 0:
        raise RuntimeError("遮罩后无有效像素: " + path)
    out = {
        "file": os.path.basename(path),
        "px": valid,
        "masked_px": masked_n,
        "mean_luma": sum(lumas) / valid,
        "p05_luma": lumas[int(valid * 0.05)],
        "p50_luma": lumas[int(valid * 0.50)],
        "p90_luma": lumas[int(valid * 0.90)],
        "lit_ratio": lit_n / valid,
    }
    if lit_n:
        out["lit_mean_rgb"] = [lit_r / lit_n / 255, lit_g / lit_n / 255, lit_b / lit_n / 255]
    if dark_n:
        out["dark_mean_rgb"] = [dark_r / dark_n / 255, dark_g / dark_n / 255, dark_b / dark_n / 255]
    # 主色相：亮区里加权重心 ± 半径
    if hue_w:
        # 用圆周平均
        sx = sy = sw = 0.0
        for bucket, wgt in hue_w.items():
            rad = math.radians(bucket + 2.5)
            sx += math.cos(rad) * wgt
            sy += math.sin(rad) * wgt
            sw += wgt
        mean_hue = (math.degrees(math.atan2(sy, sx)) + 360) % 360
        # 色相集中度 = 合矢量长度 / 总权重
        conc = math.hypot(sx, sy) / sw if sw else 0
        out["lit_hue_deg"] = mean_hue
        out["hue_conc"] = conc
        top = sorted(hue_w.items(), key=lambda kv: -kv[1])[:3]
        out["hue_top3"] = [(b, round(w / sw, 3)) for b, w in top]
    out["violet_px"] = violet_n
    out["amber_px"] = amber_n
    out["amber_ratio"] = amber_n / valid
    return out


def fmt_rgb(c):
    return "#{:02x}{:02x}{:02x}".format(
        round(c[0] * 255), round(c[1] * 255), round(c[2] * 255)
    )


def main():
    args = sys.argv[1:]
    mask = None
    if "--mask" in args:
        i = args.index("--mask")
        try:
            vals = tuple(int(v) for v in args[i + 1].split(","))
            if len(vals) != 4 or vals[0] >= vals[2] or vals[1] >= vals[3]:
                raise ValueError
            mask = vals
        except (IndexError, ValueError):
            print("--mask 需要 x0,y0,x1,y1 四个像素坐标，且 x1>x0 / y1>y0")
            sys.exit(1)
        del args[i:i + 2]
    if not args:
        print(__doc__)
        sys.exit(1)
    print("参照（壁纸 nocturnal）:")
    for k, v in REF.items():
        print(f"  {k:<5} {fmt_rgb(v)}")
    if mask:
        print(f"遮罩（两端统一剔除）: {mask}，对照时请两端都带同一 --mask")
    print()
    for path in args:
        try:
            r = analyze(path, mask)
        except Exception as e:
            print(f"{path}: 失败 {e}")
            continue
        print(f"── {r['file']} ({r['px']}px"
              f"{', 剔除 ' + str(r['masked_px']) if mask else ''})")
        print(f"   亮度 mean={r['mean_luma']:.4f} p05={r['p05_luma']:.4f} "
              f"p50={r['p50_luma']:.4f} p90={r['p90_luma']:.4f}")
        print(f"   亮区占比 {r['lit_ratio']*100:.1f}%  紫族px {r['violet_px']}  "
              f"琥珀px {r['amber_px']} ({r['amber_ratio']*100:.2f}%)")
        if "lit_mean_rgb" in r:
            print(f"   亮区均色 {fmt_rgb(r['lit_mean_rgb'])}")
        if "dark_mean_rgb" in r:
            print(f"   暗区均色 {fmt_rgb(r['dark_mean_rgb'])}")
        if "lit_hue_deg" in r:
            print(f"   亮区主色相 {r['lit_hue_deg']:.0f}° 集中度 {r['hue_conc']:.2f} top3={r['hue_top3']}")
        print()


if __name__ == "__main__":
    main()
