// Cartoon sound design, all synthesised: squeaky sneakers, boings, slide
// whistles, ghostly woooOOOs, honks, vacuum slurps, crowd laughs, and a
// goofy spooky music loop (pizzicato bass, theremin, woodblock).
import * as THREE from 'three';

export class Sfx {
  constructor() { this.ctx = null; this.loops = {}; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = Number(localStorage.getItem('ght_vol') ?? 0.9);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.bus = ctx.createGain(); this.bus.connect(this.master);
    this.voiceBus = ctx.createGain(); this.voiceBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = Number(localStorage.getItem('ght_music') ?? 0.5); this.musicBus.connect(this.master);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(1.6, 3); this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.25;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
  }
  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  get now() { return this.ctx.currentTime; }

  setListener(pos, quat) {
    if (!this.ctx) return;
    const L = this.ctx.listener, f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat), u = new THREE.Vector3(0, 1, 0).applyQuaternion(quat), t = this.now;
    if (L.positionX) { L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02); L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02); L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02); }
    else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }
  out(pos, gain = 1, verb = 0.3) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    if (pos) {
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.2; p.maxDistance = 80;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p); p.connect(this.bus); const v = ctx.createGain(); v.gain.value = verb; p.connect(v); v.connect(this.verbIn);
    } else { g.connect(this.bus); const v = ctx.createGain(); v.gain.value = verb * 0.5; g.connect(v); v.connect(this.verbIn); }
    return g;
  }
  // a tone with a pitch path [[time, freq], …] and an envelope
  tone(pos, { type = 'sine', path = [[0, 440]], dur = 0.3, gain = 0.3, attack = 0.01, verb = 0.3, offset = 0, vib = 0, vibRate = 6, filter = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.now + offset, o = this.out(pos, 1, verb), osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(path[0][1], t);
    for (const [pt, f] of path.slice(1)) osc.frequency.exponentialRampToValueAtTime(f, t + pt);
    if (vib) { const l = this.ctx.createOscillator(), lg = this.ctx.createGain(); l.frequency.value = vibRate; lg.gain.value = vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.1); }
    let src = osc;
    if (filter) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; osc.connect(f); src = f; }
    src.connect(g); g.connect(o);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.05)); g.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  noiseHit(pos, { f = 1000, q = 1, dur = 0.1, gain = 0.4, offset = 0, verb = 0.2, type = 'bandpass', sweep = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.now + offset, o = this.out(pos, 1, verb), s = this.ctx.createBufferSource(), b = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; b.type = type; b.frequency.setValueAtTime(f, t); if (sweep) b.frequency.exponentialRampToValueAtTime(sweep, t + dur); b.Q.value = q;
    s.connect(b); b.connect(g); g.connect(o);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ the kit
  step(pos, surface = 'grass', k = 0.6, local = false) {
    const p = local ? null : pos, r = Math.random();
    if (surface === 'water') { this.noiseHit(p, { f: 900, q: 0.6, dur: 0.25, gain: 0.35 * k, sweep: 300 }); this.tone(p, { type: 'sine', path: [[0, 500], [0.1, 900]], dur: 0.12, gain: 0.08 * k }); return; }
    if (surface === 'road' || surface === 'wood') this.tone(p, { type: 'triangle', path: [[0, 1400 + r * 400], [0.05, 2200 + r * 300], [0.09, 1500]], dur: 0.1, gain: 0.07 * k, verb: 0.1 });   // sneaker squeak
    this.noiseHit(p, { f: surface === 'grass' ? 2200 : 1200, q: 0.8, dur: 0.06, gain: 0.25 * k });
    this.tone(p, { type: 'sine', path: [[0, 140], [0.06, 70]], dur: 0.07, gain: 0.2 * k, verb: 0.05 });
  }
  jump(pos) { this.tone(null, { type: 'sine', path: [[0, 220], [0.18, 660]], dur: 0.22, gain: 0.22, vib: 30, vibRate: 25 }); }       // boing!
  land(pos, v = 6) { this.tone(null, { type: 'sine', path: [[0, 110], [0.12, 50]], dur: 0.15, gain: Math.min(0.5, v * 0.05) }); this.noiseHit(null, { f: 600, dur: 0.08, gain: 0.25 }); }
  click(f = 2000, gain = 0.15) { this.tone(null, { type: 'square', path: [[0, f]], dur: 0.03, gain, filter: 4000 }); }
  pop() { this.tone(null, { type: 'sine', path: [[0, 400], [0.06, 1400]], dur: 0.08, gain: 0.2 }); }
  uiHover() { this.tone(null, { type: 'triangle', path: [[0, 900], [0.05, 1200]], dur: 0.06, gain: 0.06 }); }
  uiPress() { this.tone(null, { type: 'square', path: [[0, 300], [0.08, 600]], dur: 0.1, gain: 0.1, filter: 2500 }); this.noiseHit(null, { f: 3000, dur: 0.03, gain: 0.1 }); }

  // ghosts
  wooo(pos, pitch = 1, k = 1) {   // classic ghost: sine with heavy vibrato rising and falling
    this.tone(pos, { type: 'sine', path: [[0, 300 * pitch], [0.5, 520 * pitch], [1.2, 260 * pitch]], dur: 1.3, gain: 0.35 * k, vib: 18, vibRate: 5.5, attack: 0.15, verb: 0.8 });
    this.tone(pos, { type: 'triangle', path: [[0, 602 * pitch], [0.5, 1044 * pitch], [1.2, 522 * pitch]], dur: 1.3, gain: 0.08 * k, vib: 30, vibRate: 5.5, attack: 0.2, verb: 0.8 });
  }
  boo(pos) {
    // a big formant-ish "BOO!" stab with a cymbal crash
    for (const [f, g] of [[180, 0.45], [360, 0.2], [700, 0.08]]) this.tone(pos, { type: 'sawtooth', path: [[0, f * 1.4], [0.08, f], [0.5, f * 0.8]], dur: 0.55, gain: g, filter: 900, verb: 0.6 });
    this.noiseHit(pos, { f: 6000, q: 0.4, dur: 0.6, gain: 0.25, offset: 0.02, type: 'highpass' });
  }
  scream(pos) {   // a crew bean screams like a cartoon
    this.tone(pos, { type: 'sawtooth', path: [[0, 700], [0.1, 1300], [0.6, 1100], [0.8, 600]], dur: 0.85, gain: 0.16, vib: 60, vibRate: 12, filter: 3000 });
  }
  diva(pos) {     // Edith's operatic screech: a high wobbly soprano + glass breaking
    this.tone(pos, { type: 'sawtooth', path: [[0, 880], [0.3, 1760], [1.4, 1700]], dur: 1.6, gain: 0.25, vib: 70, vibRate: 7, filter: 4500, verb: 1 });
    for (let i = 0; i < 12; i++) this.tone(pos, { type: 'sine', path: [[0, 3000 + Math.random() * 4000]], dur: 0.15, gain: 0.08, offset: 0.4 + Math.random() * 0.8 });
  }
  clank(pos) { for (let i = 0; i < 3; i++) this.tone(pos, { type: 'square', path: [[0, 600 + i * 230]], dur: 0.3, gain: 0.1, offset: i * 0.05, filter: 3000, verb: 0.5 }); this.noiseHit(pos, { f: 3000, q: 4, dur: 0.3, gain: 0.3 }); }
  gloop(pos) { for (let i = 0; i < 3; i++) this.tone(pos, { type: 'sine', path: [[0, 200 + i * 80], [0.12, 500 + i * 120]], dur: 0.15, gain: 0.25, offset: i * 0.12 }); }
  honk(pos) { for (const [o, f] of [[0, 360], [0.25, 320]]) { this.tone(pos, { type: 'square', path: [[0, f]], dur: 0.2, gain: 0.18, offset: o, filter: 1800 }); this.tone(pos, { type: 'sawtooth', path: [[0, f * 1.5]], dur: 0.2, gain: 0.1, offset: o, filter: 1800 }); } }
  slide(pos, up = true) { this.tone(pos, { type: 'sine', path: up ? [[0, 400], [1.0, 2400]] : [[0, 2400], [1.0, 300]], dur: 1.05, gain: 0.3, vib: 25, vibRate: 7 }); }
  yeet(pos) { this.noiseHit(pos, { f: 800, q: 0.5, dur: 0.6, gain: 0.4, sweep: 3000 }); this.slide(pos, true); this.laugh(0.4); }
  splat(pos) { this.tone(pos, { type: 'sine', path: [[0, 200], [0.15, 60]], dur: 0.2, gain: 0.4 }); this.noiseHit(pos, { f: 500, q: 0.7, dur: 0.2, gain: 0.4 }); }
  squeak(pos) { this.tone(pos, { type: 'triangle', path: [[0, 900], [0.12, 1600], [0.3, 1100]], dur: 0.32, gain: 0.25 }); }
  shatter(pos) { for (let i = 0; i < 10; i++) this.tone(pos, { type: 'sine', path: [[0, 2500 + Math.random() * 5000]], dur: 0.08 + Math.random() * 0.1, gain: 0.06, offset: Math.random() * 0.3 }); this.noiseHit(pos, { f: 5000, q: 0.5, dur: 0.2, gain: 0.3 }); }
  thunk(pos) { this.tone(pos, { type: 'sine', path: [[0, 160], [0.1, 60]], dur: 0.14, gain: 0.35 }); this.noiseHit(pos, { f: 900, dur: 0.06, gain: 0.2 }); }
  manifest(pos) { this.tone(pos, { type: 'sawtooth', path: [[0, 80], [0.6, 160]], dur: 0.7, gain: 0.2, filter: 600, vib: 6 }); this.tone(pos, { type: 'sine', path: [[0, 1200], [0.6, 2400]], dur: 0.7, gain: 0.06, vib: 40 }); }
  ding() { this.tone(null, { type: 'sine', path: [[0, 1320]], dur: 0.5, gain: 0.15 }); this.tone(null, { type: 'sine', path: [[0, 1760]], dur: 0.6, gain: 0.12, offset: 0.1 }); }
  airhorn() { for (let i = 0; i < 3; i++) { this.tone(null, { type: 'sawtooth', path: [[0, 466]], dur: 0.25, gain: 0.12, offset: i * 0.3, filter: 2500 }); this.tone(null, { type: 'sawtooth', path: [[0, 587]], dur: 0.25, gain: 0.1, offset: i * 0.3, filter: 2500 }); } }
  laugh(k = 1) {   // studio audience: a burst of filtered noise "ha"s
    for (let i = 0; i < 9; i++) this.noiseHit(null, { f: 600 + Math.random() * 700, q: 6, dur: 0.12, gain: 0.12 * k, offset: i * 0.13 + Math.random() * 0.04, verb: 0.6 });
  }
  aww() { this.tone(null, { type: 'sawtooth', path: [[0, 340], [0.9, 240]], dur: 1, gain: 0.08, filter: 900, vib: 4 }); this.noiseHit(null, { f: 500, q: 2, dur: 1, gain: 0.08 }); }
  cheer() { this.noiseHit(null, { f: 1500, q: 0.4, dur: 1.4, gain: 0.25, verb: 0.7 }); this.airhorn(); }
  ring() { for (let i = 0; i < 2; i++) for (let k = 0; k < 10; k++) this.tone(null, { type: 'square', path: [[0, k % 2 ? 1300 : 1100]], dur: 0.04, gain: 0.06, offset: i * 0.6 + k * 0.04, filter: 3000 }); }
  fire(pos) { this.noiseHit(pos, { f: 400, q: 0.5, dur: 0.6, gain: 0.25, sweep: 1500 }); }
  onAir() {   // goofy TV sting: brass-ish fanfare + slide + rimshot
    const n = [[0, 392], [0.15, 523], [0.3, 659], [0.45, 784]];
    for (const [o, f] of n) { this.tone(null, { type: 'sawtooth', path: [[0, f]], dur: 0.14, gain: 0.12, offset: o, filter: 2400 }); this.tone(null, { type: 'square', path: [[0, f / 2]], dur: 0.14, gain: 0.06, offset: o, filter: 1200 }); }
    this.tone(null, { type: 'sawtooth', path: [[0, 784], [0.6, 820]], dur: 0.8, gain: 0.14, offset: 0.62, filter: 2600, vib: 8 });
    this.noiseHit(null, { f: 4000, q: 0.5, dur: 0.15, gain: 0.3, offset: 1.5, type: 'highpass' }); this.tone(null, { type: 'sine', path: [[0, 180], [0.1, 90]], dur: 0.12, gain: 0.3, offset: 1.42 });
  }

  // the one scary sound: a distorted, layered shriek that cuts through everything
  jumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now, o = ctx.createGain(); o.gain.value = 0.9;
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); } shaper.curve = curve;
    shaper.connect(o); o.connect(this.master);
    for (const f of [420, 433, 640, 857, 1290]) {
      const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.6, t); osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.25); osc.frequency.exponentialRampToValueAtTime(f * 1.2, t + 1.1);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 23 + Math.random() * 9; lg.gain.value = f * 0.06; lfo.connect(lg); lg.connect(osc.frequency);
      osc.connect(g); g.connect(shaper); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03); g.gain.setValueAtTime(0.16, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.start(t); lfo.start(t); osc.stop(t + 1.3); lfo.stop(t + 1.3);
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(4500, t + 0.3);
    const ng = ctx.createGain(); n.connect(bp); bp.connect(ng); ng.connect(shaper); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.1); n.start(t); n.stop(t + 1.2);
    const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.frequency.setValueAtTime(90, t); sub.frequency.exponentialRampToValueAtTime(35, t + 0.6); sub.connect(sg); sg.connect(this.master);
    sg.gain.setValueAtTime(0.9, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.7); sub.start(t); sub.stop(t + 0.8);
  }
  gore(pos) {
    this.tone(pos, { type: 'sine', path: [[0, 120], [0.25, 35]], dur: 0.35, gain: 0.7, verb: 0.4 });
    this.noiseHit(pos, { f: 500, q: 0.6, dur: 0.45, gain: 0.7, sweep: 150, verb: 0.4 });
    for (let i = 0; i < 6; i++) this.noiseHit(pos, { f: 1800 + Math.random() * 2500, q: 5, dur: 0.03, gain: 0.35, offset: 0.02 + i * 0.03 });      // bones
    for (let i = 0; i < 8; i++) this.noiseHit(pos, { f: 300 + Math.random() * 400, q: 1.2, dur: 0.12, gain: 0.25, offset: 0.25 + Math.random() * 1.1 });   // splatter landing
  }

  // vacuum: a looping whine whose pitch rises when it's sucking a ghost
  vacuum(on, sucking = 0) {
    if (!this.ctx) return;
    let L = this.loops.vac;
    if (!L) {
      const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 180;
      const og = this.ctx.createGain(); og.gain.value = 0.04; const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(bp); bp.connect(g); o.connect(og); og.connect(g); g.connect(this.bus); s.start(); o.start();
      L = this.loops.vac = { g, bp, o };
    }
    const t = this.now;
    L.g.gain.setTargetAtTime(on ? 0.35 : 0, t, 0.08);
    L.bp.frequency.setTargetAtTime(900 + sucking * 1600, t, 0.1); L.o.frequency.setTargetAtTime(180 + sucking * 260, t, 0.1);
  }

  // ------------------------------------------------------------ music
  // a goofy spooky loop: walking pizzicato bass, woodblock, a theremin tune
  music(on, intense = 0) {
    if (!this.ctx) return;
    this.musicOn = on; this.intense = intense;
    if (on && !this.musicTimer) { this.beat = 0; this.nextT = this.now + 0.1; this.musicTimer = setInterval(() => this.schedule(), 50); }
    if (!on && this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  schedule() {
    const bpm = this.intense > 0.5 ? 160 : 112, step = 60 / bpm / 2;
    const bass = [45, 45, 52, 45, 48, 45, 52, 51, 45, 45, 52, 45, 50, 49, 48, 47];   // minor walk with chromatic slide
    const mel = [69, null, 72, 71, null, 69, 68, null, 69, null, 76, 74, 72, null, 71, null, 69, null, 72, 71, 69, null, 68, 69, 64, null, null, null, null, null, null, null];
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextT < this.now + 0.2) {
      const b = this.beat, t = this.nextT - this.now;
      const opt = (o) => ({ ...o, offset: Math.max(0, t) });
      if (b % 2 === 0) { const m = bass[(b / 2) % 16]; this.mtone(opt({ type: 'triangle', path: [[0, f(m - 12)]], dur: 0.18, gain: 0.22, attack: 0.003 })); }
      if (b % 4 === 2) this.mnoise(opt({ f: 2400, q: 8, dur: 0.05, gain: 0.25 }));                          // woodblock
      if (b % 8 === 4 && this.intense > 0.3) this.mnoise(opt({ f: 6000, q: 0.5, dur: 0.08, gain: 0.08, type: 'highpass' }));
      const m = mel[b % 32];
      if (m && (this.intense > 0.1 || b % 64 < 32)) this.mtone(opt({ type: 'sine', path: [[0, f(m) * 0.98], [0.06, f(m)]], dur: step * 1.8, gain: 0.08, vib: 9, vibRate: 6.5, attack: 0.04 }));
      this.beat++; this.nextT += step;
    }
  }
  mtone(o) { const save = this.bus; this.bus = this.musicBus; this.tone(null, { ...o, verb: 0.3 }); this.bus = save; }
  mnoise(o) { const save = this.bus; this.bus = this.musicBus; this.noiseHit(null, o); this.bus = save; }
}
