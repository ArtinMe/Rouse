# Implementation Plan: Phase 1 — Wake Mechanism Proof

**Goal:** prove the wake-up mechanism itself works reliably on a real phone,
using mock/hardcoded trip data. No live GTFS integration yet — that's
Phase 2+. If this phase doesn't work, nothing downstream matters.

Note: Rouse is being built as a real product for other riders, not
primarily a personal tool — but Phase 1 is still fine to test entirely on
yourself. Onboarding-for-strangers and the privacy note (see README) only
start to matter once there's a real trip flow to onboard someone into,
around Phase 2-4. No need to build them yet.

**Definition of done:** you can open the app on your phone, set a fake
destination, walk/drive toward it (or fake the coordinates), and get
reliably woken via the staged escalation from README §Escalation — tested
for real, not just "the code runs."

---

## 1. Project setup

```bash
npx create-next-app@latest rouse --typescript --tailwind --app --no-src-dir
cd rouse
```

- Confirm it's a PWA-installable target from day one — add `manifest.json`
  and basic icons now, even placeholder ones. iOS push and install-to-
  home-screen both depend on this being real from the start, not bolted
  on later.
- Set up on Vercel immediately (`vercel` CLI or GitHub integration) so you
  have a real HTTPS URL — geolocation and notification permissions
  generally require a secure context, and testing over `localhost` on
  your phone isn't straightforward. Deploy early, deploy often.

## 2. Mock trip data

Skip GTFS entirely this phase. Hardcode a `Trip` object matching the
internal schema from the PRD, e.g.:

```ts
const mockTrip = {
  id: "mock-1",
  destination: { name: "Test Stop", lat: 43.6532, lng: -79.3832 },
  wakeThresholdMeters: 200, // small radius for easy real-world testing
};
```

Use a small threshold (a couple hundred meters) so you can actually
trigger it by walking around outside, rather than needing to be on a real
train.

## 3. Geofence trigger (client-side, foregrounded)

- `navigator.geolocation.watchPosition()` — compute haversine distance to
  `mockTrip.destination` on every update.
- When distance ≤ threshold, transition app state from `armed` → `stage1`.
- Build this as its own function/module (`lib/geofence.ts`) — it gets
  reused, mostly unchanged, once real GTFS data replaces the mock trip in
  Phase 3.

## 4. Escalation state machine

This is the core of Phase 1. Implement as an explicit state machine, not
ad-hoc timers — you'll thank yourself when Phase 2+ adds reconciliation
logic on top of it.

States: `armed → stage1 → stage2 → stage3(ceiling)`, plus `dismissed` and
`paused` (from screen-on/motion signals, per PRD §7).

```ts
type WakeState = "armed" | "stage1" | "stage2" | "stage3" | "dismissed";
```

- `stage1` entry: trigger haptic (see §5) — no audio yet unless the user's
  audio preference is "private."
- After 20s in `stage1` with no dismissal → `stage2`: haptic continues,
  start low-volume audio (fade in, don't snap to volume).
- After 20 more seconds with no dismissal → `stage3`: full volume + max
  haptic. This is the ceiling — stays here until dismissed.
- Any explicit "I'm awake" tap → `dismissed`, stop everything.
- Screen-on/motion detected mid-escalation → don't cancel, just don't
  advance to the next stage for an extra grace window (e.g. +15s) — this
  is the "pause, don't cancel" rule from the PRD.

## 5. Haptic layer (platform-aware)

- Android/Chrome: `navigator.vibrate([pattern])` directly — test real
  patterns, don't just call it once and assume it worked.
- iOS: do **not** build custom vibration logic — it's not reliably
  achievable unattended (per the platform research earlier). For iOS,
  Stage 1's haptic comes from the OS's own notification vibration once
  Web Push is wired in during Phase 4. For Phase 1 specifically, it's fine
  for iOS to have no custom haptic yet — audio (Stage 2/3) is what you can
  actually test and rely on this phase.
- Detect platform simply: `/iPad|iPhone|iPod/.test(navigator.userAgent)`
  is good enough here, no need for a fancy feature-detection library.

## 6. Audio layer

- Use the Web Audio API or a plain `<audio>` element — either works for
  Phase 1. Web Audio gives you cleaner volume fade control.
- Two audio assets: a soft rising chime (Stage 2) and a genuinely loud,
  urgent alarm tone (Stage 3). Don't reuse notification-style "ding"
  sounds for Stage 3 — it needs to actually wake someone.
- **Test this part while actually drowsy/half-asleep if you can** — a
  sound that seems obviously loud enough while alert at your desk may not
  be at 6am on a train. This is the single most important real-world test
  in this whole phase.

## 7. Dismiss UI

- Large, unmissable "I'm awake" button, visible the moment any stage
  triggers — no hunting for it half-asleep.
- Also stop everything (audio + haptic + state) immediately, no
  animation delay before the alarm actually cuts.

## 8. Manual test checklist (do this for real, not hypothetically)

- [ ] Install as PWA on your phone (Add to Home Screen), not just open in
      a browser tab
- [ ] Trigger Stage 1 by walking into the mock geofence radius
- [ ] Confirm Stage 2 escalates automatically at 20s with no interaction
- [ ] Confirm Stage 3 escalates at 40s
- [ ] Confirm "I'm awake" fully stops everything instantly
- [ ] Confirm screen-on (without tapping dismiss) pauses but doesn't
      cancel escalation
- [ ] Test on both Android and iOS if you have access to both — expect
      the haptic gap on iOS, confirm audio still works there
- [ ] Test with phone locked / screen off during Stage 1 trigger — this
      is the real use case, and the hardest to get right client-side

## What's explicitly out of scope this phase

- Real GTFS data (Phase 2)
- Position reconciliation logic (Phase 3, needs live feed to reconcile
  against)
- Web Push / backgrounded delivery (Phase 4)
- Audio output preference toggle (can stub as a hardcoded `true`/`false`
  for now — build the real UI when Phase 4 makes it matter)

---

## Suggested build order within this phase

1. Scaffold + deploy empty Next.js PWA to Vercel (get the HTTPS loop
   working first — everything else depends on testing on a real phone)
2. Geofence trigger with mock data, console.log instead of real
   haptic/audio — confirm the *logic* fires correctly first
3. Wire in real audio (easiest to verify, works cross-platform)
4. Wire in real vibration (Android-only for now)
5. Build the state machine properly around stages 1-3 + pause/dismiss
6. Full manual test checklist, ideally on a real short walk or drive
