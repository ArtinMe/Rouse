export type WakeState = "armed" | "stage1" | "stage2" | "stage3" | "dismissed";

export type EscalationConfig = {
  /** Delay from stage1 entry to auto-advancing to stage2, ms. */
  stage1ToStage2Ms: number;
  /** Delay from stage2 entry to auto-advancing to stage3, ms. */
  stage2ToStage3Ms: number;
  /** Extra time added to the pending transition when paused, ms. */
  pauseGraceMs: number;
};

// PRD §11a defaults: stage1→2 at +20s, stage2→3 at +40s total (i.e. 20s
// after entering stage2). Pause grace window per PRD §7: "+15s".
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  stage1ToStage2Ms: 20_000,
  stage2ToStage3Ms: 20_000,
  pauseGraceMs: 15_000,
};

type Listener = (state: WakeState) => void;

/**
 * Explicit state machine for the wake escalation sequence:
 * armed → stage1 → stage2 → stage3 (ceiling) → dismissed.
 *
 * Framework-agnostic and side-effect-free beyond scheduling its own
 * timers — haptic/audio/UI layers subscribe to state changes and react,
 * rather than living inside this class. Kept deliberately explicit
 * (named states + scheduled deadlines) rather than ad-hoc timers, since
 * later phases layer position-reconciliation logic on top of it.
 */
export class WakeEscalation {
  private state: WakeState = "armed";
  private config: EscalationConfig;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private pendingNextState: WakeState | null = null;
  private listeners = new Set<Listener>();

  constructor(config: EscalationConfig = DEFAULT_ESCALATION_CONFIG) {
    this.config = config;
  }

  getState(): WakeState {
    return this.state;
  }

  /** Ms remaining until the next auto-transition, or null if none pending. */
  getMsRemaining(): number | null {
    if (this.deadline === null) return null;
    return Math.max(0, this.deadline - Date.now());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** armed → stage1. No-op if not currently armed. */
  trigger(): void {
    if (this.state !== "armed") return;
    this.enterState("stage1");
  }

  /**
   * Screen-on/motion detected mid-escalation: pause, don't cancel. Extends
   * the current pending transition by the configured grace window rather
   * than resetting or advancing it — a stray glance shouldn't reset the
   * safety net, but it shouldn't cancel it either.
   */
  pause(): void {
    if (this.deadline === null || this.pendingNextState === null) return;
    this.deadline += this.config.pauseGraceMs;
    this.scheduleTimeout();
  }

  /** Explicit "I'm awake" action. Only full cancellation path. */
  dismiss(): void {
    this.enterState("dismissed");
  }

  private enterState(next: WakeState): void {
    this.clearTimer();
    this.state = next;

    if (next === "stage1") {
      this.armTransition("stage2", this.config.stage1ToStage2Ms);
    } else if (next === "stage2") {
      this.armTransition("stage3", this.config.stage2ToStage3Ms);
    }
    // stage3 is the ceiling: no further auto-transition.
    // dismissed: terminal.

    for (const listener of this.listeners) listener(this.state);
  }

  private armTransition(next: WakeState, delayMs: number): void {
    this.pendingNextState = next;
    this.deadline = Date.now() + delayMs;
    this.scheduleTimeout();
  }

  private scheduleTimeout(): void {
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    if (this.deadline === null || this.pendingNextState === null) return;

    const delay = Math.max(0, this.deadline - Date.now());
    const next = this.pendingNextState;
    this.timeoutId = setTimeout(() => this.enterState(next), delay);
  }

  private clearTimer(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.deadline = null;
    this.pendingNextState = null;
  }

  /** Stop all timers without changing state. For cleanup on unmount. */
  destroy(): void {
    this.clearTimer();
    this.listeners.clear();
  }
}
