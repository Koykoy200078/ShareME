# ShareME Workspace Deep Audit Report

Date: 2026-05-21
Scope: full workspace review (root backend, ShareME web app, EventScorer app, scripts, configs, docs)
Deployment model: local-network-only LAN

## Executive Summary

- The workspace is coherent and actively evolving (ShareME web UI rebuilt in Next app; EventScorer normalized DB and realtime scoring; ops scripts unified).
- Several high-impact issues remain open (upload path traversal, weak path boundary check, update-auth cookie behavior in HTTP production, and print-trigger side effects).
- Prior audit items around legacy DOM injection and drag-drop traversal appear resolved in the new React UI.

## System Overview

- Root backend: Express server in server.js with uploads, delete, disk space, print, and WebSocket updates. Also proxies EventScorer API and broadcasts.
- ShareME web UI: Next.js app in screens/sharemeweb with file list, upload, preview, printing, and websocket status.
- EventScorer UI/API: Next.js app in screens/eventscorer with admin, judge, and rating-sheet flows backed by MySQL.
- Ops scripts: scripts/dev-all.js and scripts/prod-all.js for local LAN startup; deploy scripts in scripts/.

## System Functionality (Core Capabilities)

### ShareME Backend (server.js)

- File uploads via POST /upload-chunk with optional hash verification.
- File listing, delete, and bulk delete under /files-list and /delete\* endpoints.
- Print settings, printers, print jobs, and print history endpoints.
- Disk space endpoint /disk-space and upload activity broadcast support.
- WebSocket server on /ws for file updates and upload activity.

### ShareME Web UI (screens/sharemeweb)

- Files panel with filters, search, sorting, pagination, and bulk actions.
- Upload panel with drag-drop folders and progress tracking.
- Preview modal for images, video, and PDFs.
- Direct print panel with printer, size, color, scale, copies, and history.
- WebSocket connection status and live upload activity (UI present).

### EventScorer (screens/eventscorer)

- Admin dashboard listing events, live compiled scores, and update/delete flows.
- Create Scorer flow for rubric-based events.
- Rating Sheet flow for direct rating events.
- Judge scoring flow with offline queueing and autosync.
- MySQL-backed persistence with normalized schema.

## System and Flow Audits

### ShareME Upload Flow

1. UploadPanel -> useUpload sends multipart POST to /upload-chunk (direct backend origin).
2. Backend saves to uploads/ and optionally verifies hashes.
3. Backend broadcasts file update over /ws.
4. Web UI receives fileUpdate and refreshes file list.

### ShareME File Management Flow

1. FilesPanel calls /files-list to load state.
2. File actions call /delete or /delete-bulk (server-side delete, then websocket broadcast).
3. Preview and download use /files route handler proxy -> backend /files static.

### ShareME Print Flow

1. PrintPanel loads printers and print settings.
2. Print action POSTs /print-file with printer, size, color, and scale.
3. Backend uses pdf-to-printer with optional DEVMODE color fix and updates print history.

### EventScorer Admin Flow

1. Create Scorer or Rating Sheet posts to /api/events (Next route -> storage).
2. Admin page /admin/[eventId] compiles results and opens AdminLiveDashboard.
3. Real-time updates broadcast over /ws/admin-scores.

### EventScorer Judge Flow

1. Judge page /judge/[token] loads session from /api/judge/[token].
2. JudgeScoringForm posts scores to /api/judge/[token].
3. Backend broadcasts updates to admin websocket clients.

### Proxy/Backend Origin Flow

- ShareME web uses app/api and app/files route handlers to proxy to backend with fallback origins.
- Root backend proxies /api/eventscorer/\* to EventScorer Next app.

## Workspace Memory Recap (Do Not Forget)

- Deploy: deploy.ps1 now syncs updates only (no /MIR delete), and stops processes only when run on server PC; eventscorer data folder is excluded from mirror sync.
- Proxy: prefer runtime route handler proxy with origin fallback; build-time rewrites to 127.0.0.1:3007 can fail in TLS mode.
- WebSocket: on HTTP pages try ws://host:HTTP_PORT before ws://host:TLS_PORT; on HTTPS pages only use wss://.
- EventScorer: judge submissions use savedContestantIds; avoid DB pool saturation; direct rating config normalized; update-auth cookie protects editor; strand alignment and scoring rules updated.

## In-Progress or Not-Finished Work

- Unified backend server plan exists in docs/unified-backend-server-plan.md and has not been implemented (planning only).
- Prior audit hardening items are partially open (path traversal and boundary checks remain).

## Findings (Bugs, Broken Code, or Layout Risks)

### Critical

1. Upload path traversal still possible
   - server.js uses req.body.folderPath directly when joining upload paths.
   - Risk: write outside uploads/ via ../ or absolute paths.

2. Path boundary check is unsafe
   - isWithinUploadsDir uses startsWith on resolved paths; prefix-based checks can be bypassed.

### High

3. PrintPanel can trigger repeated print jobs
   - PrintPanel calls printFile during render when pendingPrint is set, which re-renders while printing and can re-trigger.

4. Update-auth cookie may fail on HTTP production
   - update-auth cookie uses secure=true when NODE_ENV=production; prod scripts run HTTP, so cookies may be dropped and update/delete flows break.

### Medium

5. Global error handler is registered before other middleware
   - The error handler appears early in server.js, so downstream errors may not be captured.

6. Event creation links may use wrong protocol behind HTTPS proxy
   - /api/events sets url.host from host header but does not honor x-forwarded-proto; links can remain http when served behind https.

7. Upload activity UI not wired
   - Backend exposes /upload-activity but the ShareME web app does not call it during uploads, so ActivityBar is usually empty.

8. Runtime config drift
   - config.json is modified at runtime for print settings and is committed in the repo, causing environment-specific changes.

### Low / Observations

- No TODO/FIXME markers found in source files.
- Tailwind lint warnings in eventscorer admin-live-dashboard (class suggestion warnings). Not runtime-breaking, but noisy in diagnostics.

## Improvements Since 2026-05-07 Audit

- Legacy public/shareme assets appear removed; React UI now renders file names safely (reduced XSS risk).
- Drag-drop folder traversal now reads all directory entries (fixes partial folder uploads).
- Upload retry and cancel flows are more consistent than the legacy script version.

## Suggested Fix Order

1. Harden upload folderPath handling and replace boundary check helper.
2. Fix PrintPanel side effect so printing triggers once per user action.
3. Adjust update-auth cookie to support HTTP production or TLS-only production.
4. Move error handler to end of middleware stack.
5. Wire upload activity client calls (or remove the feature).
6. Move runtime config to a non-committed data path with a template config.

## Test Gaps

- No automated tests found for upload path validation, delete boundaries, or update-auth flows.
- Consider adding unit tests for path normalization and a smoke test for the print and upload endpoints.
