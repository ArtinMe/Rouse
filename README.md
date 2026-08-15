# Rouse

Wakes you up before you miss your stop.

## The problem

On long transit rides — GO Trains especially — falling asleep is risky. Miss
your stop and you're stuck at a far-out station with no way home. Rouse
tracks your live position against your chosen route and wakes you (sound +
vibration + push notification) a configurable distance or stop-count before
your destination, so you can actually sleep instead of fighting to stay awake.

## Demo moment

Board a GO Train, pick your destination station in the app, lock your phone,
fall asleep (or pretend to). ~1km / N stops before arrival, the phone buzzes
and sounds an alarm loud enough to wake you, with the station name on screen.

## Why build this over existing apps

Google Maps and the official GO/TTC apps surface schedules, delays, and trip
planning, but none of them are built around this specific moment — "I've
already committed to this trip, now let me safely stop paying attention to
it." That's the whole product here, not a feature bolted onto a planner.

## Scope for v1 (vertical slice)

- One agency: GO Transit only
- One direction of travel, manually selected trip (no auto-detection yet)
- Client-side geofence trigger only — no backend, no live GTFS-RT yet
- Goal: prove the *wake-up mechanism itself* (sound + vibration + lock-screen
  notification) works reliably on a real phone before adding data complexity

## Architecture

**Client:** Next.js PWA (must be installed to home screen — required for iOS
push eligibility). Pointer/geolocation via `watchPosition`.

**Backend:** Supabase — Postgres for trip/station data, Edge Function polling
the active trip's GTFS-realtime feed on an interval, computing distance/ETA
remaining server-side.

**Notification delivery — two layers, not one:**
1. **Client-side geofence (primary while tab is open/foregrounded):**
   haversine distance check against destination coordinates, fires local
   notification + vibration + audio directly from the device.
2. **Web Push (backgrounded fallback):** server-triggered push when the
   backend's poll shows the trip is close. Necessary because iOS Safari
   throttles `watchPosition` in the background — a backgrounded/locked tab
   can't be trusted to keep tracking on its own.

   Known iOS constraints to design around:
   - Push only works if the PWA is installed via Add to Home Screen — a
     browser tab does not qualify.
   - The subscribe prompt must be triggered by a direct tap, every session
     start (can't silently re-subscribe).
   - Push subscriptions can go stale after ~1–2 weeks of inactivity; the
     app needs a "resubscribe" check on open.
   - No silent/data-only background push on iOS — every push must show a
     visible notification, which is actually fine for this use case.
   - **The hardware ring/silent switch mutes all web audio (Web Audio API
     and `<audio>`/`<video>` alike), and there is no web API to detect its
     state or override it.** Same for system volume — a maxed-out gain
     node still comes out at whatever the phone's physical volume is set
     to. Neither is fixable from a web page; only native apps can bypass
     this, via an entitlement not available to web content. Practical
     mitigation: the app must clearly tell the user to check ringer/volume
     before relying on it, since it can't verify this itself.
   - The switch does *not* disable vibration (a separate "Vibrate on
     Silent" setting, on by default) — so a real native push notification
     in Phase 4 will still vibrate on silent, even though Phase 1's
     client-side audio and custom `vibrate()` cannot. This is the one
     concrete advantage Web Push has over the foreground geofence for
     this specific failure mode.

**Provider abstraction (designed now, used starting Phase 7):** each agency
(GO, TTC, Viva) gets an adapter that normalizes its feed into one internal
schema, so trip-tracking logic never touches agency-specific formats.

**Service disruption awareness — two distinct signals:**
1. **Service Alerts feed** (general advisories: closures, construction,
   detours, reduced service). Checked at **destination-selection time** —
   if the user picks a stop with an active alert, warn them before they
   commit, surfacing the real alert text rather than a generic message.
2. **Trip Updates' `schedule_relationship` field** (per-trip stop skips).
   Checked **continuously during the trip** — if the specific trip the
   user is on starts skipping their destination stop, that's a distinct,
   higher-urgency case from a general alert, since it can happen without
   any advisory ever being published.

## Internal data contract

```
Agency    { id, name, gtfs_rt_url, requires_key }
Route     { id, agency_id, short_name, long_name }
Trip      { id, route_id, direction, service_date }
Stop      { id, agency_id, name, lat, lng, sequence_on_route }
StopTime  { trip_id, stop_id, scheduled_arrival, live_eta, delay_seconds,
            schedule_relationship }  // SCHEDULED | SKIPPED | NO_DATA
Alert     { id, agency_id, effect, header_text, description_text,
            affected_route_ids, affected_stop_ids, active_period_start,
            active_period_end }
```

Agree on this shape before writing any provider-specific code. Locking the
schema early — rather than letting each agency's raw data format leak into
the app's logic — is what makes adding TTC and Viva later a matter of
writing one new adapter, not reworking the whole system.

**Full network coverage is a real requirement, not a nice-to-have.** The
static GTFS pull must cover every GO route and stop (bus and train) as
published by Metrolinx — not a hardcoded subset of routes the builder
personally rides. The destination picker should be able to show any real
GO stop that exists.

## Built for others, not just personal use

This is a real product other GTA riders can use, not primarily a personal
tool — the builder will test it but isn't the intended primary user. That
changes two things beyond the core mechanism:

- **Onboarding has to work with zero context.** A stranger opening this
  for the first time needs to get to a correctly configured trip without
  anything explained to them in person.
- **A short, honest privacy note is required**, not optional — this
  tracks live GPS for people who aren't the builder. Doesn't need to be a
  full legal policy for v1, but needs to say plainly what's tracked and
  what isn't stored or shared beyond what push delivery requires.

## Phases

1. **Wake-mechanism proof** — mock trip data, hardcoded destination coords,
   client-only geofence, confirm sound/vibration/notification actually wakes
   someone on a real device. No real GTFS data yet.
2. **GO static integration** — pull GO's full GTFS static feed (every bus
   and train route/stop, not a hand-picked subset), build the route/
   station picker UI against the real, complete stop list.
3. **GO live tracking** — Metrolinx Open Data API (registered key), backend
   polling trip-updates, replace geofence-only trigger with live ETA/stops-
   remaining logic. Also poll the Service Alerts feed and surface active
   alerts at destination-selection time, and watch `schedule_relationship`
   on the active trip for mid-trip stop skips.
4. **Push notification layer** — Web Push subscription flow, backgrounded
   delivery, resubscribe-on-open handling.
5. **Deploy + test with real riders** — ship it, use it on a real commute
   personally, and get at least one other rider to actually use it on a
   trip. Fix whatever breaks in practice — for both testers, not just
   assumptions tuned to one person's commute.
6. **TTC provider adapter** — second agency, specifically to pressure-test
   the abstraction from Phase 3. Expect it to break an assumption GO let us
   get away with.
7. **Viva adapter (stretch)** — contingent on confirming York Region Transit
   has a usable realtime feed; static-only fallback if not.

## Cut list

- Multi-user accounts beyond what's needed for push subscriptions
- Route/trip autocomplete polish
- Native app wrapper — a dev-signed native build only installs on the
  builder's own registered device without full App Store submission, which
  doesn't scale to other users. PWA is the only realistic path to "anyone
  can use this via a link," so this stays cut deliberately, not by default.
- Trip auto-detection (guessing which trip you're on from location alone)
- Viva, if no realtime feed turns out to exist

## Tech stack

Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres + Edge
Functions), Web Push API, Metrolinx Open Data API, TTC GTFS-RT
(`bustime.ttc.ca/gtfsrt`), Vercel.

## Open questions

- Real-world Web Push reliability on iOS over a multi-hour trip — needs
  testing, not just spec-reading.
- Metrolinx API key rate limits at polling frequencies under ~30s.
- Whether Viva/York Region Transit exposes any GTFS-realtime feed at all.
