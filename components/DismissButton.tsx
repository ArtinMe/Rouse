"use client";

import { useRef, useState } from "react";

type DismissButtonProps = {
  onDismiss: () => void;
  holdMs?: number;
};

/**
 * Large, unmissable "I'm awake" control. Requires a deliberate
 * press-and-hold rather than a single tap (PRD §7b) — reduces the
 * chance of dismissing it half-asleep on reflex, the way people silence
 * a phone alarm without actually waking up.
 */
export function DismissButton({ onDismiss, holdMs = 800 }: DismissButtonProps) {
  const [holding, setHolding] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    setHolding(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setHolding(false);
      onDismiss();
    }, holdMs);
  };

  const cancelHold = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setHolding(false);
  };

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      style={{ touchAction: "manipulation" }}
      className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-red-600 px-8 py-8 text-center text-2xl font-bold text-white shadow-lg select-none"
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-red-900"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding
            ? `width ${holdMs}ms linear`
            : "width 150ms ease-out",
        }}
      />
      <span className="relative">
        {holding ? "Keep holding…" : "Press & hold — I'm awake"}
      </span>
    </button>
  );
}
