export type MockTrip = {
  id: string;
  destination: {
    name: string;
    lat: number;
    lng: number;
  };
  wakeThresholdMeters: number;
};

// Vaughan Metropolitan Centre (VMC) station — small threshold so the
// geofence can be triggered by walking around outside rather than
// needing to be on a real train.
export const mockTrip: MockTrip = {
  id: "mock-1",
  destination: {
    name: "Vaughan Metropolitan Centre",
    lat: 43.79417,
    lng: -79.5275,
  },
  wakeThresholdMeters: 200,
};
