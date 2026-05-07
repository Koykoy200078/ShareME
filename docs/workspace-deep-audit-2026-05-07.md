# ShareME Workspace Deep Audit Report

Date: 2026-05-07  
Scope: full workspace audit (`server.js`, `screens/sharemeweb/public/shareme/*`, `scripts/*`, configs/docs; excluding `node_modules`)
Intended deployment model: **local-network-only** (PCs on the same trusted network/subnet)

## Executive Summary

The project is clean and understandable. Under the intended local-network-only model, the main risks are local misuse, integrity bugs, and reliability defects (not public internet exposure).

- Total findings: **12**
  - Critical: **3**
  - High: **3**
  - Medium: **4**
  - Low: **2**
- Most urgent risks:
  1. Path traversal / arbitrary file write risk in upload handling.
  2. Path boundary check can be bypassed in delete/print flows.
  3. Stored XSS risk from unsanitized file metadata in frontend HTML.

## Audit Method

- Static code review of backend, frontend, and deployment scripts.
- Endpoint and trust-boundary tracing for upload, delete, print, and websocket flows.
- Logic review for concurrency/cancel/retry behavior in uploader.
- Syntax validation:
  - `node --check server.js` (pass)
  - `node --check screens/sharemeweb/public/shareme/script.js` (pass)

## Architecture Snapshot

- Backend: monolithic Express server in `server.js`.
- Frontend: Next.js app (`screens/sharemeweb/app/*`) that loads legacy UI assets from `screens/sharemeweb/public/shareme/*`.
- Transport: REST + WebSocket (`ws`) for live updates.
- Storage: local filesystem (`uploads/`) + runtime JSON config (`config.json`).
- Ops scripts: PowerShell startup/deploy scripts in `scripts/`.

## Local Network Policy (Updated)

- Intended access: only PCs/devices on the same trusted local network.
- Internet exposure is out of scope and should be blocked (no port forwarding/public NAT exposure).
- Enforce with host/network controls: private-network firewall rules and allowed subnet restrictions.
- If the LAN includes guest/untrusted devices, enable application-level auth (PIN/token) for sensitive actions.

## Findings

### Critical

1. **Upload path traversal allows write outside uploads root**
   - Evidence: `server.js:66`, `server.js:67`, `server.js:69`, `server.js:71`
   - `folderPath` is taken directly from request body and joined into filesystem path.
   - Impact: malicious clients can attempt `..`/absolute path payloads to write files outside `uploads/`.
   - Fix:
     - Normalize and validate path segments.
     - Reject absolute paths, `..`, drive letters, and mixed separators.
     - Resolve final path and enforce root boundary before `mkdir` and save.

2. **Path boundary guard can be bypassed with prefix match**
   - Evidence: `server.js:405`, `server.js:406`
   - `startsWith(path.resolve(uploadsDir))` is unsafe as a boundary check (`...\uploads2` can pass).
   - Affects delete/print guards where this helper is reused (`server.js:312`, `server.js:345`, `server.js:448`).
   - Impact: file operations may target unintended paths.
   - Fix:
     - Use `path.relative(root, target)` and ensure it does not start with `..` and is not absolute.
     - Add canonical trailing separator checks when needed.

3. **Stored XSS risk from unsanitized file/folder metadata in HTML**
   - Evidence: `screens/sharemeweb/public/shareme/script.js:763`, `screens/sharemeweb/public/shareme/script.js:816`, `screens/sharemeweb/public/shareme/script.js:825`, `screens/sharemeweb/public/shareme/script.js:826`, `screens/sharemeweb/public/shareme/script.js:827`, `screens/sharemeweb/public/shareme/script.js:828`
   - Untrusted values (`file.name`, `file.path`, folder names) are injected into `innerHTML` and inline `onclick` handlers.
   - Impact: uploaded crafted filenames can execute script in other clients' browsers.
   - Fix:
     - Stop using inline `onclick` templating with user-controlled strings.
     - Render with DOM APIs (`textContent`, `setAttribute`, `addEventListener`).
     - Escape any text that must be inserted as HTML.

### High

4. **Cancel flow can deadlock upload UI**
   - Evidence: `screens/sharemeweb/public/shareme/script.js:421`, `screens/sharemeweb/public/shareme/script.js:422`, `screens/sharemeweb/public/shareme/script.js:439`, `screens/sharemeweb/public/shareme/script.js:499`, `screens/sharemeweb/public/shareme/script.js:500`
   - When cancellation happens before all files are queued, `finishUpload()` may never execute (`currentIndex >= totalFiles` is not reached).
   - Impact: progress UI may remain stuck and upload button may stay disabled.
   - Fix:
     - Add explicit cancel-complete state path that always resets UI once active uploads drop to zero.

5. **Drag-drop directory traversal can miss files silently**
   - Evidence: `screens/sharemeweb/public/shareme/script.js:102`, `screens/sharemeweb/public/shareme/script.js:103`, `screens/sharemeweb/public/shareme/script.js:107`
   - `FileSystemDirectoryReader.readEntries()` is called only once; API requires repeated calls until empty.
   - Impact: large directories can upload partially without clear warning.
   - Fix:
     - Loop `readEntries` until zero-length result; aggregate entries before recursion.

6. **Retry logic inflates failure counters and bytes**
   - Evidence: `screens/sharemeweb/public/shareme/script.js:344`, `screens/sharemeweb/public/shareme/script.js:345`, `screens/sharemeweb/public/shareme/script.js:349`, `screens/sharemeweb/public/shareme/script.js:352`
   - Failure counters are incremented before retrying 5xx responses.
   - Impact: final report can show false failures and incorrect uploaded byte totals.
   - Fix:
     - Increment fail metrics only on terminal failure after retries are exhausted.

### Medium

7. **No application authentication on destructive/printer endpoints (LAN-context dependent)**
   - Evidence: `server.js:307`, `server.js:333`, `server.js:431`, `server.js:442`
   - Any host on the same network can delete files, alter printer settings, and trigger printing.
   - Impact: acceptable only on fully trusted LANs; risky on shared/guest corporate/home networks.
   - Fix:
     - Keep as-is only if LAN trust is strict and enforced by firewall/subnet isolation.
     - Otherwise add optional PIN/shared-secret middleware for sensitive routes.

8. **Unbounded request limits increase DoS risk**
   - Evidence: `server.js:81`, `server.js:82`, `server.js:83`, `server.js:96`
   - Infinite multer limits + very large URL-encoded body limit create resource exhaustion risk.
   - Fix:
     - Set practical caps per file, request size, and request rate.

9. **Upload activity feature is partially implemented but not wired**
   - Evidence: `screens/sharemeweb/public/shareme/script.js:1201` (function defined), no call sites found; backend endpoint exists at `server.js:381`.
   - Impact: live upload activity panel likely remains empty or stale.
   - Fix:
     - Call `reportUploadActivity('start'|'progress'|'end')` from uploader lifecycle.

10. **Runtime config is committed and mutable in repo**
    - Evidence: `config.json:1`, `config.json:2`, `server.js:48`
    - Runtime printer state is written to tracked file, causing environment-specific drift.
    - Fix:
      - Move runtime config to ignored data path (example: `data/config.json`).
      - Commit `config.example.json` instead.

### Low

11. **Unused/dead deployment script variables**
    - Evidence: `scripts/deploy.ps1:3` (`$Force`), `scripts/deploy.ps1:40` (`$backupPath`)
    - Impact: maintenance noise and unclear deployment behavior.
    - Fix:
      - Implement or remove unused flags/vars.

12. **README behavior mismatch with current implementation**
    - Evidence: `README.md:11` says "Sequential Upload" but `screens/sharemeweb/public/shareme/script.js:186` uses concurrent uploads.
    - Impact: documentation trust gap.
    - Fix:
      - Update README to match current concurrency behavior.

## Improvement Recommendations

### Immediate (0-2 days)

1. Harden upload path handling and replace boundary check helper.
2. Remove inline HTML event injection points and sanitize rendering.
3. Fix cancel deadlock + retry accounting issues in uploader.
4. Enforce LAN-only boundary in deployment (firewall rules + interface/subnet restrictions).

### Short-Term (this week)

1. Add optional PIN/shared-secret middleware for delete/print/settings routes (required for semi-trusted LANs).
2. Add request-size/rate limits and safer defaults.
3. Add unit-level tests for path validation and uploader state transitions.
4. Add a deployment checklist: private network profile, no public exposure, no port forwarding.

### Mid-Term (2-4 weeks)

1. Split `server.js` into modules (`routes/`, `services/`, `security/`).
2. Add observability (structured logs, request IDs, error telemetry).
3. Add CI checks (lint + smoke tests).

## Feature Recommendations

1. **Resumable uploads** (pause/resume and crash recovery; tus or chunk session IDs).
2. **Optional access control modes** (PIN or roles for shared/semi-trusted LANs).
3. **Share links with expiry** for safer temporary access.
4. **Bulk download as zip** for selected files/folders.
5. **Duplicate detection by hash** with optional skip/overwrite policy.
6. **Upload policy rules** (allowed extensions, max size per user/session).

## Double-Check Matrix

- Backend syntax: checked.
- Frontend syntax: checked.
- Route surface area: mapped.
- Critical trust boundaries (file paths, UI rendering): reviewed.
- Threat model alignment: updated for local-network-only deployment.
- Test suite: none found (recommend adding targeted tests for critical paths).

## Suggested Priority Fix Order

1. Path traversal + boundary check vulnerabilities.
2. XSS-safe rendering refactor.
3. Upload cancellation/retry correctness.
4. Enforce LAN boundary controls; add optional auth for semi-trusted LANs.
5. Limits/rate controls + tests.
