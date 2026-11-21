// WebAudio synth: no audio files, everything is generated. Engine hum, sirens, gunshots,
// waves, pickup chimes and mission jingles. Volume and mute live in settings.
export function createAudio() {
  let ctx = null, master = null, eng = null, engGain = null, sirenOsc = null, sirenGain = null, waveGain = null;
  let vol = 0.7, muted = false;
  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
      eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 55;
      engGain = ctx.createGain(); engGain.gain.value = 0; eng.connect(engGain); engGain.connect(master); eng.start();
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0; sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      waveGain = ctx.createGain(); waveGain.gain.value = 0.05;
      src.connect(f); f.connect(waveGain); waveGain.connect(master); src.start();
      return true;
    } catch { return false; }
  }
  function blip(freq, dur, type, gain, slide) {
    if (!ensure() || muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
  }
  function noise(dur, gain, freq) {
    if (!ensure() || muted) return;
    const len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
    const g = ctx.createGain(); g.gain.value = gain || 0.4;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : vol; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : vol; return muted; },
    get muted() { return muted; },
    engine(speed01, on) { if (!ctx) return; engGain.gain.value = on ? 0.05 + speed01 * 0.06 : 0; eng.frequency.value = 50 + speed01 * 130; },
    siren(on, t) { if (!ctx) return; sirenGain.gain.value = on ? 0.045 : 0; if (on) sirenOsc.frequency.value = 650 + 260 * Math.sin(t * 5); },
    waves(v) { if (waveGain) waveGain.gain.value = v; },
    shot() { noise(0.14, 0.5, 2400); blip(160, 0.08, 'square', 0.16, 60); },
    hit() { blip(220, 0.07, 'triangle', 0.2, 140); },
    pickup() { blip(660, 0.09, 'sine', 0.22); setTimeout(() => blip(990, 0.12, 'sine', 0.22), 80); },
    cash() { blip(880, 0.1, 'sine', 0.2); setTimeout(() => blip(1174, 0.14, 'sine', 0.2), 90); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110)); },
    fail() { blip(220, 0.3, 'sawtooth', 0.2, 110); },
    crash() { noise(0.25, 0.5, 700); },
    busted() { blip(440, 0.2, 'square', 0.2, 330); setTimeout(() => blip(330, 0.35, 'square', 0.2, 220), 200); },
  };
}
