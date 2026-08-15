"use client";

import { useEffect, useState } from "react";
import { watchGeofence, type GeofenceUpdate } from "@/lib/geofence";
import { mockTrip } from "@/lib/mockTrip";

export default function Home() {
  const [update, setUpdate] = useState<GeofenceUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!watching) return;

    const stop = watchGeofence({
      destination: mockTrip.destination,
      thresholdMeters: mockTrip.wakeThresholdMeters,
      onUpdate: (u) => {
        setUpdate(u);
        setError(null);
        console.log("[geofence]", u);
      },
      onError: (e) => {
        setError(e.message);
        console.error("[geofence]", e);
      },
    });

    return stop;
  }, [watching]);

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
    </div>
  );
}
