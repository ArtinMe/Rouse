import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ESCALATION_CONFIG,
  WakeEscalation,
  type EscalationConfig,
  type WakeState,
} from "@/lib/escalation";

export function useEscalation(config: EscalationConfig = DEFAULT_ESCALATION_CONFIG) {
  const machine = useMemo(() => new WakeEscalation(config), [config]);
  const [state, setState] = useState<WakeState>(machine.getState());

  useEffect(() => {
    const unsubscribe = machine.subscribe(setState);
    return () => {
      unsubscribe();
      machine.destroy();
    };
  }, [machine]);

  return {
    state,
    trigger: () => machine.trigger(),
    pause: () => machine.pause(),
    dismiss: () => machine.dismiss(),
    getMsRemaining: () => machine.getMsRemaining(),
  };
}
