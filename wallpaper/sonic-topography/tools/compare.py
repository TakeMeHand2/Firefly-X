#!/usr/bin/env python3
"""同口径图像对照：亮度分位、分区均值、亮区重心/包围盒、暖色占比。

用法：python tools/compare.py ref.png ours.png
依赖 ffmpeg 解码 + numpy；不依赖 PIL。
"""
import subprocess
import sys
import numpy as np


def load(path, w=1280, h=720):
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={w}:{h}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ])
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(np.float32) / 255.0


def lum(img):
    return 0.2126 * img[:, :, 0] + 0.7152 * img[:, :, 1] + 0.0722 * img[:, :, 2]


def stats(img, name):
    y = lum(img)
    h, w = y.shape
    print(f"\n── {name}")
    print(f"   mean={y.mean():.4f} p50={np.percentile(y,50):.4f} p90={np.percentile(y,90):.4f} p99={np.percentile(y,99):.4f} max={y.max():.3f}")
    bright = y > 0.25
    print(f"   bright>0.25: {bright.mean()*100:.1f}%  >0.45: {(y>0.45).mean()*100:.2f}%")
    if bright.any():
        ys, xs = np.nonzero(bright)
        print(f"   bright centroid=({xs.mean()/w:.3f},{ys.mean()/h:.3f}) bbox=x[{xs.min()/w:.2f},{xs.max()/w:.2f}] y[{ys.min()/h:.2f},{ys.max()/h:.2f}]")
    # 3x3 分区均值
    tiles = []
    for ty in range(3):
        row = []
        for tx in range(3):
            t = y[ty*h//3:(ty+1)*h//3, tx*w//3:(tx+1)*w//3]
            row.append(f"{t.mean():.3f}")
        tiles.append(" ".join(row))
    print("   tiles(3x3):")
    for r in tiles:
        print("     ", r)
    # 琥珀（暖色）像素：r 高、b 低
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    amber = (r > 0.55) & (r > b * 1.35) & (g > b * 0.9)
    print(f"   amber px: {amber.sum()} ({amber.mean()*100:.2f}%)")
    if amber.any():
        ys, xs = np.nonzero(amber)
        print(f"   amber centroid=({xs.mean()/w:.3f},{ys.mean()/h:.3f}) bbox=x[{xs.min()/w:.2f},{xs.max()/w:.2f}] y[{ys.min()/h:.2f},{ys.max()/h:.2f}]")
    return y


def main():
    if len(sys.argv) < 3:
        print("usage: compare.py ref.png ours.png")
        return
    a = load(sys.argv[1])
    b = load(sys.argv[2])
    ya = stats(a, sys.argv[1])
    yb = stats(b, sys.argv[2])
    d = np.abs(ya - yb)
    print(f"\n== 差值: mean={d.mean():.4f} p90={np.percentile(d,90):.4f} max={d.max():.3f}")
    # 背景/地形/中心三带
    for label, sl in [("顶部 0-25%", slice(0, 180)), ("中部 25-60%", slice(180, 432)), ("底部 60-100%", slice(432, 720))]:
        print(f"   {label}: ref={ya[sl].mean():.4f} ours={yb[sl].mean():.4f}")


if __name__ == "__main__":
    main()
