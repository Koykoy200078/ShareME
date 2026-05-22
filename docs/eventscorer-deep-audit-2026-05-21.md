# EventScorer Deep Audit Report

Date: 2026-05-21
Scope: EventScorer app under [screens/eventscorer](screens/eventscorer) and EventScorer backend integration in [server.js](server.js)
Deployment model: local-network-only LAN

## Executive Summary

- EventScorer is a full-featured scoring system with admin, judge, and rating-sheet flows backed by MySQL.
- The integration layer in [server.js](server.js) provides proxy and realtime updates, but it is unauthenticated by design for LAN use.
- The largest functional risk is update-auth cookies failing on HTTP production, which can break admin update and delete flows.

## Architecture Snapshot

### EventScorer App

- Next.js app in [screens/eventscorer](screens/eventscorer).
- API routes in [screens/eventscorer/app/api](screens/eventscorer/app/api) for create, judge session, admin update, and judge directory.
- UI pages in [screens/eventscorer/app](screens/eventscorer/app) (create, admin, judge, rating-sheet).
- Storage and scoring logic in [screens/eventscorer/lib](screens/eventscorer/lib).

### Backend Integration (server.js)

- Root Express server proxies EventScorer API endpoints under /api/eventscorer/\*.
- EventScorer admin realtime updates are broadcast via /api/eventscorer/broadcast.
- WebSocket server exposes /ws/admin-scores for live dashboard updates.

## System Functionality (EventScorer)

- Create rubric-based events and generate judge links.
- Create direct-rating sheets with configurable max scores and strand alignment rules.
- Judges submit scores per contestant; offline queue and autosync are supported.
- Admin dashboard shows compiled rankings with live updates.
- Event editing and deletion are protected by an update password via cookie.

## Flow Audit

### Create Scorer

1. UI posts to [screens/eventscorer/app/api/events/route.ts](screens/eventscorer/app/api/events/route.ts).
2. Storage layer persists event, contestants, criteria, and judges in MySQL.
3. API returns admin URL and judge links derived from request origin.

### Judge Scoring

1. Judge opens /judge/[token] and loads session from [screens/eventscorer/app/api/judge/[token]/route.ts](screens/eventscorer/app/api/judge/[token]/route.ts).
2. Scores are posted to the same route and saved in the DB.
3. A realtime update is broadcast via server.js /api/eventscorer/broadcast.

### Admin Live Dashboard

1. Admin page /admin/[eventId] renders from [screens/eventscorer/app/admin/[eventId]/page.tsx](screens/eventscorer/app/admin/[eventId]/page.tsx).
2. Compiled results are calculated via [screens/eventscorer/lib/scoring.ts](screens/eventscorer/lib/scoring.ts).
3. Admin dashboard receives realtime websocket updates on /ws/admin-scores.

### Rating Sheet

- Direct-rating events are created and edited via [screens/eventscorer/components/rating-sheet.tsx](screens/eventscorer/components/rating-sheet.tsx) and normalized by [screens/eventscorer/lib/direct-rating-config.ts](screens/eventscorer/lib/direct-rating-config.ts).

## Findings

### High

1. Update-auth cookie likely fails on HTTP production
   - Update auth cookies are set with secure=true when NODE_ENV=production.
   - The production scripts run HTTP only, so the cookie can be dropped by the browser.
   - Impact: admin update and delete operations fail (401).
   - Evidence: [screens/eventscorer/lib/update-auth.ts](screens/eventscorer/lib/update-auth.ts#L69)

### Medium

2. Admin links may use incorrect protocol behind HTTPS proxy
   - The create-event API sets host from request headers but does not honor x-forwarded-proto.
   - Impact: judge/admin links can be generated with http when the UI is served over https.
   - Evidence: [screens/eventscorer/app/api/events/route.ts](screens/eventscorer/app/api/events/route.ts#L22-L24)

3. Realtime broadcast endpoint is unauthenticated
   - Any LAN client can POST to /api/eventscorer/broadcast and inject admin updates.
   - Risk depends on LAN trust; acceptable only on trusted subnet.
   - Evidence: [server.js](server.js)

4. Admin websocket lacks authentication
   - /ws/admin-scores accepts any connection with an eventId query value.
   - Anyone on LAN with the eventId can observe admin realtime updates.
   - Evidence: [server.js](server.js)

5. Global error handler is registered early in server.js
   - The error middleware appears before other routes, so downstream errors may not be captured.
   - Impact: errors from EventScorer proxy routes may skip centralized handling.
   - Evidence: [server.js](server.js)

### Low

6. Tailwind lint warnings in admin dashboard
   - Diagnostics suggest class syntax changes; not runtime-breaking but noisy.
   - Evidence: [screens/eventscorer/components/admin-live-dashboard.tsx](screens/eventscorer/components/admin-live-dashboard.tsx)

## Memory Notes (EventScorer)

- Use savedContestantIds to count judge submissions correctly; fall back to positive scores only for legacy data.
- Avoid MySQL pool saturation by limiting pool size and caching pool promises.
- Direct rating config and criteria are normalized into dedicated tables (no JSON blob on events).
- Realtime scoring and admin views must use finalRating when present.

(Reference: [memories/repo/shareme-eventscorer-notes.md](memories/repo/shareme-eventscorer-notes.md))

## Recommendations (Fix Order)

1. Fix update-auth cookie behavior for HTTP production or move production to HTTPS only.
2. Add optional auth or shared secret for admin websocket and broadcast endpoint (even in LAN).
3. Respect x-forwarded-proto when generating judge/admin URLs.
4. Move the global error handler to the end of middleware stack.
5. Clean up Tailwind warnings for a quieter diagnostics panel.

## Test Gaps

- No automated tests found for admin auth, judge submission, or realtime updates.
- Consider adding smoke tests for judge submission and admin update flows.
