# EventScorer Latest Audit Status and Feature Summary

Date: 2026-05-21
Scope: EventScorer app in [screens/eventscorer](screens/eventscorer) and backend integration in [server.js](server.js)

## Latest Audit Status (Applied vs Fixed)

The items below were fixed in this pass:

- Update-auth cookie on HTTP production: FIXED
  - secure flag now respects request scheme (with env override).
  - Evidence: [screens/eventscorer/app/api/admin/update-auth/route.ts](screens/eventscorer/app/api/admin/update-auth/route.ts)

- Event links ignore x-forwarded-proto: FIXED
  - Create-event now honors forwarded protocol headers.
  - Evidence: [screens/eventscorer/app/api/events/route.ts](screens/eventscorer/app/api/events/route.ts)

- Realtime broadcast endpoint unauthenticated: FIXED
  - Optional shared secret now protects broadcast endpoint.
  - Evidence: [server.js](server.js)

- Admin websocket unauthenticated: FIXED
  - Optional HMAC auth token now validates websocket connections.
  - Evidence: [server.js](server.js) and [screens/eventscorer/lib/ws-auth.ts](screens/eventscorer/lib/ws-auth.ts)

- Global error handler registered before routes: FIXED
  - Error middleware moved to the end of the middleware stack.
  - Evidence: [server.js](server.js)

- Tailwind lint warnings in admin dashboard: FIXED (diagnostics-only)
  - CSS var class syntax updated to Tailwind v4 style.
  - Evidence: [screens/eventscorer/components/admin-live-dashboard.tsx](screens/eventscorer/components/admin-live-dashboard.tsx)

## Progress Tracking (Double-Checked)

Status below is verified against the current code as of 2026-05-21.

### Already Finished

- Create New Scorer flow with Standard and Final Oral Defense options in [screens/eventscorer/components/create-scorer-form.tsx](screens/eventscorer/components/create-scorer-form.tsx).
- Final Oral Defense template criteria in [screens/eventscorer/lib/default-rubric.ts](screens/eventscorer/lib/default-rubric.ts).
- Presentation slots and judge assignment per contestant in [screens/eventscorer/components/create-scorer-form.tsx](screens/eventscorer/components/create-scorer-form.tsx).
- Create Rating Sheet flow with direct rating config in [screens/eventscorer/components/rating-sheet.tsx](screens/eventscorer/components/rating-sheet.tsx) and [screens/eventscorer/lib/direct-rating-config.ts](screens/eventscorer/lib/direct-rating-config.ts).
- EventScorer proxy routes and realtime broadcast integration in [server.js](server.js).

### Not Finished (Open Issues)

- None in the current bug list after this fix pass.

### Not Yet Implemented

- Optional LAN-only admin auth for realtime updates.
- Audit log for admin edits and judge submissions.
- Export options (CSV/Excel/PDF) for rankings and judge breakdowns.
- Backup/restore workflow for local DB dumps.
- Offline mode banner when judge submissions are queued.
- Event duplication, event archiving, and admin scoring presets.
- Role-limited views (admin vs viewer).

## Feature Summary (Current and Intended Usage)

### Create New Scorer

EventScorer has two scoring modes for rubric-based events:

1. Standard Scoring

- Fully dynamic rubric with parent criteria and subcriteria.
- Supports judges, contestant entries, and presentation slots.
- Suitable for school events like student research congress or poster presentation.
- Supports group/team scoring, individual scoring, or a combined group + individual setup.
- Individual scoring expands subcriteria per participant when needed.

2. Final Oral Defense

- Uses a rubric that combines group/team and individual criteria.
- Fully dynamic rubric with parent criteria and subcriteria.
- Supports judges, contestant entries, and presentation slots.
- Rubric-based scoring is split into group and individual (default 60/40), normalized to a 100-point total.

### Create Rating Sheet

- Built for scoring incoming first-year applicants for department entrance.
- Uses direct rating fields (AVE/GPA, NOAT, Interview) with admin-configured max scores.
- Supports strand alignment rules and bonus points.
- Judges score applicants, and the final rating is computed automatically.

## Recommended Enhancements

- Add optional LAN-only admin auth for realtime updates (shared secret or PIN).
- Add lightweight audit log for admin edits and judge submissions (local file or DB table only).
- Add export options (CSV/Excel/PDF) for rankings and judge breakdowns.
- Add backup/restore workflow for local DB dumps (no cloud sync).
- Add explicit "offline mode" banner when judge submissions are queued.

## Missing Features (Suggested)

- Event duplication (clone an existing event as a template).
- Per-event archiving and read-only mode for completed events.
- Judge roster reuse with quick select (already partially supported via judge directory API; surface in UI).
- Admin-defined scoring presets (save/load rubric templates).
- Role-limited views (admin vs viewer) within the LAN.

## Bugs / Corrupted Code (Current)

- No corrupted code detected.
- Previously reported items in this section were fixed on 2026-05-21.

## Notes for Future Development

- EventScorer remains LAN-only and must not depend on the public internet.
- All new links and callbacks must be local (LAN IP, 127.0.0.1, or 0.0.0.0).
- Secrets must remain local and stored only in server .env on the LAN server PC.
