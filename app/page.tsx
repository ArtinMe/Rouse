"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { watchGeofence, type GeofenceUpdate } from "@/lib/geofence";
import { isIOSDevice, stopVibration, vibrateForStage } from "@/lib/haptics";
import { mockTrip } from "@/lib/mockTrip";
import { useEscalation } from "@/lib/useEscalation";

function subscribeNoop() {
  return () => {};
}

export default function Home() {
  const [update, setUpdate] = useState<GeofenceUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const isIOS = useSyncExternalStore(
    subscribeNoop,
    isIOSDevice,
    () => false,
  );

  const escalation = useEscalation();

  useEffect(() => {
    vibrateForStage(escalation.state);
    return () => stopVibration();
  }, [escalation.state]);

  useEffect(() => {
    if (!watching) return;

    const stop = watchGeofence({
      destination: mockTrip.destination,
      thresholdMeters: mockTrip.wakeThresholdMeters,
      onUpdate: (u) => {
        setUpdate(u);
        setError(null);
        console.log("[geofence]", u);
        if (u.withinThreshold) escalation.trigger();
      },
      onError: (e) => {
        setError(e.message);
        console.error("[geofence]", e);
      },
    });

    return stop;
  }, [watching, escalation]);

  // Poll the countdown for display purposes only.
  useEffect(() => {
    const id = setInterval(() => setMsRemaining(escalation.getMsRemaining()), 250);
    return () => clearInterval(id);
  }, [escalation]);

  useEffect(() => {
    console.log("[escalation]", escalation.state);
  }, [escalation.state]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 text-center dark:bg-black">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Rouse
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Wakes you up before you miss your stop.
        </p>
      </div>

      <button
        onClick={() => setWatching((w) => !w)}
        className="rounded-full bg-indigo-600 px-6 py-3 font-medium text-white"
      >
        {watching ? "Stop watching" : "Start watching (mock trip)"}
      </button>

      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 text-left text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">
          Destination: {mockTrip.destination.name} · Threshold:{" "}
          {mockTrip.wakeThresholdMeters}m
        </p>
        {error && <p className="mt-2 text-red-600">Error: {error}</p>}
        {update && (
          <div className="mt-2 space-y-1 text-black dark:text-zinc-50">
            <p>Distance: {update.distanceMeters.toFixed(1)}m</p>
            <p>Accuracy: {update.accuracyMeters.toFixed(1)}m</p>
            <p>
              Within threshold:{" "}
              <span
                className={
                  update.withinThreshold
                    ? "font-semibold text-green-600"
                    : "text-zinc-500"
                }
              >
                {update.withinThreshold ? "yes" : "no"}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 text-left text-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-zinc-500 dark:text-zinc-400">Escalation state</p>
        <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">
          {escalation.state}
        </p>
        {isIOS && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            iOS: no custom vibration this phase — audio (Stage 2/3, next
            step) is what you can test here.
          </p>
        )}
        {msRemaining !== null && (
          <p className="text-zinc-500 dark:text-zinc-400">
            Next stage in {(msRemaining / 1000).toFixed(1)}s
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={escalation.trigger}
            className="rounded-full bg-zinc-800 px-4 py-2 text-white dark:bg-zinc-200 dark:text-black"
          >
            Simulate trigger
          </button>
          <button
            onClick={escalation.pause}
            className="rounded-full border border-zinc-300 px-4 py-2 text-black dark:border-zinc-700 dark:text-white"
          >
            Simulate screen-on (pause)
          </button>
          <button
            onClick={escalation.dismiss}
            className="rounded-full bg-red-600 px-4 py-2 text-white"
          >
            I&apos;m awake
          </button>
        </div>
      </div>
    </div>
  );
}
