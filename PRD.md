# PRD: Rouse

**Status:** Draft — v1 scope
**Owner:** Artin
**Related docs:** README.md (architecture, phases, tech stack)

## 1. Problem

Long transit rides — GO Trains in particular — make falling asleep risky.
Missing your stop can mean waking up in a far-out station or another city
with no easy way back. Existing tools (Google Maps, official GO/TTC apps)
handle trip planning and delays, but none are built around the specific
moment this product targets: safely disengaging attention from a trip
you've already committed to.

## 2. Goals

- Let a user select their destination stop before a trip and be woken,
  reliably, before they miss it.
- Make the wake-up escalate in a way that respects other passengers by
  default, while guaranteeing the user actually wakes up if needed.
- Work across GO Transit at launch, with an architecture that doesn't need
  to be rebuilt to add TTC or Viva later.

## 3. Non-goals (v1)

- Trip planning or route comparison (that's Google Maps/Reroute's job)
- Multi-user accounts beyond what push notification delivery requires
- Automatic trip detection (guessing which trip you're on from location
  alone) — user selects the trip manually
- TTC and Viva support in v1 — **committed for later phases (README Phases
  6-7), not excluded from the project.** GO Transit is v1 because it's the
  longer, city-to-city trips where the sleep-risk problem is worst, and it's
  the builder's own commute. The provider adapter architecture (§9) exists
  specifically so TTC and Viva are a real extension, not a rewrite.
- Native iOS/Android app — PWA only

## 4. Target user

Any GTA transit rider on a long enough trip that falling asleep is both
tempting and risky — GO Train/Bus riders first, given they cover the
longest city-to-city distances. This is being built as a real product for
other people to use, not primarily a personal tool — the builder will
test and dogfood it, but is not the primary intended user.

## 5. Core user flow

1. User opens the app before or during a trip, selects agency → route →
   destination stop. If the selected stop has an active service alert
   (closure, construction, detour), the app surfaces it before the user
   commits to that destination.
2. User sets audio preference (private/headphones vs. public/speaker) —
   editable at any time during the trip.
3. App tracks position via two independent signals: device GPS and the
   agency's live GTFS-RT feed. It reconciles the two continuously,
   favoring whichever is currently more trustworthy (see §6). It also
   continuously watches for the active trip skipping the destination stop
   mid-trip — a distinct, higher-urgency case from a pre-trip alert, since
   it can occur without any advisory ever being published.
4. As the trip's live ETA to the destination stop crosses the user's
   configured wake-up lead time (minutes, not raw distance — see §7a),
   the app begins the wake escalation (see §7).
5. User dismisses via an explicit "I'm awake" action. Escalation cannot be
   cancelled by passive signals (screen-on, motion) alone — those only
   pause/extend the timer.

## 6. Position reconciliation (core technical requirement)

The system must not trust GPS or the live feed unconditionally — each can
fail independently and silently:

- GPS degrades or drops in tunnels/underground stations, or drifts with
  poor accuracy.
- A GTFS-RT feed can go stale (stop updating) without reporting an error,
  serving a last-known position indefinitely.

**Requirements:**
- Track feed staleness (time since `last_updated`) independent of the
  value it reports; treat a feed that hasn't advanced while the trip
  should be moving as suspect.
- Weight GPS readings by their own reported accuracy; low-accuracy readings
  should not override a healthy feed.
- When both sources are healthy and agree, proceed normally. When one is
  degraded, trust the healthy one. When both are degraded simultaneously,
  fail safe — trigger the wake escalation early rather than risk waking
  the user late.
- Log disagreements between sources for later analysis (informs whether
  the reconciliation policy needs tuning, and is useful writeup material).

## 6a. Service disruption handling

Two distinct requirements, not one feature:

- **Full network coverage.** The destination picker must reflect the
  complete, real GO Transit network (bus and train, every published
  route/stop) — not a subset limited to routes the builder personally
  uses.
- **Pre-trip advisory.** Before a user commits to a destination, check the
  Service Alerts feed for that stop/route. If there's an active alert
  (e.g. a station closed for construction), surface the real alert text
  so the user can choose a different destination or plan accordingly —
  don't let them silently pick an unreachable stop.
- **In-trip stop-skip detection.** Independently of alerts, continuously
  watch the active trip's `schedule_relationship` data for the
  destination stop. If it's marked skipped mid-trip, this needs to be
  treated as urgently as a reconciliation failure (§6) — the user's
  planned wake-up point may no longer be valid, and they need to know
  before they'd otherwise be woken at the wrong place or not at all.
- **How the user is actually notified:** this is a separate, distinct
  notification from the wake alarm — a push/in-app alert saying the
  destination stop has changed, sent immediately once detected, not
  folded into the escalation sequence in §7. The user needs to know
  something changed even if they're nowhere near their wake threshold yet.

## 7a. Wake threshold: time, not raw distance

Raw distance (e.g. "1km before") is unreliable on GO routes specifically,
because speed varies a lot — 1km at highway speed passes in under a
minute, while 1km approaching a station at low speed could be several
minutes. **The threshold should be based on live ETA (minutes remaining),
computed from the reconciled position/feed data, not a fixed distance.**
This also directly serves the "I need time to actually become alert, not
just conscious" concern — a minutes-based lead time is what actually maps
to "enough time to gather belongings and be oriented," not a distance that
means different things at different speeds.

- Default lead time: **5 minutes** — a starting point, not a researched
  number. It needs real tuning during Phase 5 testing, and should be
  user-configurable so people needing more time (matching the "few minutes
  to feel oriented" concern) can set 10+ minutes themselves.
- The user sets this in minutes at trip setup; the app converts it to a
  live ETA check internally, so it stays accurate regardless of the
  train/bus's actual speed at any given moment.

## 7b. Confirming the user is actually awake, not just silencing the alarm

A single "I'm awake" tap isn't fully reliable — people who are used to
dismissing morning alarms and falling back asleep may do the same here
reflexively. Two additions to guard against this:

- **Follow-up check-in.** ~60-90 seconds after dismissal, send one more
  lightweight ping (vibration or quiet sound, not a full re-escalation).
  If there's no interaction with that ping either, resume escalation from
  Stage 2 rather than assuming the first dismissal was reliable.
- **Require a real interaction to dismiss, not just a tap near the
  button.** Something slightly more deliberate than a single tap — e.g. a
  short press-and-hold — reduces the chance of dismissing it half-asleep
  on reflex the same way people silence a phone alarm without waking up.

## 7. Wake escalation

Must balance two competing needs: guarantee the user wakes up, and avoid
disturbing other passengers by default.

| Stage | Trigger | Behavior |
|---|---|---|
| Armed | Trip started, threshold not yet reached | Silent |
| 1 | Threshold reached | Gentle haptic only (custom pattern on Android; OS-default notification haptic on iOS, since iOS Safari has no reliable unattended vibration API) |
| 2 | +20s, no dismissal | Haptic continues + low-volume rising tone |
| 3 | +40s, no dismissal (ceiling) | User's configured max-volume alarm + continuous vibration where available |

- **Volume is user-adjustable, not hardcoded to max.** A slider (same
  pattern as iPhone's own Ringtone & Alerts volume control), defaulting to
  the midpoint (6/10). Stage 3's "ceiling" means the loudest *the user has
  chosen*, not the device's absolute maximum — nobody's forced into a
  siren-level default.
- If the user has set audio preference to "private" (headphones), audio
  may start immediately at Stage 1 rather than waiting, since there's no
  social cost.
- Explicit dismissal (see §7b) is the only full cancellation. Screen-on or
  detected motion pauses/extends the timer without cancelling — a stray
  glance at another notification shouldn't reset the safety net.
- **Audio output preference (private/public) stays a manual, always-
  editable setting — it cannot be reliably auto-detected.** Checked
  directly: iOS Safari has no dependable way for a web app to detect or
  force audio away from connected Bluetooth/wired headphones back to the
  phone speaker — this is a documented platform limitation, not a gap in
  our design. Default value: **phone speaker**, changeable any time.

## 8. Platform constraints (binding on design, not just notes)

- **iOS Web Push:** requires PWA install to home screen; subscribe prompt
  must be a direct user tap; subscriptions can go stale after 1-2 weeks of
  inactivity and need a resubscribe check on app open.
- **iOS vibration:** no reliable unattended custom vibration API. Stage 1
  on iOS relies on the OS's own notification haptic, not custom JS.
- **iOS ring/silent switch and system volume:** both mute/scale all web
  audio, with no web API to detect the switch's state or override either.
  Confirmed in Phase 1 testing — if the phone is silenced, the client-side
  audio layer produces no sound at all, and there is no code-level fix.
  The app must tell the user plainly to check ringer/volume rather than
  silently failing; it cannot verify this itself. Vibration is a separate
  setting from the ring switch, so a real Phase 4 push notification will
  still vibrate on silent even though this client-side audio can't play —
  one concrete reason Web Push isn't just a backgrounded nice-to-have.
- Because of both constraints, the client-side geofence check (while the
  tab/PWA is foregrounded) is the primary trigger; Web Push is the
  backgrounded fallback, not the sole mechanism.

## 9. Architecture summary

See README.md for full detail. Key points relevant to this PRD:
- Provider adapter pattern normalizes each agency's feed into one internal
  schema (`Agency → Route → Trip → Stop → StopTime`), so reconciliation and
  escalation logic never touch agency-specific formats.
- v1 implements the GO Transit adapter only; TTC is the second adapter,
  chosen specifically to pressure-test the abstraction; Viva/York Region
  Transit is the planned third adapter, contingent on confirming it has a
  usable realtime feed (open question, §12).

## 10. Success criteria (v1)

- At least one real trip, ridden by someone other than the builder, ends
  with a reliable wake-up and no missed stop.
- A first-time user with zero prior context can go from opening the app to
  a correctly configured trip without needing anything explained to them.
- Escalation demonstrably respects the "quiet first" principle in a real
  quiet-car scenario without needing to be manually muted.
- Reconciliation logic correctly identifies at least one real instance of
  feed staleness or GPS degradation during testing, and handles it without
  a missed stop.

## 10a. New requirements from building for others, not just self

- **Onboarding:** first-open flow must be self-explanatory — agency/route/
  stop selection and what the escalation does, with no assumed context.
- **Privacy:** a short, honest, plain-language note on what's tracked
  (live GPS, on-device) and what isn't stored or shared beyond what's
  needed for push delivery. Not a full legal policy for v1, but a real,
  visible statement — this is tracking strangers' location, not just the
  builder's own.
- **Cross-route robustness:** reconciliation and escalation logic can't
  only be tuned against the builder's own commute — needs testing across
  at least one route the builder doesn't personally ride, ideally with a
  second tester.

## 11. Risks

- **iOS push reliability in practice** may be worse than documented —
  needs real multi-hour-trip testing, not just spec reading.
- **Metrolinx API rate limits** at short polling intervals — may need to
  tune polling frequency or cache more aggressively.
- **False positives in reconciliation** (waking the user early/often) could
  erode trust in the app faster than a false negative would — worth
  weighting failure-mode design toward this in testing.
- **Silenced/muted phone defeats client-side audio entirely, with no way
  for the app to detect or override it (§8).** Until Phase 4 push lands,
  a user who forgets to unmute their ringer gets no wake-up at all — this
  needs explicit, hard-to-miss onboarding messaging, not just a hope that
  users remember.

## 11a. Default settings (all user-editable)

| Setting | Default |
|---|---|
| Wake lead time | 5 minutes before ETA |
| Audio output | Phone speaker |
| Alarm volume | 6/10 |
| Escalation timing | Stage 1→2 at +20s, Stage 2→3 at +40s |

## 12. Open questions

- Exact distance/stop-count default for the wake threshold — needs
  real-world tuning, likely configurable per user.
- Whether Viva/York Region Transit has any usable realtime feed (affects
  whether phase 7 in the README is buildable at all).
