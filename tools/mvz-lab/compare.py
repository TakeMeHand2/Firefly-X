#!/usr/bin/env python3
"""改前 / 改后对照。

两组对照，性质不同，必须分开看：
  A. 同一构建内 oldbin vs bin —— 单变量对照，中间只差削顶顺序那一行。
  B. run2 vs run4 —— 两个构建之间，包住了插桩改动，只能看「有没有意外漂移」。
"""
import json
import sys


def load(p):
    return json.load(open(p, encoding="utf-8"))


def g(d, *ks, default=None):
    for k in ks:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def fmt(v):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.3f}"
    return str(v)


def main():
    A = load(sys.argv[1])   # run2，旧构建
    B = load(sys.argv[2])   # run4，新构建
    L = []
    a = L.append

    a("# 改前 / 改后\n")
    a("## A. 单变量对照：同一构建内，只差削顶顺序\n")
    a("两次运行用的是同一份构建、同一段注入信号、同一台 headless（间隔约一分钟），"
      "唯一差别是 `fillStim` 走 `oldbin`（复刻旧顺序）还是 `bin`（调用当前 `shapeBin`）。\n")
    a("| 频段 | 旧顺序上限 | 现顺序上限 | 倍率 | 预测 1/tilt |")
    a("|---|---|---|---|---|")
    for band in ("subBass", "mid", "air"):
        o = g(B, "bins", "old", band, "ceiling")
        n = g(B, "bins", "new", band, "ceiling")
        ratio = round(n / o, 2) if o else None
        a(f"| {band} | {fmt(o)} | {fmt(n)} | {ratio} | "
          f"{fmt(g(B, 'bins', 'new', band, 'predicted_ceiling_if_clipped'))} |")

    a("\n## B. 跨构建：注入路径的对照项（应当不变）\n")
    a("这些指标走的是注入通道，不经过前端整形，所以修复不该动它们。"
      "如果动了，说明改动的影响面超出解释范围。\n")
    a("| 指标 | 旧构建 | 新构建 | 变化 |")
    a("|---|---|---|---|")
    for name, pa, pb in [
        ("subBass 阶跃 t63 (ms)", ("steps", "step_sub", "t63_ms"), ("steps", "step_sub", "t63_ms")),
        ("air 阶跃 t63 (ms)", ("steps", "step_air", "t63_ms"), ("steps", "step_air", "t63_ms")),
        ("air 阶跃 t90 (ms)", ("steps", "step_air", "t90_ms"), ("steps", "step_air", "t90_ms")),
        ("单帧冲击亮度延迟 (ms)", ("impulse", "luma_lag_ms"), ("impulse", "luma_lag_ms")),
        ("四踩：频段内部 r", ("fourfloor", "band_r"), ("fourfloor", "band_r")),
        ("四踩：逐帧变化量 r", ("fourfloor", "motion_r"), ("fourfloor", "motion_r")),
        ("四踩：亮区 P90 r", ("fourfloor", "p90_r"), ("fourfloor", "p90_r")),
        ("flash20 最大单帧 ΔL", ("flash", "flash20", "max_step_dL"), ("flash", "flash20", "max_step_dL")),
    ]:
        va, vb = g(A, *pa), g(B, *pb)
        d = (vb - va) if isinstance(va, (int, float)) and isinstance(vb, (int, float)) else None
        a(f"| {name} | {fmt(va)} | {fmt(vb)} | {('+' if (d or 0) > 0 else '') + f'{d:.3f}' if d is not None else '—'} |")

    a("\n## C. 真实音频通道\n")
    lv = g(B, "live") or {}
    if not lv:
        a("未采到。")
    elif not lv.get("valid", True):
        a(f"未接通：{lv.get('silent_ratio')} 的帧频段全为 0，"
          "说明 headless 里音频没有真正进到分析器（自动播放策略或跨域污染）。"
          "此通道的数据不可用于结论。")
    else:
        a(f"有效帧 {lv.get('frames')}，全零占比 {lv.get('silent_ratio')}，"
          f"逐帧变化量 r={lv.get('motion_r')} @ {lv.get('motion_lag_ms')}ms，"
          f"亮区 P90 r={lv.get('p90_r')} @ {lv.get('p90_lag_ms')}ms。")

    txt = "\n".join(L) + "\n"
    print(txt)
    open("tools/mvz-lab/out/compare.md", "w", encoding="utf-8").write(txt)
    print("-> tools/mvz-lab/out/compare.md")


if __name__ == "__main__":
    main()
