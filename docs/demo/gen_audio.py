"""Synthesizes the demo soundtrack (music bed + UI sound effects) in sync with demo.html.

    python docs/demo/gen_audio.py      -> docs/demo/demo-audio.wav

Everything is generated from scratch with numpy, so there are no third-party audio assets.
Event times mirror the timeline in demo.html; keep them in step when editing either.
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 56.2
N = int(SR * DUR)
rng = np.random.default_rng(3)
L = np.zeros(N)
R = np.zeros(N)


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def add(sig, at, gain=1.0, pan=0.0):
    """Mix a mono signal in at time `at` (seconds); pan -1 (left) .. 1 (right)."""
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    R[i:i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def env(n, a, r, sustain=None):
    """Attack / exponential release envelope for n samples."""
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    tt = np.arange(n) / SR
    e *= np.exp(-np.maximum(tt - a, 0) / r) if sustain is None else 1
    return e


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------------------------------------------------------------- music bed
BPM = 100
BEAT = 60 / BPM
BAR = BEAT * 4
# Am - F - C - G  (as midi chords)
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]

music_L = np.zeros(N)
music_R = np.zeros(N)


def madd(sig, at, gain, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    music_L[i:i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    music_R[i:i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


bars = int(DUR / BAR) + 1
for b in range(bars):
    t0 = b * BAR
    ch = CHORDS[b % 4]
    # warm pad: detuned soft saw (few harmonics), slow swell
    tt = t_axis(BAR + 1.2)
    pad = np.zeros_like(tt)
    for k, m in enumerate(ch):
        f = hz(m)
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            for h in range(1, 6):
                pad += np.sin(2 * np.pi * ff * h * tt + k) / (h * 1.6)
    pad = lp(pad, 1400)
    e = np.minimum(tt / 0.9, 1) * np.minimum(1, np.maximum(0, (BAR + 1.2 - tt) / 1.2))
    madd(pad * e, t0, 0.010, pan=-0.2 if b % 2 else 0.2)

    # sub bass from the dashboard onwards
    if t0 >= 10.5:
        tb = t_axis(BAR)
        bass = np.sin(2 * np.pi * hz(ROOTS[b % 4] - 12) * tb) + 0.3 * np.sin(2 * np.pi * hz(ROOTS[b % 4]) * tb)
        madd(bass * env(len(tb), 0.02, 1.6), t0, 0.10)

    # plucked arpeggio in 8ths
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 24]
    for s, m in enumerate(arp):
        ts = t0 + s * BEAT / 2
        if ts < 2.0:
            continue
        tp = t_axis(0.6)
        f = hz(m)
        pl = (np.sin(2 * np.pi * f * tp) + 0.25 * np.sin(2 * np.pi * 2 * f * tp)) * env(len(tp), 0.003, 0.16)
        madd(pl, ts, 0.045, pan=0.35 if s % 2 else -0.35)

    # soft kick + hat once the app is on screen, resting during the exploded view
    for beat in range(4):
        tb0 = t0 + beat * BEAT
        if 11.0 <= tb0 < 35.0 or 43.8 <= tb0 < 49.6:
            tk = t_axis(0.35)
            kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-tk * 30)) * tk) * env(len(tk), 0.002, 0.09)
            madd(kick, tb0, 0.22)
            th = t_axis(0.08)
            hat = bp(rng.standard_normal(len(th)), 7000, 12000) * env(len(th), 0.001, 0.02)
            madd(hat, tb0 + BEAT / 2, 0.05, pan=0.3)

# master envelope for the music: fade in/out, gentle dip under the outro chord
mt = np.arange(N) / SR
menv = np.clip(mt / 1.5, 0, 1) * np.clip((DUR - mt) / 3.0, 0, 1)
L += music_L * menv
R += music_R * menv

# ---------------------------------------------------------------- sound effects


def whoosh(d=0.9, lo=300, hi=4000, up=True):
    tt = t_axis(d)
    noise = rng.standard_normal(len(tt))
    out = np.zeros_like(tt)
    steps = 24
    for k in range(steps):
        a, b = k * len(tt) // steps, (k + 1) * len(tt) // steps
        p = k / (steps - 1)
        p = p if up else 1 - p
        fc = lo * (hi / lo) ** p
        out[a:b] = bp(noise, fc * 0.7, min(fc * 1.4, SR / 2 - 100))[a:b]
    shape = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 1.5
    return out * shape


def click(bright=1.0):
    tt = t_axis(0.05)
    c = bp(rng.standard_normal(len(tt)), 1800 * bright, 6000 * bright) * env(len(tt), 0.0005, 0.008)
    c += np.sin(2 * np.pi * 900 * bright * tt) * env(len(tt), 0.0005, 0.012) * 0.6
    return c


def key_tick():
    tt = t_axis(0.04)
    f = 2500 + rng.uniform(-500, 500)
    return bp(rng.standard_normal(len(tt)), f * 0.6, f * 1.6) * env(len(tt), 0.0003, 0.006)


def chime(base=880):
    tt = t_axis(1.6)
    out = np.zeros_like(tt)
    for k, (m, d) in enumerate([(0, 0.0), (7, 0.09), (12, 0.18)]):
        f = base * 2 ** (m / 12)
        st = int(d * SR)
        seg = tt[: len(tt) - st]
        mod = np.sin(2 * np.pi * f * 3.5 * seg) * 1.2 * np.exp(-seg * 6)
        tone = np.sin(2 * np.pi * f * seg + mod) * np.exp(-seg * 3.2)
        out[st:] += tone * (1 - k * 0.15)
    return out


def pop(f=600):
    tt = t_axis(0.18)
    sweep = f * (1 + 1.5 * np.exp(-tt * 40))
    return np.sin(2 * np.pi * np.cumsum(sweep) / SR) * env(len(tt), 0.002, 0.05)


def blip(f):
    tt = t_axis(0.12)
    return (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)) * env(len(tt), 0.002, 0.04)


def impact():
    tt = t_axis(1.8)
    boom = np.sin(2 * np.pi * (40 + 60 * np.exp(-tt * 8)) * tt) * env(len(tt), 0.004, 0.5)
    air = lp(rng.standard_normal(len(tt)), 900) * env(len(tt), 0.002, 0.25)
    return boom + 0.25 * air


def shimmer(d=1.2, base=1760):
    tt = t_axis(d)
    out = np.zeros_like(tt)
    for k in range(10):
        st = int(k * d / 14 * SR)
        f = base * 2 ** (rng.choice([0, 3, 5, 7, 10, 12]) / 12)
        seg = tt[: len(tt) - st]
        out[st:] += np.sin(2 * np.pi * f * seg) * np.exp(-seg * 9)
    return out


# scene transitions
for at, up in [(0.2, True), (4.85, True), (10.55, True), (26.1, False), (35.0, True), (43.7, False), (49.8, True)]:
    add(whoosh(1.0, up=up), at, 0.16, pan=0.0)
add(impact(), 1.0, 0.5)
add(shimmer(1.6), 2.0, 0.05, pan=0.2)
add(impact(), 50.4, 0.45)

# login typing + clicks
def typing(t0, t1, n, gain=0.09):
    n = max(1, n)
    step = max((t1 - t0) / n, 0.035)
    k = 0
    while t0 + k * step < t1 and k < n:
        add(key_tick(), t0 + k * step + rng.uniform(0, 0.012), gain * rng.uniform(0.7, 1.0), pan=rng.uniform(-0.3, 0.3))
        k += 1

typing(6.9, 7.9, 12)
typing(8.4, 9.3, 10)
for c in [8.25, 9.95, 19.7, 20.45, 23.1, 23.7, 24.35, 24.85, 25.6]:
    add(click(), c, 0.28)

# dashboard reveal: counters + rows
for k in range(14):
    add(blip(1200 + k * 60), 12.0 + k * 0.11, 0.035, pan=-0.4 + k * 0.06)
for i in range(8):
    add(pop(500 + i * 25), 12.4 + i * 0.09, 0.05)

# create-task modal
add(whoosh(0.35, 800, 5000), 19.72, 0.08)
typing(20.55, 21.7, 24)
typing(21.75, 22.25, 14, 0.07)
typing(22.5, 22.8, 3)
add(whoosh(0.3, 5000, 900, up=False), 25.62, 0.07)
add(pop(700), 26.0, 0.18)

# realtime: phone notification, status change, packets, toasts
add(chime(988), 28.0, 0.16, pan=0.5)
for tp in [29.95, 30.4, 33.45]:
    add(click(1.3), tp, 0.22, pan=0.5)
typing(32.5, 33.3, 24, 0.07)
for b in [30.55, 33.55]:
    for i in range(7):
        add(blip(880 * 2 ** (i * 2 / 12)), b + i * 0.07 + 0.3, 0.06, pan=0.5 - i * 0.15)
add(chime(784), 31.45, 0.17, pan=-0.4)
add(chime(880), 34.25, 0.16, pan=-0.4)

# exploded view
add(whoosh(2.0, 150, 1500), 36.4, 0.12)
for k in range(5):
    add(pop(520 + k * 70), 38.0 + k * 0.25, 0.14, pan=0.5)

# admin
for i in range(4):
    add(pop(600 + i * 60), 44.8 + i * 0.25, 0.12, pan=-0.5)
add(shimmer(0.9, 2093), 46.9, 0.06, pan=0.3)

# outro chips
for i in range(5):
    add(pop(660 + i * 90), 51.2 + i * 0.12, 0.12, pan=-0.6 + i * 0.3)
add(shimmer(1.8, 1568), 52.2, 0.05)

# ---------------------------------------------------------------- master
mix = np.stack([L, R], axis=1)
mix *= 0.9 / np.max(np.abs(mix))
mix = np.tanh(mix * 1.4) / np.tanh(1.4)       # soft limiter
fade = np.clip((DUR - np.arange(N) / SR) / 1.2, 0, 1)[:, None]
mix *= fade
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'demo-audio.wav')
wavfile.write(out, SR, (mix * 32767 * 0.95).astype(np.int16))
print('wrote', out)
