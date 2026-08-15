import type { WakeState } from "@/lib/escalation";

type ActiveTone = {
  osc: OscillatorNode;
  gain: GainNode;
};

type ActiveSchedule = {
  intervalId: ReturnType<typeof setInterval>;
  tones: Set<ActiveTone>;
};

type ToneEnvelope = {
  attackMs: number;
  holdMs: number;
  decayMs: number;
  peak: number;
  type?: OscillatorType;
};

// PRD §7 default alarm volume: 6/10.
const DEFAULT_MASTER_VOLUME = 0.6;

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let active: ActiveSchedule | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = DEFAULT_MASTER_VOLUME;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

/**
 * Must be called from within a user-gesture handler (a click/tap) to
 * satisfy iOS Safari's autoplay policy. Once unlocked here, later
 * programmatic playback — e.g. stage2/stage3 firing from an escalation
 * timer, with no fresh gesture — is still audible.
 */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/**
 * 0-1, scales every stage's output. Routed through a single master
 * GainNode so this is the one place stage audio loudness is controlled —
 * wired ahead of the volume slider (PRD §7) that will eventually call it.
 */
export function setMasterVolume(volume: number): void {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const clamped = Math.max(0, Math.min(1, volume));
  masterGain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.05);
}

/**
 * One shaped note: linear attack to `peak`, a hold, then a linear decay
 * to silence — instead of snapping the gain on/off, which is what made
 * the previous version sound like a raw buzzer. Self-cleans on end.
 */
function playEnvelopedTone(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  { attackMs, holdMs, decayMs, peak, type = "sine" }: ToneEnvelope,
): ActiveTone {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.connect(gain);

  const now = ctx.currentTime;
  const attackEnd = now + attackMs / 1000;
  const holdEnd = attackEnd + holdMs / 1000;
  const decayEnd = holdEnd + decayMs / 1000;

  gain.gain.linearRampToValueAtTime(peak, attackEnd);
  gain.gain.setValueAtTime(peak, holdEnd);
  gain.gain.linearRampToValueAtTime(0, decayEnd);

  osc.start(now);
  osc.stop(decayEnd + 0.05);

  const tone: ActiveTone = { osc, gain };
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    active?.tones.delete(tone);
  };

  return tone;
}

function stopActive(): void {
  if (!active) return;
  clearInterval(active.intervalId);

  const ctx = audioContext;
  for (const { osc, gain } of active.tones) {
    if (ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    try {
      osc.stop((ctx?.currentTime ?? 0) + 0.06);
    } catch {
      // already stopped/scheduled
    }
  }

  active = null;
}

/**
 * Stage 2: soft two-note chime — root (C5) + a fifth above (G5), played
 * together, each with a quick fade-in and gentle fade-out. Repeats every
 * ~3s rather than droning continuously.
 */
function scheduleStage2(ctx: AudioContext): void {
  stopActive();
  if (!masterGain) return;
  const dest = masterGain;
  const tones = new Set<ActiveTone>();

  const playChime = () => {
    const envelope: Omit<ToneEnvelope, "peak"> = {
      attackMs: 50,
      holdMs: 250,
      decayMs: 300,
    };
    tones.add(playEnvelopedTone(ctx, dest, 523.25, { ...envelope, peak: 0.55 })); // C5
    tones.add(playEnvelopedTone(ctx, dest, 783.99, { ...envelope, peak: 0.4 })); // G5
  };

  const intervalId = setInterval(playChime, 3000);
  active = { intervalId, tones };
  playChime();
}

/**
 * Stage 3 (ceiling): urgent, alternating two-tone "wee-oo" alarm —
 * deliberately more dissonant and much faster than Stage 2, with a
 * sharper attack. Not a notification-style "ding": this needs to
 * actually wake someone.
 */
function scheduleStage3(ctx: AudioContext): void {
  stopActive();
  if (!masterGain) return;
  const dest = masterGain;
  const tones = new Set<ActiveTone>();

  let high = true;
  const playAlarmTone = () => {
    const freq = high ? 880 : 660;
    high = !high;
    tones.add(
      playEnvelopedTone(ctx, dest, freq, {
        attackMs: 15,
        holdMs: 550,
        decayMs: 180,
        peak: 0.95,
        type: "sawtooth",
      }),
    );
  };

  const intervalId = setInterval(playAlarmTone, 800);
  active = { intervalId, tones };
  playAlarmTone();
}

export function playAudioForStage(state: WakeState): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  if (state === "stage2") {
    scheduleStage2(ctx);
  } else if (state === "stage3") {
    scheduleStage3(ctx);
  } else {
    stopActive();
  }
}

export function stopAudio(): void {
  stopActive();
}
