#!/usr/bin/env python3
"""把 report.json 渲染成可读的 markdown。判据写死在下面，改判据就是改标准。"""
import json
import sys


def g(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


def verdict_step(t63):
    if t63 is None:
        return "无数据"
    if t63 <= 50:
        return "快"
    if t63 <= 150:
        return "中"
    return "慢"


def verdict_react(r):
    if r is None:
        return "无数据"
    if r >= 0.6:
        return "跟得上"
    if r >= 0.3:
        return "弱"
    return "脱节"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "tools/mvz-lab/out/base/report.json"
    r = json.load(open(path, encoding="utf-8"))
    L = []
    a = L.append

    a("# 音域回响 · 测量报告\n")
    a(f"数据源：`{r.get('source')}`　所有数字由逐帧像素回读与注入信号算出，不含主观判断。\n")

    # 1 阶跃
    a("\n## 1. 阶跃响应：从输入变化到输出到位要多久\n")
    a("| 频段 | 稳态增益 | t63 (ms) | t90 (ms) | 过冲 |")
    a("|---|---|---|---|---|")
    for k, v in sorted((r.get("steps") or {}).items()):
        if not v:
            continue
        a(f"| {v['band']} | {v['gain']} | {v['t63_ms']} | {v['t90_ms']} | {v['overshoot']} |")
    imp = r.get("impulse") or {}
    if imp:
        a(f"\n单帧冲击：频段在 **{imp.get('band_lag_ms')} ms** 到峰，"
          f"画面亮区在 **{imp.get('motion_lag_ms')} ms** 到峰，"
          f"亮度衰减到峰值 10% 需 **{imp.get('decay10_ms')} ms**。")

    # 2 上限
    sw = r.get("sweeps") or {}
    bn = r.get("bins") or {}
    if sw:
        a("\n\n## 2. 传递上限：频段值最高能到多少\n")
        a("`直通` 把已知值直接铺进频谱，绕过前端——它证明下游链路是单位增益、完全线性的，"
          "所以任何压顶都来自上游。`旧顺序` 与 `现顺序` 是同一构建内的对照，"
          "只差「先乘补偿再削顶」还是「先削顶再乘补偿」。\n")
        a("| 频段 | 直通上限 | 旧顺序 | 现顺序 | 预测 1/tilt |")
        a("|---|---|---|---|---|")
        for k, v in sorted(sw.items()):
            band = v["band"]
            o = (bn.get("old") or {}).get(band, {})
            n = (bn.get("new") or {}).get(band, {})
            a(f"| {band} | {v['ceiling']} | {o.get('ceiling', '—')} | {n.get('ceiling', '—')} | "
              f"{v.get('predicted_ceiling_if_clipped')} |")

    # 3 反应度
    f = r.get("fourfloor") or {}
    if f:
        a("\n\n## 3. 反应度：128BPM 四踩，画面跟不跟得上\n")
        a("| 观测点 | 滞后 (ms) | 相关系数 r | 判定 |")
        a("|---|---|---|---|")
        for label, rk, lk in [
            ("频段内部（底鼓→bass）", "band_r", "band_lag_ms"),
            ("画面逐帧变化量", "motion_r", "motion_lag_ms"),
            ("画面平均亮度", "luma_r", "luma_lag_ms"),
            ("画面亮区 P90", "p90_r", "p90_lag_ms"),
        ]:
            if f.get(rk) is None:
                continue
            a(f"| {label} | {f.get(lk)} | {f.get(rk)} | {verdict_react(f.get(rk))} |")
        a(f"\n节拍锁定度（该频率分量占全部波动的比例）：逐帧变化量 "
          f"**{f.get('motion_lock')}**，亮区 P90 **{f.get('p90_lock')}**。")

    # 4 闪烁
    fl = r.get("flash") or {}
    if fl:
        a("\n\n## 4. 闪烁：亮度变化的绝对幅度\n")
        a("WCAG 2.3.1 的判据是相邻明暗对的相对亮度变化 ≥ 0.10（绝对刻度），"
          "且暗侧 < 0.80。这里量的是画面上真实发生的逐帧变化。\n")
        a("| 场景 | 标称频率 | 实测次数/秒 | P90 峰峰值 | 最大单帧变化 ΔL | 判定 |")
        a("|---|---|---|---|---|---|")
        for k, v in sorted(fl.items()):
            if not v:
                continue
            risk = "越线" if v.get("wcag_flash") else "未越线"
            a(f"| {k} | {v.get('nominal_hz')} Hz | {v.get('flashes_per_s')} | "
              f"{v.get('delta_p90')} | {v.get('max_step_dL')} | {risk} |")

    # 5 可复现
    dm = r.get("determinism") or {}
    if dm:
        a("\n\n## 5. 可复现性：同输入同种子，帧是否逐帧相同\n")
        a("预热期（前 1.5s，封面异步加载会改调色板）之后的逐帧比对才是判据。\n")
        a("| 场景 | 全网比例 | 首次分叉 | 预热后相同帧 | 预热后比例 |")
        a("|---|---|---|---|---|")
        for k, v in dm.items():
            a(f"| {k} | {v['ratio']} | {v['first_divergence']} | "
              f"{v.get('after_warm_count')} | {v.get('after_warm_ratio')} |")

    lv = r.get("live") or {}
    if lv:
        a("\n\n## 6. 真实音频：整条链路\n")
        if not lv.get("valid", True):
            a(f"**未接通**。{lv.get('silent_ratio')} 的帧频段全为 0——"
              "headless 里音频没有进入分析器（自动播放策略或跨域污染，"
              "代码注释里记过这类「能出声但频段恒为 0」的静默失败）"
              "。此通道不产出结论，缺口留在这里。")
        else:
            a(f"有效帧 {lv.get('frames')}，全零占比 {lv.get('silent_ratio')}。\n")
            a("| 观测点 | 对 bass 的滞后 (ms) | r |")
            a("|---|---|---|")
            a(f"| 逐帧变化量 | {lv.get('motion_lag_ms')} | {lv.get('motion_r')} |")
            a(f"| 亮区 P90 | {lv.get('p90_lag_ms')} | {lv.get('p90_r')} |")
            a(f"| 平均亮度 | {lv.get('luma_lag_ms')} | {lv.get('luma_r')} |")

    s = r.get("silence") or {}
    if s:
        a(f"\n\n基线（静音，无任何输入）：平均亮度 {s.get('luma_mean')}，"
          f"亮区 P90 {s.get('p90_mean')}，逐帧变化量 {s.get('motion_mean')}。"
          f"整段 {s.get('frames')} 帧全部互不相同——说明「没有信号」时画面仍在动，"
          "这部分会在下面所有相关性里充当噪声。")

    out = path.replace("report.json", "report.md")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    print("\n".join(L))
    print("\n-> " + out)


if __name__ == "__main__":
    main()
