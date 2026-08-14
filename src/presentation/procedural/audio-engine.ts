import type { AudioPreferences, MusicProfile, SynthPatch } from "../audio-types";

const MAX_SFX_VOICES = 8;

type BrowserAudioContext = AudioContext;

interface LiveVoice {
  readonly stop: (when: number) => void;
}

function audioContextCtor(): (new () => BrowserAudioContext) | null {
  const global = globalThis as typeof globalThis & {
    AudioContext?: new () => BrowserAudioContext;
    webkitAudioContext?: new () => BrowserAudioContext;
  };
  return global.AudioContext ?? global.webkitAudioContext ?? null;
}

function clampGain(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export class AudioEngine {
  private context: BrowserAudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: LiveVoice[] = [];
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicStep = 0;
  private musicProfile: MusicProfile | null = null;
  prefs: AudioPreferences = { enabled: true, master: 1, music: 0.7, sfx: 0.8 };

  ensureContext(): boolean {
    if (!this.prefs.enabled) {
      return false;
    }
    if (this.context) {
      return this.context.state !== "closed";
    }
    const Ctor = audioContextCtor();
    if (!Ctor) {
      return false;
    }
    const context = new Ctor();
    this.context = context;
    this.master = context.createGain();
    this.musicGain = context.createGain();
    this.sfxGain = context.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(context.destination);
    this.applyGains();
    this.noise = this.makeNoise(context);
    return true;
  }

  applyGains(): void {
    const master = this.prefs.enabled ? clampGain(this.prefs.master) : 0;
    this.master?.gain.setValueAtTime(master, this.context?.currentTime ?? 0);
    this.musicGain?.gain.setValueAtTime(clampGain(this.prefs.music), this.context?.currentTime ?? 0);
    this.sfxGain?.gain.setValueAtTime(clampGain(this.prefs.sfx), this.context?.currentTime ?? 0);
  }

  async resume(): Promise<void> {
    if (!this.ensureContext() || !this.context) {
      return;
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  playPatch(patch: SynthPatch, intensity = 1): void {
    if (!this.prefs.enabled || !this.ensureContext() || !this.context || !this.sfxGain) {
      return;
    }
    const ctx = this.context;
    const now = ctx.currentTime;
    const duration = Math.max(0.04, patch.durationMs / 1000);
    const gain = ctx.createGain();
    const peak = clampGain(patch.gain * intensity);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + patch.attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(patch.filterHz, now);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    const source = this.connectSource(ctx, patch, now, duration, filter);
    this.trackVoice({
      stop: (when) => {
        try {
          source.stop(when);
        } catch {
          /* already stopped */
        }
      },
    });
    if (patch.effect === "delay") {
      const delay = ctx.createDelay();
      delay.delayTime.setValueAtTime(0.12, now);
      const echo = ctx.createGain();
      echo.gain.setValueAtTime(0.18, now);
      gain.connect(delay);
      delay.connect(echo);
      echo.connect(this.sfxGain);
    }
  }

  startMusic(profile: MusicProfile): void {
    this.stopMusic();
    this.musicProfile = profile;
    if (!this.prefs.enabled || !this.ensureContext() || !this.context || !this.musicGain) {
      return;
    }
    this.musicStep = 0;
    this.scheduleMusic();
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicProfile = null;
    this.musicStep = 0;
  }

  suspend(): void {
    this.stopMusic();
    void this.context?.suspend();
  }

  currentMusic(): MusicProfile | null {
    return this.musicProfile;
  }

  private scheduleMusic(): void {
    const profile = this.musicProfile;
    const ctx = this.context;
    const dest = this.musicGain;
    if (!profile || !ctx || !dest || !this.prefs.enabled) {
      return;
    }
    const stepSec = 60 / profile.tempo / (profile.meter === 0 ? 4 : profile.meter);
    const now = ctx.currentTime;
    const notes = profile.notes.filter((note) => note.step === this.musicStep);
    for (const note of notes) {
      const voice = profile.voices.find((row) => row.id === note.voiceId);
      if (!voice) {
        continue;
      }
      const osc = ctx.createOscillator();
      osc.type = voice.oscillator === "noise" ? "sawtooth" : voice.oscillator;
      osc.frequency.setValueAtTime(440 * 2 ** ((note.pitch - 69) / 12), now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(voice.gain * note.velocity, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.05, note.durationSteps * stepSec * 0.9));
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = voice.filterHz;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + Math.max(0.06, note.durationSteps * stepSec));
    }
    this.musicStep = (this.musicStep + 1) % profile.steps;
    this.musicTimer = setTimeout(() => this.scheduleMusic(), stepSec * 1000);
  }

  private connectSource(
    ctx: BrowserAudioContext,
    patch: SynthPatch,
    now: number,
    duration: number,
    dest: AudioNode,
  ): AudioBufferSourceNode | OscillatorNode {
    if (patch.source === "noise") {
      const source = ctx.createBufferSource();
      source.buffer = this.noise ?? this.makeNoise(ctx);
      source.loop = true;
      source.connect(dest);
      source.start(now);
      source.stop(now + duration);
      return source;
    }
    const osc = ctx.createOscillator();
    osc.type = patch.source;
    osc.frequency.setValueAtTime(patch.frequencyHz, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, patch.endFrequencyHz), now + duration);
    osc.connect(dest);
    osc.start(now);
    osc.stop(now + duration);
    return osc;
  }

  private trackVoice(voice: LiveVoice): void {
    this.voices.push(voice);
    while (this.voices.length > MAX_SFX_VOICES) {
      this.voices.shift()?.stop(this.context?.currentTime ?? 0);
    }
  }

  private makeNoise(ctx: BrowserAudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < data.length; i += 1) {
      seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
      data[i] = ((seed >>> 8) / 0x1000000) * 2 - 1;
    }
    return buffer;
  }
}
