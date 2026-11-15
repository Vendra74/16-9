"""
Biblioteca de músicas do 16:9: faixas originais, compostas por código.

Cada faixa é gerada do zero (sintetizadores, bateria e reverb feitos aqui),
sem amostras de terceiros. Por isso o projeto é dono das gravações e pode
liberá-las para uso no app sem custo e sem risco de direitos autorais.

Uso:  python3 -I scripts/music/compose.py docs/musica
Gera um .m4a por faixa (AAC 128 kbps, estéreo) e o catálogo musica.json.
Precisa de numpy, scipy e ffmpeg. O resultado é sempre o mesmo (sementes fixas).
"""

import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
RNG = np.random.default_rng(169)


# ---------- utilidades ----------

def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.01, d=0.1, s=0.7, r=0.2):
    """Envelope ADSR com n amostras (o release fica dentro de n)."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a - d - r)
    e = np.concatenate([
        np.linspace(0, 1, max(a, 1)),
        np.linspace(1, s, max(d, 1)),
        np.full(sus, s),
        np.linspace(s, 0, max(r, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, min(hz, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, 'high', fs=SR, output='sos'), x)


def place(buf, sig, start):
    i = int(start * SR)
    if i >= len(buf):
        return
    end = min(len(buf), i + len(sig))
    buf[i:end] += sig[: end - i]


def reverb(x, seconds=2.5, mix=0.3, seed=0):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir = lowpass(ir, 6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[: len(x)]
    return (1 - mix) * x + mix * wet


# ---------- instrumentos ----------

def saw(f, n, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((t * f * (1 + detune) + phase) % 1) - 1


def pad(freqs, dur, bright=1800, attack=1.2, release=1.5):
    n = int(dur * SR)
    out = np.zeros(n)
    for f in freqs:
        for d in (-0.004, 0.0, 0.005):
            out += saw(f, n, d, RNG.random())
    out = lowpass(out, bright, 2) / (len(freqs) * 3)
    return out * env(n, attack, 0.3, 0.9, release)


def strings(freqs, dur, bright=2600):
    """Cordas: pad com vibrato leve."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + RNG.random() * 6)
        for d in (-0.006, 0.0, 0.006):
            ph = np.cumsum(f * vib * (1 + d)) / SR + RNG.random()
            out += 2 * (ph % 1) - 1
    out = lowpass(out, bright, 2) / (len(freqs) * 3)
    return out * env(n, 0.8, 0.3, 0.85, 1.0)


def epiano(f, dur, vel=0.8):
    """Piano elétrico por FM."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod_env = np.exp(-t * 4)
    s = np.sin(2 * np.pi * f * t + 1.8 * mod_env * np.sin(2 * np.pi * f * 14 * t) * 0.15 + 1.2 * mod_env * np.sin(2 * np.pi * f * t))
    return vel * s * np.exp(-t * 1.6) * env(n, 0.003, 0.05, 1.0, 0.25)


def piano(f, dur, vel=0.8):
    """Piano simples: parciais com decaimentos diferentes."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k, amp in enumerate((1.0, 0.5, 0.28, 0.16, 0.09, 0.05), start=1):
        s += amp * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * t) * np.exp(-t * (1.2 + 0.9 * k))
    hammer = lowpass(RNG.standard_normal(n), 3000) * np.exp(-t * 80) * 0.05
    return vel * (s * 0.6 + hammer) * env(n, 0.002, 0.05, 1.0, 0.3)


def pluck(f, dur, vel=0.7, damp=0.996):
    """Corda dedilhada (Karplus-Strong)."""
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = RNG.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        j = i % p
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % p])
    return vel * out * env(n, 0.001, 0.05, 1.0, 0.1)


def bass(f, dur, vel=0.8, bright=500):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = 0.7 * np.sin(2 * np.pi * f * t) + 0.3 * saw(f, n)
    return vel * lowpass(s, bright) * env(n, 0.005, 0.1, 0.8, 0.08)


def sub_boom(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 55 * np.exp(-t * 0.6) + 30
    s = np.sin(2 * np.pi * np.cumsum(f) / SR)
    noise = lowpass(RNG.standard_normal(n), 800) * np.exp(-t * 3) * 0.4
    return (s + noise) * np.exp(-t * 1.1)


def kick(vel=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 120 * np.exp(-t * 30) + 45
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)


def snare(vel=0.6):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    noise = highpass(RNG.standard_normal(n), 1500) * np.exp(-t * 14)
    return vel * (0.4 * tone + 0.6 * noise)


def clap(vel=0.5):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k in range(3):
        i = int(k * 0.011 * SR)
        e[i:] += np.exp(-np.arange(n - i) / SR * 60)
    e += np.exp(-t * 12) * 0.5
    return vel * highpass(lowpass(RNG.standard_normal(n), 5000), 900) * e


def hat(vel=0.25, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return vel * highpass(RNG.standard_normal(n), 7000) * np.exp(-t * (12 if open_ else 70))


def taiko(vel=1.0):
    n = int(1.0 * SR)
    t = np.arange(n) / SR
    f = 90 * np.exp(-t * 8) + 60
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4)
    skin = lowpass(RNG.standard_normal(n), 1200) * np.exp(-t * 18) * 0.5
    return vel * (body + skin)


def vinyl(n, amount=0.012):
    crackle = np.zeros(n)
    idx = RNG.integers(0, n, n // 2500)
    crackle[idx] = RNG.uniform(-1, 1, len(idx))
    hiss = lowpass(RNG.standard_normal(n), 4000) * 0.15
    return amount * (lowpass(crackle, 3000) * 4 + hiss)


# ---------- harmonia ----------

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
QUALITY = {'': (0, 4, 7), 'm': (0, 3, 7), 'maj7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10),
           '7': (0, 4, 7, 10), 'sus2': (0, 2, 7), 'sus4': (0, 5, 7), 'add9': (0, 4, 7, 14), 'm9': (0, 3, 7, 10, 14)}


def chord(name, octave=4):
    root = name[:2] if len(name) > 1 and name[1] in '#b' else name[:1]
    q = name[len(root):]
    base = 12 * (octave + 1) + NOTE[root]
    return [base + i for i in QUALITY[q]]


# ---------- faixas ----------

def track_horizonte():
    """Épico: cordas, taikos e piano, crescendo."""
    bpm, beat = 84, 60 / 84
    prog = ['Dm', 'Bb', 'F', 'C'] * 6
    bar = 4 * beat
    n = int((len(prog) * bar + 4) * SR)
    mus, drums = np.zeros(n), np.zeros(n)
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 3)
        intensity = min(1.0, 0.35 + i / len(prog) * 1.1)
        place(mus, strings([midi_hz(x) for x in notes + [notes[0] + 12]], bar + 0.8, 1800 + 1800 * intensity) * 0.9 * intensity, t0)
        place(mus, bass(midi_hz(notes[0] - 12), bar, 0.6 * intensity, 300), t0)
        for k in range(8):
            if i >= 4:
                arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 12]
                place(mus, piano(midi_hz(arp[k % 4] + 12), 0.9, 0.22), t0 + k * beat / 2)
        if i >= 8:
            for k, v in ((0, 1.0), (1.5, 0.6), (2, 0.9), (3, 0.5), (3.5, 0.5)):
                place(drums, taiko(v * intensity), t0 + k * beat)
        if i % 8 == 7:
            place(drums, sub_boom(3) * 0.8, t0 + bar - 0.1)
    return reverb(mus, 3.2, 0.35) + reverb(drums, 1.8, 0.2, 1) * 0.8


def track_mare_mansa():
    """Calmo: piano e pad, bem espaçado."""
    bpm, beat = 66, 60 / 66
    prog = ['Cmaj7', 'Am7', 'Fmaj7', 'G'] * 5
    bar = 4 * beat
    n = int((len(prog) * bar + 5) * SR)
    mus = np.zeros(n)
    melody = [76, 74, 72, 74, 76, 79, 77, 76, 74, 72, 71, 72]
    m = 0
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 4)
        place(mus, pad([midi_hz(x) for x in chord(c, 3)], bar + 1.5, 1200, 1.5, 2.0) * 0.5, t0)
        place(mus, piano(midi_hz(notes[0] - 12), 3, 0.45), t0)
        for k, x in enumerate(notes[1:]):
            place(mus, piano(midi_hz(x), 2.5, 0.25), t0 + beat * (1 + k * 0.5))
        if i >= 2 and i % 2 == 0:
            for k in range(3):
                place(mus, piano(midi_hz(melody[m % len(melody)]), 2.2, 0.32), t0 + k * beat * 1.33)
                m += 1
    return reverb(mus, 3.5, 0.4)


def track_sombra():
    """Suspense: drone grave, pulsos e notas dissonantes."""
    bpm, beat = 100, 0.6
    dur = 72
    n = int(dur * SR)
    t = np.arange(n) / SR
    mus = np.zeros(n)
    drone = (saw(midi_hz(38), n) + saw(midi_hz(38), n, 0.003) + 0.5 * saw(midi_hz(45), n, -0.002))
    sweep = 300 + 500 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 18))
    out = np.zeros(n)
    block = 4096
    for s in range(0, n, block):  # filtro que abre e fecha devagar
        hz = sweep[s]
        out[s:s + block] = lowpass(drone[max(0, s - 2000):s + block], hz)[-len(drone[s:s + block]):]
    mus += out * 0.25 * np.minimum(1, t / 6)
    k = 0
    while k * beat < dur - 4:
        tt = k * beat
        if tt > 12:
            place(mus, bass(midi_hz(26), 0.25, 0.9, 200), tt)
            if k % 2 == 1:
                place(mus, bass(midi_hz(26), 0.18, 0.6, 200), tt + beat / 2)
        k += 1
    for tt, note in ((8, 75), (16, 74), (24, 75), (32, 82), (40, 81), (48, 75), (56, 74), (62, 70)):
        place(mus, piano(midi_hz(note), 4, 0.3), tt)
        place(mus, piano(midi_hz(note + 1), 4, 0.12), tt + 0.02)
    for tt in (31.8, 63.8):
        place(mus, sub_boom(4) * 0.9, tt)
    tick = np.zeros(n)
    for tt in np.arange(20, dur - 4, beat / 2):
        place(tick, hat(0.12), tt)
    return reverb(mus, 4.0, 0.4) + tick


def track_dia_claro():
    """Alegre: violão dedilhado, palmas e baixo."""
    bpm, beat = 112, 60 / 112
    prog = ['G', 'D', 'Em', 'C'] * 8
    bar = 4 * beat
    n = int((len(prog) * bar + 3) * SR)
    mus, drums = np.zeros(n), np.zeros(n)
    pattern = [0, 2, 1, 2, 3, 2, 1, 2]
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 3)
        voice = [notes[0], notes[1] + 12, notes[2], notes[0] + 12]
        for k in range(8):
            place(mus, pluck(midi_hz(voice[pattern[k]]), 1.2, 0.45), t0 + k * beat / 2)
        if i >= 4:
            place(mus, bass(midi_hz(notes[0] - 12), beat * 1.5, 0.6), t0)
            place(mus, bass(midi_hz(notes[0] - 12), beat * 0.9, 0.5), t0 + beat * 2.5)
            for k in range(4):
                place(drums, kick(0.7), t0 + k * beat) if k % 2 == 0 else place(drums, clap(0.45), t0 + k * beat)
            for k in range(8):
                place(drums, hat(0.12 if k % 2 else 0.2), t0 + k * beat / 2)
        if i >= 12 and i % 4 < 2:
            mel = [74, 76, 79, 78, 76, 74, 71, 74]
            for k in range(4):
                place(mus, epiano(midi_hz(mel[(i * 2 + k) % 8]), 0.8, 0.25), t0 + k * beat)
    return reverb(mus, 1.6, 0.22) + reverb(drums, 0.8, 0.1, 2)


def track_cartas():
    """Melancólico: piano e cordas em lá menor."""
    bpm, beat = 72, 60 / 72
    prog = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'] * 3
    bar = 4 * beat
    n = int((len(prog) * bar + 5) * SR)
    mus = np.zeros(n)
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 4)
        place(mus, piano(midi_hz(notes[0] - 24), 4, 0.4), t0)
        place(mus, piano(midi_hz(notes[0] - 12), 4, 0.3), t0)
        for k, x in enumerate([notes[1], notes[2], notes[0] + 12, notes[2]]):
            place(mus, piano(midi_hz(x), 2, 0.22), t0 + beat * (k + 0.5) if k else t0 + beat * 0.5)
        if i >= 8:
            place(mus, strings([midi_hz(x) for x in chord(c, 3)], bar + 0.6, 1600) * 0.45, t0)
        if i >= 16:
            top = notes[2] + 12
            place(mus, strings([midi_hz(top)], bar, 2400) * 0.35, t0)
    return reverb(mus, 3.0, 0.38)


def track_cafe():
    """Lo-fi: piano elétrico, batida arrastada e chiado de disco."""
    bpm, beat = 78, 60 / 78
    prog = ['Dm9', 'G7', 'Cmaj7', 'Am7'] * 6
    bar = 4 * beat
    n = int((len(prog) * bar + 3) * SR)
    mus, drums = np.zeros(n), np.zeros(n)
    swing = beat * 0.58
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 3)
        for x in notes:
            place(mus, epiano(midi_hz(x + 12), bar * 0.9, 0.18), t0 + RNG.uniform(0, 0.03))
        place(mus, epiano(midi_hz(notes[1] + 12), beat, 0.12), t0 + 2.5 * beat)
        place(mus, bass(midi_hz(notes[0] - 12), beat * 1.6, 0.7, 350), t0)
        place(mus, bass(midi_hz(notes[0] - 12 + 7), beat * 0.8, 0.5, 350), t0 + 2.5 * beat)
        if i >= 2:
            place(drums, kick(0.8), t0)
            place(drums, kick(0.5), t0 + 2.5 * beat)
            place(drums, snare(0.35), t0 + beat)
            place(drums, snare(0.35), t0 + 3 * beat)
            for k in range(4):
                place(drums, hat(0.13), t0 + k * beat)
                place(drums, hat(0.07), t0 + k * beat + swing)
    mix = lowpass(reverb(mus, 1.8, 0.25) + drums, 5200)
    return mix + vinyl(len(mix))


def track_neon():
    """Eletrônico: sintetizador pulsante e batida quatro por quatro."""
    bpm, beat = 118, 60 / 118
    prog = ['Am', 'F', 'C', 'G'] * 8
    bar = 4 * beat
    n = int((len(prog) * bar + 3) * SR)
    mus, drums = np.zeros(n), np.zeros(n)
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 3)
        open_ = 600 + 2400 * min(1, i / 16)
        for k in range(16):
            x = notes[k % 3] + (12 if k % 4 == 3 else 0)
            nn = int(beat / 4 * SR * 0.9)
            s = (saw(midi_hz(x + 12), nn) + saw(midi_hz(x + 12), nn, 0.006)) * env(nn, 0.002, 0.08, 0.3, 0.03)
            place(mus, lowpass(s, open_) * 0.16, t0 + k * beat / 4)
        place(mus, pad([midi_hz(x) for x in chord(c, 3)], bar, 1400, 0.4, 0.6) * 0.35, t0)
        for k in range(8):
            place(mus, bass(midi_hz(notes[0] - 12), beat / 2 * 0.8, 0.55, 600), t0 + k * beat / 2 + beat / 4)
        if 4 <= i < 28:
            for k in range(4):
                place(drums, kick(0.9), t0 + k * beat)
                place(drums, hat(0.18, open_=True), t0 + k * beat + beat / 2)
                if k % 2:
                    place(drums, clap(0.5), t0 + k * beat)
    return reverb(mus, 1.5, 0.2) + drums


def track_terra():
    """Documentário: pad aberto, piano e pulsos suaves."""
    bpm, beat = 90, 60 / 90
    prog = ['Esus2', 'C', 'G', 'D'] * 6
    bar = 4 * beat
    n = int((len(prog) * bar + 4) * SR)
    mus = np.zeros(n)
    for i, c in enumerate(prog):
        t0 = i * bar
        notes = chord(c, 3)
        place(mus, pad([midi_hz(x) for x in notes + [notes[0] + 12]], bar + 1, 2000, 1.0, 1.5) * 0.45, t0)
        for k in range(8):
            if i >= 2:
                place(mus, pluck(midi_hz(notes[0] + 24 if k % 2 == 0 else notes[2] + 12), 0.8, 0.22, 0.993), t0 + k * beat / 2)
        if i >= 6:
            place(mus, bass(midi_hz(notes[0] - 12), bar, 0.5, 250), t0)
            for k in range(4):
                place(mus, kick(0.35), t0 + k * beat)
        if i >= 10 and i % 2 == 0:
            for k, x in enumerate((notes[2] + 24, notes[1] + 24, notes[0] + 24)):
                place(mus, piano(midi_hz(x), 2.5, 0.3), t0 + k * beat * 1.3)
    return reverb(mus, 2.6, 0.32)


TRACKS = [
    ('horizonte', 'Horizonte', 'epico', track_horizonte),
    ('mare-mansa', 'Maré Mansa', 'calmo', track_mare_mansa),
    ('sombra', 'Sombra', 'suspense', track_sombra),
    ('dia-claro', 'Dia Claro', 'alegre', track_dia_claro),
    ('cartas', 'Cartas', 'melancolico', track_cartas),
    ('cafe', 'Café', 'lofi', track_cafe),
    ('neon', 'Neon', 'eletronico', track_neon),
    ('terra', 'Terra', 'documentario', track_terra),
]


def finish(x, stereo_seed):
    """Fade, estéreo leve e volume padronizado."""
    x = highpass(x, 30)
    n = len(x)
    fade_in, fade_out = int(0.4 * SR), int(3.0 * SR)
    x[:fade_in] *= np.linspace(0, 1, fade_in)
    x[-fade_out:] *= np.linspace(1, 0, fade_out)
    d = int(0.012 * SR)
    left = x
    right = np.concatenate([np.zeros(d), x[:-d]]) * 0.25 + x * 0.75
    st = np.stack([left, right], 1)
    rms = np.sqrt(np.mean(st ** 2))
    st *= 0.095 / max(rms, 1e-9)  # perto de -16 LUFS: é música de fundo
    st = 0.85 * np.tanh(st * 1.1) / np.tanh(1.1)  # limita os picos, com folga para o AAC
    return st


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    catalog = []
    for i, (slug, title, mood, fn) in enumerate(TRACKS):
        global RNG
        RNG = np.random.default_rng(1000 + i)
        audio = finish(fn(), i)
        pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2')
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            with wave.open(tmp.name, 'wb') as w:
                w.setnchannels(2)
                w.setsampwidth(2)
                w.setframerate(SR)
                w.writeframes(pcm.tobytes())
            target = os.path.join(out_dir, f'{slug}.m4a')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name, '-c:a', 'aac', '-b:a', '128k',
                            '-movflags', '+faststart', target], check=True)
            os.unlink(tmp.name)
        seconds = round(len(audio) / SR)
        catalog.append({'id': slug, 'title': title, 'mood': mood, 'duration': seconds, 'file': f'{slug}.m4a'})
        print(f'{slug}: {seconds}s')
    with open(os.path.join(out_dir, 'musica.json'), 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'docs/musica')
