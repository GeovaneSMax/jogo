/**
 * Custom-composed Stone Age Adaptive Soundtrack Engine for Heroes Clash (Era I: Idade da Pedra)
 *
 * Synthesizes a multi-layered acoustic tribal orchestra in real time via Web Audio API:
 *  - Ancestral Bone Flute (breath transient + expressive vibrato + warm lowpass)
 *  - Stone Lithophone & Wood Marimba (mallet click + harmonic overtone resonance)
 *  - Tribal Lyre / Gut Pluck Bass (warm harmonic decay)
 *  - Ancestral Bone Horn & Prehistoric Drone (formant-filtered stereo brass/reed swell)
 *  - Mammoth-Hide War Drums & Hand Djembe (pitch-enveloped membrane + skin slap)
 *  - Seed-Pod Shakers & Wood Claves (bandpass-filtered organic percussion)
 *  - Sunlit Stone-Valley Stereo Convolution Reverb
 *
 * Automatically adapts between:
 *  - 'fortress': "Alvorada da Pedra" (98 BPM, warm D Dorian village exploration theme)
 *  - 'battle':   "Tambores da Tribo" (126 BPM, driving heroic war-drum battle anthem)
 */

export type SoundtrackMode = 'fortress' | 'battle';

// MIDI note number -> frequency in Hz
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// ORIGINAL COMPOSITIONS — 64 sixteenth-note steps (4 bars) per phrase, 2 phrases (A + B)
// Key: D Dorian / D Minor Pentatonic (D=62, E=64, F=65, G=67, A=69, B=71, C=72, D5=74)
// ---------------------------------------------------------------------------

// Fortress Theme ("Alvorada da Pedra") — 128 sixteenth-note steps (8 bars = A + B)
const FORTRESS_FLUTE_STEPS: Array<{ step: number; note: number; dur: number; vel: number }> = [
  // Bar 1 (Dm7) — gentle inviting Stone Age motif
  { step: 0, note: 69, dur: 4, vel: 0.78 },
  { step: 4, note: 72, dur: 2, vel: 0.72 },
  { step: 6, note: 74, dur: 4, vel: 0.86 },
  { step: 10, note: 72, dur: 2, vel: 0.7 },
  { step: 12, note: 69, dur: 4, vel: 0.75 },
  // Bar 2 (C) — sunlit lift
  { step: 16, note: 67, dur: 4, vel: 0.76 },
  { step: 20, note: 69, dur: 2, vel: 0.72 },
  { step: 22, note: 72, dur: 4, vel: 0.84 },
  { step: 26, note: 69, dur: 2, vel: 0.68 },
  { step: 28, note: 67, dur: 4, vel: 0.7 },
  // Bar 3 (Bb / Gm7) — warm earthy cadence
  { step: 32, note: 65, dur: 4, vel: 0.74 },
  { step: 36, note: 67, dur: 2, vel: 0.7 },
  { step: 38, note: 69, dur: 6, vel: 0.85 },
  { step: 44, note: 67, dur: 2, vel: 0.68 },
  { step: 46, note: 65, dur: 2, vel: 0.66 },
  // Bar 4 (Am -> Dm) — peaceful breath
  { step: 48, note: 64, dur: 4, vel: 0.72 },
  { step: 52, note: 67, dur: 4, vel: 0.76 },
  { step: 56, note: 62, dur: 6, vel: 0.8 },

  // Bar 5 (Dm7 — Section B soaring tribal answer)
  { step: 64, note: 74, dur: 4, vel: 0.88 },
  { step: 68, note: 76, dur: 2, vel: 0.82 },
  { step: 70, note: 77, dur: 4, vel: 0.92 },
  { step: 74, note: 76, dur: 2, vel: 0.78 },
  { step: 76, note: 74, dur: 4, vel: 0.82 },
  // Bar 6 (C)
  { step: 80, note: 72, dur: 4, vel: 0.82 },
  { step: 84, note: 74, dur: 2, vel: 0.76 },
  { step: 86, note: 72, dur: 2, vel: 0.74 },
  { step: 88, note: 69, dur: 4, vel: 0.78 },
  { step: 92, note: 67, dur: 4, vel: 0.74 },
  // Bar 7 (Bb)
  { step: 96, note: 69, dur: 3, vel: 0.82 },
  { step: 99, note: 72, dur: 3, vel: 0.84 },
  { step: 102, note: 74, dur: 4, vel: 0.88 },
  { step: 106, note: 72, dur: 2, vel: 0.72 },
  { step: 108, note: 69, dur: 4, vel: 0.76 },
  // Bar 8 (C -> Dm resolution)
  { step: 112, note: 67, dur: 4, vel: 0.76 },
  { step: 116, note: 64, dur: 2, vel: 0.68 },
  { step: 118, note: 62, dur: 8, vel: 0.84 },
];

// Marimba / Stone Lithophone chords per bar (8 bars = 128 steps)
const FORTRESS_CHORDS: number[][] = [
  [50, 57, 62, 65], // Bar 1: Dm
  [48, 55, 60, 64], // Bar 2: C
  [46, 53, 58, 62], // Bar 3: Bb
  [45, 52, 57, 60], // Bar 4: Am
  [50, 57, 62, 65], // Bar 5: Dm
  [48, 55, 60, 64], // Bar 6: C
  [46, 53, 58, 62], // Bar 7: Bb
  [48, 55, 60, 62], // Bar 8: Csus2 -> Dm
];

// Battle Theme ("Tambores da Tribo") — 128 sixteenth-note steps (8 bars)
const BATTLE_FLUTE_STEPS: Array<{ step: number; note: number; dur: number; vel: number }> = [
  // Bar 1 (Dm heroic war call)
  { step: 0, note: 74, dur: 3, vel: 0.92 },
  { step: 3, note: 74, dur: 1, vel: 0.75 },
  { step: 4, note: 77, dur: 2, vel: 0.9 },
  { step: 6, note: 76, dur: 2, vel: 0.84 },
  { step: 8, note: 74, dur: 4, vel: 0.92 },
  { step: 12, note: 72, dur: 2, vel: 0.82 },
  { step: 14, note: 74, dur: 2, vel: 0.86 },
  // Bar 2 (C)
  { step: 16, note: 72, dur: 3, vel: 0.88 },
  { step: 19, note: 69, dur: 1, vel: 0.74 },
  { step: 20, note: 67, dur: 4, vel: 0.86 },
  { step: 24, note: 69, dur: 2, vel: 0.82 },
  { step: 26, note: 72, dur: 2, vel: 0.86 },
  { step: 28, note: 74, dur: 4, vel: 0.9 },
  // Bar 3 (Bb)
  { step: 32, note: 70, dur: 3, vel: 0.88 },
  { step: 35, note: 72, dur: 1, vel: 0.76 },
  { step: 36, note: 74, dur: 4, vel: 0.92 },
  { step: 40, note: 72, dur: 2, vel: 0.8 },
  { step: 42, note: 70, dur: 2, vel: 0.8 },
  { step: 44, note: 69, dur: 4, vel: 0.86 },
  // Bar 4 (A -> Dm tension)
  { step: 48, note: 69, dur: 2, vel: 0.86 },
  { step: 50, note: 72, dur: 2, vel: 0.86 },
  { step: 52, note: 76, dur: 4, vel: 0.92 },
  { step: 56, note: 74, dur: 2, vel: 0.84 },
  { step: 58, note: 72, dur: 2, vel: 0.82 },
  { step: 60, note: 69, dur: 4, vel: 0.88 },

  // Bar 5-8: High climax tribal battle motif
  { step: 64, note: 81, dur: 4, vel: 0.94 },
  { step: 68, note: 79, dur: 2, vel: 0.86 },
  { step: 70, note: 77, dur: 2, vel: 0.86 },
  { step: 72, note: 74, dur: 4, vel: 0.9 },
  { step: 76, note: 77, dur: 4, vel: 0.9 },
  // Bar 6 (C)
  { step: 80, note: 79, dur: 4, vel: 0.92 },
  { step: 84, note: 76, dur: 2, vel: 0.84 },
  { step: 86, note: 72, dur: 2, vel: 0.82 },
  { step: 88, note: 74, dur: 4, vel: 0.88 },
  { step: 92, note: 72, dur: 4, vel: 0.84 },
  // Bar 7 (Bb)
  { step: 96, note: 77, dur: 3, vel: 0.9 },
  { step: 99, note: 76, dur: 1, vel: 0.78 },
  { step: 100, note: 74, dur: 2, vel: 0.86 },
  { step: 102, note: 72, dur: 2, vel: 0.84 },
  { step: 104, note: 70, dur: 4, vel: 0.88 },
  { step: 108, note: 72, dur: 4, vel: 0.88 },
  // Bar 8 (A -> Dm war cadence)
  { step: 112, note: 76, dur: 3, vel: 0.92 },
  { step: 115, note: 74, dur: 1, vel: 0.8 },
  { step: 116, note: 72, dur: 2, vel: 0.84 },
  { step: 118, note: 69, dur: 2, vel: 0.84 },
  { step: 120, note: 74, dur: 6, vel: 0.94 },
];

const BATTLE_CHORDS: number[][] = [
  [38, 45, 50, 57], // Dm power
  [36, 43, 48, 55], // C power
  [34, 41, 46, 53], // Bb power
  [33, 40, 45, 52], // A power
  [38, 45, 50, 57], // Dm
  [36, 43, 48, 55], // C
  [34, 41, 46, 53], // Bb
  [33, 40, 45, 52], // A
];

class StoneAgeSoundtrackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private mode: SoundtrackMode = 'fortress';
  private enabled = true;
  private muted = false;
  private running = false;

  private currentStep = 0;
  private nextStepTime = 0;
  private schedulerId: number | null = null;
  private unlockBound = false;

  private listeners = new Set<() => void>();

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  public getTrackTitle(): string {
    return this.mode === 'battle'
      ? 'Tambores da Tribo (Combate)'
      : 'Alvorada da Pedra (Aldeia)';
  }

  public isMusicEnabled(): boolean {
    return this.enabled && !this.muted;
  }

  public isPlaying(): boolean {
    return this.running && this.enabled && !this.muted;
  }

  /**
   * Binds a one-time gesture listener so the custom soundtrack begins smoothly
   * as soon as the player clicks or presses any key in the browser.
   */
  public armAutoStart() {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;
    const onGesture = () => {
      if (this.enabled && !this.muted) {
        this.start();
      }
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
  }

  private ensureAudioGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Master bus with soft dynamics compressor so drums + flute glue smoothly
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.18;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      this.masterGain = master;

      const dry = ctx.createGain();
      dry.gain.value = 0.84;
      dry.connect(master);
      this.dryGain = dry;

      // Procedural sunlit stone-valley stereo reverb impulse response
      const reverb = ctx.createConvolver();
      reverb.buffer = this.createValleyImpulse(ctx, 1.75, 2.8);
      const revSend = ctx.createGain();
      revSend.gain.value = 0.28;
      revSend.connect(reverb);
      reverb.connect(master);
      this.reverbNode = reverb;
      this.reverbSend = revSend;

      // Shared white/pink noise buffer for shakers, drum skin slaps & flute breath
      this.noiseBuffer = this.createNoiseBuffer(ctx, 2.0);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createValleyImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        const raw = (Math.random() * 2 - 1) * env;
        // One-pole lowpass so the stone valley reverb feels warm, never harsh
        lp = lp * 0.72 + raw * 0.28;
        data[i] = lp;
      }
    }
    return buffer;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      out[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private connectVoice(node: AudioNode, pan: number, reverbAmt = 0.35) {
    if (!this.ctx || !this.dryGain || !this.reverbSend) return;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.85, Math.min(0.85, pan));
    node.connect(panner);
    panner.connect(this.dryGain);
    if (reverbAmt > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverbAmt;
      panner.connect(send);
      send.connect(this.reverbSend);
    }
  }

  public start() {
    if (!this.enabled || this.muted) return;
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(0.42, now + 0.9);

    if (!this.running) {
      this.running = true;
      this.currentStep = 0;
      this.nextStepTime = ctx.currentTime + 0.08;
      this.schedulerId = window.setInterval(() => this.schedulerTick(), 45);
      this.emit();
    }
  }

  public stop() {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    }
    if (this.running) {
      this.running = false;
      this.emit();
    }
  }

  public setMode(nextMode: SoundtrackMode) {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    // Align nicely to start of a 4-beat bar on mode switch
    this.currentStep = Math.floor(this.currentStep / 16) * 16;
    this.emit();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stop();
    } else if (this.enabled) {
      this.start();
    }
    this.emit();
  }

  public toggleMusic(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled && !this.muted) {
      this.start();
    } else {
      this.stop();
    }
    this.emit();
    return this.isMusicEnabled();
  }

  private getStepDuration(): number {
    const bpm = this.mode === 'battle' ? 126 : 98;
    // 16th note = quarter note / 4
    return 60 / bpm / 4;
  }

  private schedulerTick() {
    if (!this.ctx || !this.running) return;
    const lookahead = 0.14;
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this.getStepDuration();
      this.currentStep = (this.currentStep + 1) % 128;
    }
  }

  private scheduleStep(step: number, time: number) {
    const stepDur = this.getStepDuration();
    const barIndex = Math.floor(step / 16);
    const stepInBar = step % 16;

    if (this.mode === 'fortress') {
      this.scheduleFortressStep(step, barIndex, stepInBar, time, stepDur);
    } else {
      this.scheduleBattleStep(step, barIndex, stepInBar, time, stepDur);
    }
  }

  // -------------------------------------------------------------------------
  // FORTRESS ARRANGEMENT ("Alvorada da Pedra" — Warm Tribal Village)
  // -------------------------------------------------------------------------
  private scheduleFortressStep(
    step: number,
    barIndex: number,
    stepInBar: number,
    time: number,
    stepDur: number
  ) {
    const chord = FORTRESS_CHORDS[barIndex % FORTRESS_CHORDS.length];

    // 1. Bone Flute Melody
    const fluteHit = FORTRESS_FLUTE_STEPS.find((n) => n.step === step);
    if (fluteHit) {
      this.playBoneFlute(midiToHz(fluteHit.note), time, fluteHit.dur * stepDur * 0.96, fluteHit.vel * 0.24);
    }

    // 2. Wooden Marimba / Stone Lithophone gentle interlocking arpeggio
    const marimbaPattern = [0, -1, 2, -1, 1, -1, 3, 2, 0, -1, 2, -1, 3, -1, 1, -1];
    const mIdx = marimbaPattern[stepInBar];
    if (mIdx >= 0) {
      const vel = stepInBar % 4 === 0 ? 0.14 : 0.095;
      this.playStoneMarimba(midiToHz(chord[mIdx] + 12), time, vel, (mIdx - 1.5) * 0.28);
    }

    // 3. Tribal Lyre / Gut Pluck Bass on beats 1, 2.5, 3
    if (stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 14) {
      const bassMidi = stepInBar === 8 ? chord[1] - 12 : chord[0] - 12;
      this.playTribalPluck(midiToHz(bassMidi), time, stepDur * 4.5, stepInBar === 0 ? 0.22 : 0.15);
    }

    // 4. Warm Mammoth-Hide Frame Drum + Hand Djembe groove
    if (stepInBar === 0 || stepInBar === 10) {
      this.playMammothDrum(time, stepInBar === 0 ? 0.34 : 0.22, 92);
    }
    if (stepInBar === 4 || stepInBar === 12 || stepInBar === 14) {
      this.playDjembeTone(time, stepInBar === 14 ? 0.12 : 0.17, stepInBar === 4 ? 195 : 235);
    }

    // 5. Organic Seed-Pod Shaker pulse (subtle velocity humanization)
    if (stepInBar % 2 === 0) {
      const accent = stepInBar % 4 === 2 ? 0.06 : 0.032;
      this.playSeedShaker(time, accent, 0.35);
    }

    // 6. Soft Warm Ancestral Drone on Bar 1 & Bar 5
    if (step === 0 || step === 64) {
      this.playBoneHorn(midiToHz(chord[0] - 12), time, stepDur * 28, 0.085);
    }
  }

  // -------------------------------------------------------------------------
  // BATTLE ARRANGEMENT ("Tambores da Tribo" — Epic War Drums & Bone Horn)
  // -------------------------------------------------------------------------
  private scheduleBattleStep(
    step: number,
    barIndex: number,
    stepInBar: number,
    time: number,
    stepDur: number
  ) {
    const chord = BATTLE_CHORDS[barIndex % BATTLE_CHORDS.length];

    // 1. Heroic War Flute Lead
    const fluteHit = BATTLE_FLUTE_STEPS.find((n) => n.step === step);
    if (fluteHit) {
      this.playBoneFlute(midiToHz(fluteHit.note), time, fluteHit.dur * stepDur * 0.94, fluteHit.vel * 0.25);
    }

    // 2. Driving Stone-Marimba Battle Ostinato (energetic 8th/16th pulse)
    const ostPattern = [0, 2, 1, 2, 3, 2, 1, 2];
    if (stepInBar % 2 === 0) {
      const idx = ostPattern[stepInBar / 2];
      this.playStoneMarimba(midiToHz(chord[idx] + 24), time, 0.115, ((stepInBar % 4) - 1.5) * 0.3);
    }

    // 3. Thunderous Double Mammoth War Drums (driving tribal rhythm)
    if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6 || stepInBar === 8 || stepInBar === 11 || stepInBar === 14) {
      const heavy = stepInBar === 0 || stepInBar === 8;
      this.playMammothDrum(time, heavy ? 0.46 : 0.31, heavy ? 86 : 104);
    }

    // 4. Sharp Rim/Claves & War Djembe hits on off-beats
    if (stepInBar === 4 || stepInBar === 12) {
      this.playDjembeTone(time, 0.26, 265);
      this.playWoodClave(time, 0.11);
    }
    if (stepInBar === 15) {
      this.playWoodClave(time, 0.09);
    }

    // 5. Fast Urgent 16th-note Shakers
    const shakerVel = stepInBar % 4 === 0 ? 0.068 : stepInBar % 2 === 0 ? 0.045 : 0.025;
    this.playSeedShaker(time, shakerVel, -0.35);

    // 6. Heroic Ancestral Bone Horn Power Fifths every bar!
    if (stepInBar === 0) {
      this.playBoneHorn(midiToHz(chord[0]), time, stepDur * 14, 0.145);
      this.playBoneHorn(midiToHz(chord[1]), time, stepDur * 14, 0.1);
    }
  }

  // -------------------------------------------------------------------------
  // BESPOKE PREHISTORIC INSTRUMENT SYNTHESIZERS
  // -------------------------------------------------------------------------

  private playBoneFlute(freq: number, time: number, dur: number, volume: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + Math.min(0.065, dur * 0.25));
    out.gain.setValueAtTime(volume * 0.88, time + Math.max(0.07, dur - 0.09));
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.05);

    // Warm hollow flute body (sine fundamental + soft triangle harmonic)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, time);
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.14;

    // Gentle expressive vibrato swelling in after attack
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.1;
    lfoGain.gain.setValueAtTime(0.2, time);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.008, time + 0.16);
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    // Warm resonant wooden lowpass filter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(3400, freq * 3.6), time);
    lp.Q.value = 0.9;

    osc1.connect(lp);
    osc2.connect(osc2Gain);
    osc2Gain.connect(lp);
    lp.connect(out);

    // Subtle organic air-breath transient at note onset
    if (this.noiseBuffer) {
      const breath = ctx.createBufferSource();
      breath.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(3200, freq * 2.2);
      bp.Q.value = 3.2;
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.0001, time);
      bGain.gain.linearRampToValueAtTime(volume * 0.16, time + 0.02);
      bGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.min(0.14, dur * 0.6));
      breath.connect(bp);
      bp.connect(bGain);
      bGain.connect(out);
      breath.start(time);
      breath.stop(time + Math.min(0.16, dur + 0.04));
    }

    this.connectVoice(out, 0.14, 0.52);

    osc1.start(time);
    osc2.start(time);
    lfo.start(time);
    osc1.stop(time + dur + 0.08);
    osc2.stop(time + dur + 0.08);
    lfo.stop(time + dur + 0.08);
  }

  private playStoneMarimba(freq: number, time: number, volume: number, pan: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);

    // Fundamental bar resonance
    const fund = ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, time);

    // Wooden/stone bar 4th harmonic overtone (classic marimba mallet sparkle)
    const over = ctx.createOscillator();
    over.type = 'sine';
    over.frequency.setValueAtTime(freq * 3.98, time);
    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(0.28, time);
    overGain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);

    fund.connect(out);
    over.connect(overGain);
    overGain.connect(out);

    this.connectVoice(out, pan, 0.34);

    fund.start(time);
    over.start(time);
    fund.stop(time + 0.38);
    over.stop(time + 0.1);
  }

  private playTribalPluck(freq: number, time: number, dur: number, volume: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(freq * 5.2, time);
    lp.frequency.exponentialRampToValueAtTime(Math.max(140, freq * 1.4), time + dur);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(lp);
    lp.connect(out);
    this.connectVoice(out, -0.18, 0.22);

    osc.start(time);
    osc.stop(time + dur + 0.04);
  }

  private playBoneHorn(freq: number, time: number, dur: number, volume: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Two slightly detuned sawtooth oscillators through a warm brassy formant lowpass
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, time);
    oscB.frequency.setValueAtTime(freq * 1.005, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(720, freq * 2.5), time);
    filter.frequency.linearRampToValueAtTime(Math.min(1150, freq * 4.2), time + dur * 0.4);
    filter.frequency.linearRampToValueAtTime(Math.min(620, freq * 2.2), time + dur);
    filter.Q.value = 1.6;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + Math.min(0.28, dur * 0.3));
    out.gain.setValueAtTime(volume * 0.85, time + dur * 0.72);
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.12);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(out);

    this.connectVoice(out, -0.12, 0.55);

    oscA.start(time);
    oscB.start(time);
    oscA.stop(time + dur + 0.15);
    oscB.stop(time + dur + 0.15);
  }

  private playMammothDrum(time: number, volume: number, startHz = 96) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Deep resonant hide membrane pitch drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);

    osc.connect(out);
    this.connectVoice(out, 0, 0.24);
    osc.start(time);
    osc.stop(time + 0.38);

    // Organic hide mallet slap transient
    if (this.noiseBuffer) {
      const slap = ctx.createBufferSource();
      slap.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.value = 340;
      lp.Q.value = 1.2;
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(volume * 0.38, time);
      sGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      slap.connect(lp);
      lp.connect(sGain);
      this.connectVoice(sGain, 0, 0.18);
      slap.start(time);
      slap.stop(time + 0.07);
    }
  }

  private playDjembeTone(time: number, volume: number, pitchHz = 215) {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitchHz * 1.28, time);
    osc.frequency.exponentialRampToValueAtTime(pitchHz, time + 0.05);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

    osc.connect(out);
    this.connectVoice(out, 0.22, 0.25);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private playWoodClave(time: number, volume: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1680, time);
    const out = ctx.createGain();
    out.gain.setValueAtTime(volume, time);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 0.032);
    osc.connect(out);
    this.connectVoice(out, -0.32, 0.3);
    osc.start(time);
    osc.stop(time + 0.04);
  }

  private playSeedShaker(time: number, volume: number, pan: number) {
    if (!this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 5400;
    hp.Q.value = 1.8;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.linearRampToValueAtTime(volume, time + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

    src.connect(hp);
    hp.connect(out);
    this.connectVoice(out, pan, 0.15);

    // Random offset into noise buffer so every shake sounds naturally different
    const offset = Math.random() * 1.4;
    src.start(time, offset, 0.065);
  }
}

export const soundtrack = new StoneAgeSoundtrackEngine();
