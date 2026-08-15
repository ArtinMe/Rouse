const EARTH_RADIUS_METERS = 6_371_000;

export type LatLng = {
  lat: number;
  lng: number;
};

/**
 * Great-circle distance between two coordinates, in meters.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeofenceUpdate = {
  position: LatLng;
  accuracyMeters: number;
  distanceMeters: number;
  withinThreshold: boolean;
  timestamp: number;
};

export type GeofenceError = {
  code: number;
  message: string;
};

export type GeofenceWatcherOptions = {
  destination: LatLng;
  thresholdMeters: number;
  onUpdate: (update: GeofenceUpdate) => void;
  onError?: (error: GeofenceError) => void;
};

/**
 * Wraps navigator.geolocation.watchPosition, computing haversine distance
 * to `destination` on every update. Returns a cleanup function that stops
 * watching. Reused mostly unchanged once real GTFS/live-position data
 * replaces the mock trip in later phases.
 */
export function watchGeofence({
  destination,
  thresholdMeters,
  onUpdate,
  onError,
}: GeofenceWatcherOptions): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.({ code: -1, message: "Geolocation is not available" });
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const current: LatLng = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const distanceMeters = haversineDistanceMeters(current, destination);

      onUpdate({
        position: current,
        accuracyMeters: position.coords.accuracy,
        distanceMeters,
        withinThreshold: distanceMeters <= thresholdMeters,
        timestamp: position.timestamp,
      });
    },
    (error) => {
      onError?.({ code: error.code, message: error.message });
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
