#!/usr/bin/env python3
"""逐帧数据分析：纯标准库，不依赖 numpy。

输入是 capture.mjs 落盘的 {meta, rows}，每行 25 列：
  0 帧号  1 时间  2 平均亮度(相对亮度)  3 帧哈希  4 punch  5 idle  6 energy
  7..14 频段原始值 b0..b7     15..22 平滑值 s0..s7
  23 亮区 P90（sRGB 0..1）    24 逐像素平均变化量

只回答五个问题：阶跃多快、上限在哪、画面跟不跟得上、闪不闪、能不能复现。
不写主观判断，只出数字。
"""
import json
import math
import os
import sys

FPS = 60.0
FRAME_MS = 1000.0 / FPS
WARMUP = 0.6  # 首帧黑场、着色器编译、卡片布局都在这段时间里落定

B_SM = 15
LPUMA = 2
LP90 = 23
MOTION = 24
LTS = 1
HASH = 3

BAND_NAMES = ["subBass", "bass", "lowMid", "mid", "highMid", "presence", "brilliance", "air"]
BANDS = [(0, 62), (63, 105), (106, 131), (132, 156), (157, 180), (181, 200), (201, 217), (218, 236)]


def tilt_mean(b):
    s, e = BANDS[b]
    return sum(1 + (i / 256.0) ** 1.4 * 2.6 for i in range(s, e + 1)) / (e - s + 1)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def col(rows, i):
    return [r[i] for r in rows]


def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def window(rows, t0, t1):
    return [r for r in rows if t0 <= r[LTS] <= t1]


def body(rows):
    """去掉预热段。首帧是纯黑，不剔掉会把 min 拉到 0，range 被放大一个数量级。"""
    return [r for r in rows if r[LTS] >= WARMUP]


def pearson(a, b):
    n = min(len(a), len(b))
    if n < 3:
        return 0.0
    a, b = a[:n], b[:n]
    ma, mb = mean(a), mean(b)
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((x - mb) ** 2 for x in b)
    if va <= 0 or vb <= 0:
        return 0.0
    return sum((a[i] - ma) * (b[i] - mb) for i in range(n)) / math.sqrt(va * vb)


def detrend(x, win=20):
    out = []
    n = len(x)
    for i in range(n):
        lo = max(0, i - win)
        hi = min(n, i + win + 1)
        out.append(x[i] - mean(x[lo:hi]))
    return out


def amp_at(x, f, fs=FPS):
    """单频幅度（Goertzel 的直算式）。用来量「有多少亮度变化锁在节拍上」。"""
    n = len(x)
    if n < 4:
        return 0.0
    w = 2 * math.pi * f / fs
    re = sum(x[i] * math.cos(w * i) for i in range(n))
    im = sum(x[i] * math.sin(w * i) for i in range(n))
    return 2 * math.sqrt(re * re + im * im) / n


def rms(x):
    return math.sqrt(mean([v * v for v in x])) if x else 0.0


def step_metrics(rows, band, onset):
    pre = [r[B_SM + band] for r in window(rows, max(WARMUP, onset - 0.8), onset - 0.05)]
    post = window(rows, onset, onset + 5)
    if not pre or not post:
        return None
    base = mean(pre)
    steady = mean([r[B_SM + band] for r in post if r[LTS] >= onset + 2.5])
    span = steady - base
    if abs(span) < 1e-4:
        return None

    def first(frac):
        target = base + span * frac
        for r in post:
            if r[B_SM + band] >= target:
                return r[LTS] - onset
        return None

    t63, t90 = first(0.632), first(0.9)
    peak = max(r[B_SM + band] for r in post)
    return {
        "band": BAND_NAMES[band],
        "steady": round(steady, 4),
        "gain": round(steady / 0.7, 4),
        "t63_frames": round(t63 * FPS, 2) if t63 is not None else None,
        "t63_ms": round(t63 * 1000, 1) if t63 is not None else None,
        "t90_frames": round(t90 * FPS, 2) if t90 is not None else None,
        "t90_ms": round(t90 * 1000, 1) if t90 is not None else None,
        "overshoot": round((peak - steady) / span, 4)
    }


def impulse_metrics(rows):
    onset = 2.0
    post = window(rows, onset, onset + 1.5)
    if not post:
        return None
    lum = col(post, LPUMA)
    base = mean(col(window(rows, WARMUP, onset - 0.1), LPUMA))
    pk = max(range(len(lum)), key=lambda i: lum[i])
    rise = lum[pk] - base
    s0 = col(post, B_SM)
    s0pk = max(range(len(s0)), key=lambda i: s0[i])
    decay = None
    for r in post[pk:]:
        if r[LPUMA] - base <= rise * 0.1:
            decay = r[LTS] - onset
            break
    mo = col(post, MOTION)
    mopk = max(range(len(mo)), key=lambda i: mo[i])
    return {
        "luma_base": round(base, 6),
        "luma_peak": round(lum[pk], 6),
        "luma_delta_abs": round(rise, 6),
        "luma_lag_ms": round(pk * FRAME_MS, 1),
        "band_lag_ms": round(s0pk * FRAME_MS, 1),
        "motion_lag_ms": round(mopk * FRAME_MS, 1),
        "decay10_ms": round(decay * 1000, 1) if decay is not None else None
    }


def sweep_metrics(rows, band):
    post = window(rows, 1.0, 6.9)
    if not post:
        return None
    out = col(post, B_SM + band)
    ceiling = mean([r[B_SM + band] for r in post if r[LTS] >= 5.4])
    inp = [min(1.0, max(0.0, (r[LTS] - 1.0) / 4.0)) for r in post]
    ramp = [(u, v) for u, v in zip(inp, out) if 0.05 < u < 0.95]
    return {
        "band": BAND_NAMES[band],
        "ceiling": round(ceiling, 4),
        "linearity_r": round(pearson([u for u, _ in ramp], [v for _, v in ramp]), 4) if ramp else 0.0,
        "predicted_ceiling_if_clipped": round(1.0 / tilt_mean(band), 4)
    }


def flash_metrics(rows, hz):
    """闪烁：用亮区 P90（眼睛看的部分），不是被背景稀释的全屏均值。"""
    rows = body(rows)
    p = col(rows, LP90)
    if not p:
        return None
    lo, hi = min(p), max(p)
    rng = hi - lo
    d = [r[LTS] for r in rows]
    dur = d[-1] - d[0]
    if rng <= 1e-6:
        return {"nominal_hz": hz, "flashes_per_s": 0.0, "delta_p90": 0.0}
    t_hi, t_lo = lo + rng * 0.75, lo + rng * 0.25
    state, events = 0, []
    for r in rows:
        v = r[LP90]
        if state == 0 and v >= t_hi:
            state = 1
            events.append(r[LTS])
        elif state == 1 and v <= t_lo:
            state = 0
    worst = max((sum(1 for b in events if a <= b < a + 1.0) for a in events), default=0)
    dp = detrend(p, 20)
    # 峰值逐帧变化：WCAG 的判据就是这个量级（相对亮度 0.1 = 10% 绝对刻度）
    max_step = max((abs(p[i] - p[i - 1]) for i in range(1, len(p))), default=0.0)
    a0 = amp_at(dp, hz)
    return {
        "nominal_hz": hz,
        "flashes_per_s": round(len(events) / dur, 2) if dur > 0 else 0,
        "worst_1s": worst,
        "p90_min": round(lo, 4),
        "p90_max": round(hi, 4),
        "delta_p90": round(rng, 4),
        "modulation": round(rng / hi, 3) if hi > 0 else 0,
        "lock_ratio": round(a0 / rms(dp), 3) if rms(dp) > 0 else 0,
        "max_step_dL": round(max_step, 4),
        "wcag_flash": max_step >= 0.1
    }


def reactivity(rows, bpm=128):
    """画面反应度：底鼓包络 vs 逐像素变化量 / 亮区亮度。
    内部链路（底鼓→频段）与外部链路（底鼓→像素）分开算，差值就是渲染损耗。"""
    post = window(rows, 1.0, 6.9)
    if len(post) < 40:
        return None
    kick = []
    for r in post:
        bt = (r[LTS] * bpm) / 60.0
        kick.append(math.exp(-(bt - math.floor(bt)) * 9))
    kl = detrend(kick, 20)

    def best_lag(x):
        xl = detrend(x, 20)
        b = (-2, 0.0)
        for lag in range(0, 26):
            r = pearson(kl[: len(kl) - lag], xl[lag:])
            if r > b[1]:
                b = (lag, r)
        return b

    def lock(x, f):
        xl = detrend(x, 20)
        return round(amp_at(xl, f) / rms(xl), 3) if rms(xl) > 0 else 0

    f0 = bpm / 60.0
    m = best_lag(col(post, MOTION))
    l = best_lag(col(post, LPUMA))
    q = best_lag(col(post, LP90))
    i = best_lag(col(post, B_SM + 1))
    return {
        "band_r": round(i[1], 3), "band_lag_ms": round(i[0] * FRAME_MS, 1),
        "motion_r": round(m[1], 3), "motion_lag_ms": round(m[0] * FRAME_MS, 1),
        "luma_r": round(l[1], 3), "luma_lag_ms": round(l[0] * FRAME_MS, 1),
        "p90_r": round(q[1], 3), "p90_lag_ms": round(q[0] * FRAME_MS, 1),
        "motion_lock": lock(col(post, MOTION), f0),
        "p90_lock": lock(col(post, LP90), f0),
        "motion_mean": round(mean(col(post, MOTION)), 6)
    }


def live_metrics(rows):
    """真实音频：先确认音频到底有没有在跑，再谈相关性。
    全零帧占比高就是「没接上」，此时任何相关系数都应视为无效。"""
    b = body(rows)
    if not b:
        return None
    energy = [sum(r[7:15]) for r in b]
    silent = sum(1 for e in energy if e <= 1e-6)
    ref = detrend(col(b, 8), 20)  # b1 = bass
    if rms(ref) <= 1e-9:
        return {"silent_ratio": 1.0, "valid": False}

    def corr(x, win=20):
        xl = detrend(x, win)
        best = (-2, 0.0)
        for lag in range(0, 13):
            rr = pearson(ref[: len(ref) - lag], xl[lag:])
            if rr > best[1]:
                best = (lag, rr)
        return best

    mo = corr(col(b, MOTION))
    q = corr(col(b, LP90))
    lu = corr(col(b, LPUMA))
    return {
        "frames": len(b),
        "silent_ratio": round(silent / len(b), 3),
        "valid": silent / len(b) < 0.5,
        "mean_band_energy": round(mean(energy), 4),
        "motion_r": round(mo[1], 3), "motion_lag_ms": round(mo[0] * FRAME_MS, 1),
        "p90_r": round(q[1], 3), "p90_lag_ms": round(q[0] * FRAME_MS, 1),
        "luma_r": round(lu[1], 3), "luma_lag_ms": round(lu[0] * FRAME_MS, 1)
    }


def live_metrics(rows):
    """真实音频：先确认音频到底有没有在跑，再谈相关性。
    全零帧占比高就是「没接上」，此时任何相关系数都应视为无效。"""
    b = body(rows)
    if not b:
        return None
    energy = [sum(r[7:15]) for r in b]
    silent = sum(1 for e in energy if e <= 1e-6)
    ref = detrend(col(b, 8), 20)  # b1 = bass
    if rms(ref) <= 1e-9:
        return {"silent_ratio": 1.0, "valid": False}

    def corr(x, win=20):
        xl = detrend(x, win)
        best = (-2, 0.0)
        for lag in range(0, 13):
            rr = pearson(ref[: len(ref) - lag], xl[lag:])
            if rr > best[1]:
                best = (lag, rr)
        return best

    mo = corr(col(b, MOTION))
    q = corr(col(b, LP90))
    lu = corr(col(b, LPUMA))
    return {
        "frames": len(b),
        "silent_ratio": round(silent / len(b), 3),
        "valid": silent / len(b) < 0.5,
        "mean_band_energy": round(mean(energy), 4),
        "motion_r": round(mo[1], 3), "motion_lag_ms": round(mo[0] * FRAME_MS, 1),
        "p90_r": round(q[1], 3), "p90_lag_ms": round(q[0] * FRAME_MS, 1),
        "luma_r": round(lu[1], 3), "luma_lag_ms": round(lu[0] * FRAME_MS, 1)
    }


def determinism(dir_a, dir_b, names):
    out = {}
    for n in names:
        pa, pb = os.path.join(dir_a, n + ".json"), os.path.join(dir_b, n + ".json")
        if not (os.path.exists(pa) and os.path.exists(pb)):
            continue
        a, b = load(pa), load(pb)
        ha, hb = col(a["rows"], HASH), col(b["rows"], HASH)
        k = min(len(ha), len(hb))
        same = sum(1 for i in range(k) if ha[i] == hb[i])
        # 预热期（封面异步加载 → 调色板落定）之后是否逐帧一致，
        # 才是「这条渲染管线是否确定性」的判据
        warm = [i for i in range(k) if a["rows"][i][LTS] >= 1.5]
        same_w = sum(1 for i in warm if ha[i] == hb[i])
        out[n] = {
            "frames": [len(ha), len(hb)],
            "identical": same,
            "ratio": round(same / k, 3) if k else 0,
            "first_divergence": next((i for i in range(k) if ha[i] != hb[i]), None),
            "after_warm_count": len(warm),
            "after_warm_ratio": round(same_w / len(warm), 4) if warm else 0
        }
    return out


def main():
    d, rerun = "tools/mvz-lab/out/base", None
    for i, a in enumerate(sys.argv):
        if a == "--dir":
            d = sys.argv[i + 1]
        if a == "--rerun":
            rerun = sys.argv[i + 1]

    files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
    have = {}
    for f in files:
        obj = load(os.path.join(d, f))
        if isinstance(obj, dict) and "meta" in obj:  # 跳过上一次生成的 report.json
            have[f[:-5]] = obj
    r = {"source": d}

    if "impulse" in have:
        r["impulse"] = impulse_metrics(have["impulse"]["rows"])
    r["steps"] = {
        n: step_metrics(v["rows"], int(v["meta"]["stim"].replace("step", "")), 1.0)
        for n, v in have.items() if n.startswith("step_")
    }
    r["sweeps"] = {
        n: sweep_metrics(v["rows"], int(v["meta"]["stim"].replace("sweep", "")))
        for n, v in have.items() if n.startswith("sweep_")
    }
    clips = {
        n: sweep_metrics(v["rows"], int(v["meta"]["stim"].replace("clip", "")))
        for n, v in have.items() if n.startswith("clip_")
    }
    if clips:
        r["clips"] = clips

    # 旧顺序 / 现顺序并列测同一件事，中间只差前端那一行
    bins = {"old": {}, "new": {}}
    for n, v in have.items():
        stim = v["meta"]["stim"]
        if n.startswith("oldbin_"):
            b = int(stim.replace("oldbin", ""))
            bins["old"][BAND_NAMES[b]] = sweep_metrics(v["rows"], b)
        elif n.startswith("bin_"):
            b = int(stim.replace("bin", ""))
            bins["new"][BAND_NAMES[b]] = sweep_metrics(v["rows"], b)
    if bins["old"] or bins["new"]:
        r["bins"] = bins

    # 旧顺序 / 现顺序并列测同一件事，中间只差前端那一行
    bins = {"old": {}, "new": {}}
    for n, v in have.items():
        stim = v["meta"]["stim"]
        if n.startswith("oldbin_"):
            b = int(stim.replace("oldbin", ""))
            bins["old"][BAND_NAMES[b]] = sweep_metrics(v["rows"], b)
        elif n.startswith("bin_"):
            b = int(stim.replace("bin", ""))
            bins["new"][BAND_NAMES[b]] = sweep_metrics(v["rows"], b)
    if bins["old"] or bins["new"]:
        r["bins"] = bins
    r["flash"] = {
        n: flash_metrics(v["rows"], float(v["meta"]["stim"].replace("flash", "")))
        for n, v in have.items() if n.startswith("flash")
    }
    if "fourfloor" in have:
        r["fourfloor"] = reactivity(have["fourfloor"]["rows"])
    if "live" in have:
        r["live"] = live_metrics(have["live"]["rows"])
    if "live" in have:
        r["live"] = live_metrics(have["live"]["rows"])
    if "silence" in have:
        rows = have["silence"]["rows"]
        r["silence"] = {
            "luma_mean": round(mean(col(rows, LPUMA)), 6),
            "p90_mean": round(mean(col(rows, LP90)), 4),
            "motion_mean": round(mean(col(body(rows), MOTION)), 6),
            "frames": len(rows),
            "distinct_frames": len(set(col(rows, HASH)))
        }
    if rerun:
        r["determinism"] = determinism(d, rerun, [f[:-5] for f in files])

    out = os.path.join(d, "report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    print("\n-> " + out)


if __name__ == "__main__":
    main()
