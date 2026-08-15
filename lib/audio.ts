import type { WakeState } from "@/lib/escalation";

type ActiveSound = {
  oscillators: OscillatorNode[];
  gain: GainNode;
  intervalId?: ReturnType<typeof setInterval>;
};

let audioContext: AudioContext | null = null;
let active: ActiveSound | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
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

function stopActive(): void {
  if (!active) return;
  const { oscillators, gain, intervalId } = active;
  const ctx = audioContext;

  if (ctx) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
  }
  if (intervalId) clearInterval(intervalId);

  setTimeout(() => {
    for (const osc of oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    }
  }, 200);

  active = null;
}

/** Stage 2: soft rising chime — two sine tones, gentle fade-in over 3s. */
function playStage2(ctx: AudioContext): void {
  stopActive();

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 3);
  gain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  osc1.connect(gain);
  osc1.start();

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(783.99, ctx.currentTime); // G5
  osc2.connect(gain);
  osc2.start();

  active = { oscillators: [osc1, osc2], gain };
}

/**
 * Stage 3 (ceiling): genuinely loud, urgent, pulsing alarm — deliberately
 * not a notification-style "ding", since this needs to actually wake
 * someone.
 */
function playStage3(ctx: AudioContext): void {
  stopActive();

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.3);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.connect(gain);
  osc.start();

  let loud = true;
  const intervalId = setInterval(() => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(loud ? 0.9 : 0.25, now + 0.15);
    loud = !loud;
  }, 350);

  active = { oscillators: [osc], gain, intervalId };
}

export function playAudioForStage(state: WakeState): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  if (state === "stage2") {
    playStage2(ctx);
  } else if (state === "stage3") {
    playStage3(ctx);
  } else {
    stopActive();
  }
}

export function stopAudio(): void {
  stopActive();
}
