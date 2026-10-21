// The island's sound, synthesised with the Web Audio API: no recordings, so nothing to license or
// download. It only starts when the visitor turns it on (browsers also require that).
//
// - Ambience by zone: waves near the shore, wind (stronger on the hills), cicadas at dusk,
//   crickets at night.
// - Hooves: a different hit for sand, paths, grass, the jetty's wood and the plazas' stone.
// - Music: slow generative chords that move from a warm major at dusk to a darker mode at night.

import type { Surface } from './terrain';

export interface Ambience {
  /** 0 at sunset, 1 at night. */
  night: number;
  /** 0 far from the sea, 1 on the beach. */
  shore: number;
  /** 0 in the lowlands, 1 on the hills. */
  height: number;
  /** 0 in the open, 1 under the trees. */
  trees: number;
  /** The sea's swash, -1…1, so the waves break in time with the foam. */
  swash: number;
}

export class IslandAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<'waves' | 'wind' | 'cicadas' | 'crickets' | 'music' | 'hooves', GainNode>;
  private noise!: AudioBuffer;
  private windFilter!: BiquadFilterNode;
  private nextCricket = 0;
  private nextChord = 0;
  private chord = 0;
  private nextBell = 0;
  private reverb!: ConvolverNode;
  private night = 0;
  on = false;

  /** Starts (or resumes) the sound. Must be called from a click or key press. */
  async enable() {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.on = true;
    this.fade(this.master.gain, 0.9, 1.2);
  }
  disable() {
    if (!this.ctx) return;
    this.on = false;
    this.fade(this.master.gain, 0, 0.4);
  }

  private fade(p: AudioParam, v: number, secs: number) {
    const t = this.ctx!.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(v, t + secs);
  }

  private build() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // a gentle compressor keeps hooves and music from clipping together
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);

    const bus = (v: number, toReverb = false) => {
      const g = ctx.createGain(); g.gain.value = v; g.connect(this.master);
      if (toReverb) g.connect(this.reverb);
      return g;
    };
    this.buses = { waves: bus(0), wind: bus(0), cicadas: bus(0), crickets: bus(0, true), music: bus(0.0, true), hooves: bus(0.7) };

    // one shared buffer of brown-ish noise, 4 s, looped by every noise voice
    const len = ctx.sampleRate * 4;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; }
    const loop = (rate = 1) => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 3); return s; };

    // waves: low rumbling noise, the bus volume follows the swash
    const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 650;
    loop(0.7).connect(wl).connect(this.buses.waves);
    // wind: a moving band of noise
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.8;
    loop(1.3).connect(this.windFilter).connect(this.buses.wind);
    // cicadas: a high, buzzing band, pulsing
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 5200; cf.Q.value = 9;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 38; const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain); lfo.start();
    const swell = ctx.createGain(); swell.gain.value = 1;
    const swellLfo = ctx.createOscillator(); swellLfo.frequency.value = 0.18; const swellGain = ctx.createGain(); swellGain.gain.value = 0.6;
    swellLfo.connect(swellGain).connect(swell.gain); swellLfo.start();
    loop(2).connect(cf).connect(am).connect(swell).connect(this.buses.cicadas);
  }

  private impulse(secs: number) {
    const ctx = this.ctx!, len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
  }

  /** Called every frame with where the bull is. */
  update(a: Ambience) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.night = a.night;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.4);
    set(this.buses.waves, a.shore * (0.32 + 0.28 * Math.max(0, a.swash)));
    set(this.buses.wind, 0.05 + a.height * 0.14);
    this.windFilter.frequency.setTargetAtTime(380 + 260 * Math.sin(t * 0.13) + a.height * 200, t, 0.8);
    set(this.buses.cicadas, (1 - a.night) * (0.015 + a.trees * 0.05));
    set(this.buses.crickets, a.night * 0.5);
    set(this.buses.music, 0.16);

    // crickets: short chirps from a few voices at random times
    if (a.night > 0.05 && t > this.nextCricket) {
      this.nextCricket = t + 0.25 + Math.random() * 0.9;
      this.cricket(t, 4300 + Math.random() * 600, (Math.random() - 0.5) * 1.6);
    }
    // music: a new chord every ~6 s, and a bell note now and then
    if (t > this.nextChord) { this.nextChord = t + 6; this.playChord(t); }
    if (t > this.nextBell) { this.nextBell = t + 2.5 + Math.random() * 4; this.bell(t); }
  }

  private cricket(t: number, f: number, pan: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.frequency.value = f; p.pan.value = pan; g.gain.value = 0;
    for (let i = 0; i < 3; i++) { const s = t + i * 0.06; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.05, s + 0.01); g.gain.linearRampToValueAtTime(0, s + 0.04); }
    o.connect(g).connect(p).connect(this.buses.crickets);
    o.start(t); o.stop(t + 0.25);
  }

  // dusk: D major colours; night: D dorian / minor, lower and softer
  private static DAY = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]];
  private static NIGHT = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [43, 50, 55, 58, 62], [45, 52, 57, 60, 64]];
  private playChord(t: number) {
    const ctx = this.ctx!, night = this.night > 0.5;
    const notes = (night ? IslandAudio.NIGHT : IslandAudio.DAY)[this.chord++ % 4];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = night ? 900 : 1600;
    lp.connect(this.buses.music);
    for (const n of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n < 55 ? 'sine' : 'triangle';
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12) * (1 + (Math.random() - 0.5) * 0.003);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 2.2);
      g.gain.linearRampToValueAtTime(0.035, t + 5);
      g.gain.linearRampToValueAtTime(0, t + 8.5);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + 9);
    }
  }

  private bell(t: number) {
    const ctx = this.ctx!, scale = this.night > 0.5 ? [62, 65, 67, 69, 72, 74] : [62, 64, 66, 69, 71, 74];
    const n = scale[Math.floor(Math.random() * scale.length)] + 12;
    const f = 440 * Math.pow(2, (n - 69) / 12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    for (const [mul, amp] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f * mul; og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t); o.stop(t + 3.1);
    }
    g.connect(this.buses.music);
  }

  /** One hoof landing; strength 0…1 (galloping is louder). */
  hoof(surface: Surface, strength: number, pan = 0) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime, out = ctx.createStereoPanner();
    out.pan.value = pan;
    const v = 0.25 + strength * 0.5, pitch = 1 + (Math.random() - 0.5) * 0.16;
    out.connect(this.buses.hooves);
    const thump = (freq: number, dur: number, amp: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(freq * pitch, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5 * pitch, t + dur);
      g.gain.setValueAtTime(amp * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
    };
    const hiss = (type: BiquadFilterType, freq: number, q: number, dur: number, amp: number) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise; s.playbackRate.value = 3 * pitch;
      f.type = type; f.frequency.value = freq * pitch; f.Q.value = q;
      g.gain.setValueAtTime(amp * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 3); s.stop(t + dur + 0.02);
    };
    switch (surface) {
      case 'wood': thump(170, 0.16, 0.9); hiss('bandpass', 2200, 2, 0.03, 0.5); thump(330, 0.08, 0.3); break;
      case 'stone': hiss('bandpass', 3200, 3, 0.025, 0.9); thump(230, 0.06, 0.4); break;
      case 'sand': hiss('lowpass', 700, 0.7, 0.14, 0.7); thump(80, 0.08, 0.3); break;
      case 'path': hiss('lowpass', 1100, 0.7, 0.09, 0.6); thump(95, 0.08, 0.5); break;
      default: hiss('lowpass', 1500, 0.7, 0.07, 0.45); thump(90, 0.07, 0.5); // grass
    }
  }
}
