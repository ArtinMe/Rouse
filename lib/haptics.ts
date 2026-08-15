import type { WakeState } from "@/lib/escalation";

/**
 * iOS Safari has no reliable unattended vibration API — Stage 1's haptic
 * there comes from the OS's own notification vibration once Web Push is
 * wired in (Phase 4). For Phase 1, iOS simply has no custom haptic;
 * audio (Stage 2/3) is what's testable and reliable there.
 */
export function isIOSDevice(
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function supportsVibration(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function" &&
    !isIOSDevice()
  );
}

// [vibrate, pause, vibrate, pause, ...] in ms.
const STAGE_PATTERNS: Partial<Record<WakeState, number[]>> = {
  stage1: [200], // gentle, single pulse
  stage2: [250, 400, 250, 400, 250, 400], // continues from stage1, still moderate
  stage3: [600, 150, 600, 150, 600, 150, 600, 150], // ceiling: strongest, most persistent
};

export function vibrateForStage(state: WakeState): void {
  if (!supportsVibration()) return;

  const pattern = STAGE_PATTERNS[state];
  if (pattern) {
    navigator.vibrate(pattern);
  } else {
    navigator.vibrate(0);
  }
}

export function stopVibration(): void {
  if (supportsVibration()) navigator.vibrate(0);
}
