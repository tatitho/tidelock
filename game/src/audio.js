function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, muted = false;
  let plantedTimer = null;
  const rng = mulberry32(12345);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, filterFreq, type, vol, when) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  const SHOTS = {
    ar77: [0.09, 1800, 0.35], vex9: [0.07, 2400, 0.28],
    longbow: [0.22, 900, 0.5], breacher: [0.16, 1100, 0.5], p9: [0.08, 2000, 0.3],
  };
  return {
    init,
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    get muted() { return muted; },
    shot(id) {
      init();
      const s = SHOTS[id] || SHOTS.ar77;
      noise(s[0], s[1], 'lowpass', s[2]);
      tone(id === 'longbow' ? 90 : 140, s[0] + 0.05, 'sine', 0.35, 0, 55);
    },
    dryFire() { init(); tone(1200, 0.03, 'square', 0.08); },
    reload() { init(); tone(900, 0.04, 'square', 0.12); tone(700, 0.04, 'square', 0.12, 0.18); },
    hit() { init(); tone(880, 0.06, 'sine', 0.18); },
    kill() { init(); tone(660, 0.1, 'sine', 0.22); tone(990, 0.14, 'sine', 0.22, 0.09); },
    headshot() { init(); tone(1180, 0.08, 'sine', 0.22); tone(1560, 0.12, 'sine', 0.22, 0.07); },
    footstep(speed) {
      init();
      if (!ctx || muted) return;
      noise(0.07, 500 + speed * 60, 'bandpass', Math.min(0.16, 0.04 + speed * 0.02));
    },
    plantBeep(p) { init(); tone(1000 + p * 400, 0.07, 'sine', 0.15); },
    defuseBeep(p) { init(); tone(1000 + p * 400, 0.07, 'sine', 0.15); },
    explosion() {
      init();
      noise(1.0, 600, 'lowpass', 0.6);
      tone(120, 1.2, 'sine', 0.5, 0, 40);
    },
    roundWin() { init(); tone(523, 0.18, 'sine', 0.25); tone(784, 0.3, 'sine', 0.25, 0.16); },
    roundLoss() { init(); tone(392, 0.18, 'sine', 0.25); tone(311, 0.3, 'sine', 0.25, 0.16); },
    buy() { init(); tone(1320, 0.06, 'sine', 0.18); tone(1760, 0.08, 'sine', 0.18, 0.06); },
    startPlantedLoop() {
      init(); this.stopPlantedLoop();
      let n = 0;
      plantedTimer = window.setInterval(() => { tone(1000 + Math.min(600, n * 40), 0.06, 'sine', 0.12); n++; }, 900);
    },
    stopPlantedLoop() { if (plantedTimer) { window.clearInterval(plantedTimer); plantedTimer = null; } },
  };
}
