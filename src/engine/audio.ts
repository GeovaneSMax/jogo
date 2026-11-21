// Synthesized medieval fantasy Web Audio sound effects (no external audio assets required)

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.08,
    endFreq?: number,
    delay = 0
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playBuild() {
    this.playTone(180, 0.11, 'triangle', 0.1, 110);
    this.playTone(320, 0.09, 'sine', 0.06, 440, 0.05);
  }

  public playUpgrade() {
    this.playTone(392, 0.12, 'triangle', 0.08, 440, 0);
    this.playTone(523.25, 0.16, 'triangle', 0.09, 587.33, 0.09);
    this.playTone(659.25, 0.22, 'sine', 0.08, 783.99, 0.18);
  }

  public playCollect() {
    this.playTone(660, 0.09, 'sine', 0.07, 880, 0);
    this.playTone(880, 0.14, 'sine', 0.07, 1174, 0.06);
  }

  public playDeploy() {
    this.playTone(260, 0.12, 'triangle', 0.09, 390);
    this.playTone(520, 0.15, 'sine', 0.06, 640, 0.06);
  }

  public playHit(style: string) {
    if (style === 'cannon') {
      this.playTone(115, 0.16, 'sawtooth', 0.07, 45);
    } else if (style === 'electric') {
      this.playTone(740, 0.08, 'square', 0.04, 320);
    } else if (style === 'ice') {
      this.playTone(980, 0.09, 'sine', 0.04, 1320);
    } else if (style === 'fire' || style === 'arcane') {
      this.playTone(240, 0.11, 'triangle', 0.05, 130);
    } else if (style === 'heal') {
      this.playTone(587, 0.14, 'sine', 0.045, 784);
    } else {
      this.playTone(420, 0.05, 'triangle', 0.035, 290);
    }
  }

  public playUltimate() {
    this.playTone(330, 0.14, 'triangle', 0.1, 440, 0);
    this.playTone(494, 0.18, 'triangle', 0.1, 659, 0.08);
    this.playTone(659, 0.34, 'sine', 0.11, 880, 0.16);
  }

  public playStructureDestroyed() {
    this.playTone(140, 0.25, 'sawtooth', 0.08, 42);
    this.playTone(95, 0.3, 'triangle', 0.08, 36, 0.05);
  }

  public playVictory() {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.28, 'triangle', 0.09, n * 1.01, idx * 0.11);
    });
  }

  public playDefeat() {
    const notes = [329.63, 293.66, 246.94, 196.0];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.3, 'sawtooth', 0.055, n * 0.96, idx * 0.14);
    });
  }
}

export const soundEngine = new SoundEngine();
