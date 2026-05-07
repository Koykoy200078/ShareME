# Unified Backend Server Plan (Local-Network-Only)

Date: 2026-05-07  
Status: Planning document only (no backend implementation executed in this step)

## 1) Goal

Build a **unified backend server** in this repository that can serve APIs for ShareME and other future projects, while keeping deployment aligned with your policy:

- local network only
- same trusted subnet/LAN access
- no public internet exposure

## 2) Current Workspace Baseline

Based on the current workspace scan:

- Backend is currently a monolithic Express app in `server.js`.
- Existing API/routes are ShareME-specific (uploads, files list/delete, print, disk, upload activity).
- WebSocket updates are coupled to current ShareME flow.
- There are identified audit carry-over hardening items that should be addressed before opening APIs to other projects.

## 3) Recommended Architecture Strategy

## Recommendation: **Modular Monolith First**

Start with a modular monolith (single process, clear internal modules), then evolve to services only if scale/ownership requires it.

Why this is best for your current state:

- Keeps operational complexity low.
- Reuses current Node/Express stack and deployment scripts.
- Makes migration from `server.js` incremental and safer.
- Still gives clear boundaries for multiple project APIs.

## 4) Target Architecture (Logical)

- **API Entry:** `/api/v1/*`
- **Project Namespaces:**
  - `/api/v1/shareme/*`
  - `/api/v1/project-x/*`
  - `/api/v1/project-y/*`
- **Shared Platform Layer:**
  - authentication/authorization (optional for strict trusted LAN, recommended for semi-trusted LAN)
  - rate limiting
  - request validation
  - error handling and response envelope
  - logging + audit trail
  - config management
- **Transport Layer:**
  - REST for request/response APIs
  - WebSocket namespaces/channels for real-time modules

## 5) Suggested Repository Structure

```text
src/
  app.js
  server.js
  config/
    index.js
  platform/
    auth/
    middleware/
    validation/
    errors/
    logging/
    rate-limit/
  modules/
    shareme/
      routes/
      services/
      controllers/
      schemas/
      ws/
    project-template/
      routes/
      services/
      controllers/
      schemas/
  docs/
    openapi/
      unified-api.yaml
```

Keep existing Next.js frontend behavior (`screens/sharemeweb`) and `uploads/` behavior during transition, then progressively route UI calls to namespaced APIs.

## 6) API Unification Plan (Proposed Mapping)

Example migration map for current ShareME endpoints:

- `POST /upload-chunk` -> `POST /api/v1/shareme/uploads/chunk`
- `GET /files-list` -> `GET /api/v1/shareme/files`
- `DELETE /delete/:filename(*)` -> `DELETE /api/v1/shareme/files/:path`
- `POST /delete-bulk` -> `POST /api/v1/shareme/files/delete-bulk`
- `GET /disk-space` -> `GET /api/v1/shareme/storage/disk-space`
- `POST /upload-activity` -> `POST /api/v1/shareme/uploads/activity`
- `GET /print-settings` -> `GET /api/v1/shareme/print/settings`
- `POST /print-settings` -> `POST /api/v1/shareme/print/settings`
- `POST /print-file` -> `POST /api/v1/shareme/print/jobs`
- `GET /print-history` -> `GET /api/v1/shareme/print/history`

Shared cross-project endpoints to add:

- `GET /api/v1/system/health`
- `GET /api/v1/system/version`
- `GET /api/v1/system/capabilities`

## 7) Audit Carry-Over (Must Include Before Multi-Project Use)

Before onboarding other projects, prioritize these hardening fixes (already identified in audit):

1. Upload path traversal hardening (`folderPath` normalization/validation)
2. Safer path boundary checks (no unsafe prefix-only checks)
3. XSS-safe frontend rendering for file/folder metadata
4. Upload cancel/retry edge-case correctness

These are important because a unified server increases blast radius across modules.

## 8) Security Model Recommendations (Aligned to LAN Policy)

Even with LAN-only scope:

- Keep strict network boundary controls (private profile, trusted subnet only).
- Do not expose server via public reverse proxy/NAT/port forwarding.
- Add **optional** app-level auth mode:
  - Off mode for fully trusted LAN
  - PIN/API key mode for semi-trusted/shared LAN
- Add per-project API keys/scopes if other projects consume this backend.
- Add request limits to protect server from accidental overload.

## 9) Exact Recommended Topology (Dev and Production LAN)

### 9.1 Development Topology (Recommended)

Use two processes and two ports, same machine:

- `Next.js` UI: `http://<host>:3000`
- Unified Node API: `http://<host>:3001`

Client access pattern in dev:

- Browser uses `http://<host>:3000` only.
- Next.js rewrites/proxies `/api/*` to `http://127.0.0.1:3001/api/*`.
- If real-time APIs are used, proxy `/ws/*` (or chosen WS namespace) to `ws://127.0.0.1:3001/ws/*`.

Recommended dev flow:

```text
Browser (LAN/local)
   -> Next.js :3000 (UI + proxy)
      -> Node API :3001 (/api/*, /ws/*)
```

Why this is preferred for dev:

- Keeps frontend and backend independently restartable.
- Avoids CORS complexity because browser stays on one origin (`:3000`).
- Preserves clean separation before production hardening.

### 9.2 Production LAN Topology (Recommended)

For production LAN, use a single external port with a reverse proxy.

Ports:

- Edge reverse proxy: `:80` (or `:443` if LAN TLS is enabled)
- Next.js app: `127.0.0.1:3000`
- Unified Node API: `127.0.0.1:3001`

Routing rules at edge proxy:

- `/api/*` -> Node API `127.0.0.1:3001`
- `/ws/*` -> Node API `127.0.0.1:3001` (WebSocket upgrade required)
- `/*` -> Next.js `127.0.0.1:3000`

Recommended production flow:

```text
LAN Client
   -> Edge Proxy :80/:443
      -> /api/*, /ws/* -> Node API :3001
      -> /*            -> Next.js :3000
```

LAN-only controls for production:

- Allow inbound access only from trusted subnet(s).
- Keep app ports (`3000`, `3001`) non-public and local-only (`127.0.0.1`) when possible.
- Do not expose via public NAT/port-forward/reverse tunnel.

### 9.3 Same IP, Different Ports vs Same Port

- **Same IP, different ports:** direct and simple (`3000` + `3001`), best during development.
- **Same IP, same external port:** possible only with reverse proxy routing (recommended for production LAN).
- Two independent app processes cannot bind to the exact same `IP:port` without a proxy/router in front.

## 10) Data & Config Recommendations

- Keep project-specific data in dedicated module folders or data adapters.
- Move runtime mutable config away from repo-tracked root files.
- Add `.example` config templates for onboarding.
- Introduce lightweight persistence for unified server metadata:
  - API clients/keys
  - project registration
  - audit logs

## 11) Delivery Roadmap

## Phase 0 - Design Baseline (1-2 days)

- Define unified API standards (versioning, response format, error schema).
- Write architecture decision note (modular monolith approach).
- Freeze naming conventions for module routes.

## Phase 1 - Platform Foundation (3-5 days)

- Create `src/` app bootstrap and shared middleware chain.
- Add central error handler + request validation layer.
- Add health/version endpoints and structured logging.

## Phase 2 - ShareME Module Migration (4-7 days)

- Move existing ShareME routes into `modules/shareme`.
- Add compatibility layer for old routes (temporary aliasing).
- Integrate audit hardening items.

## Phase 3 - External Project Onboarding (3-5 days per project)

- Create `project-template` module scaffolding.
- Add namespace route registration and scoped config.
- Publish OpenAPI entries for each new module.

## Phase 4 - Governance & Ops (ongoing)

- Add API changelog + deprecation policy.
- Add contract/integration tests for every module.
- Add release checklist for backward compatibility.

## 12) Success Criteria

- Existing ShareME UI works unchanged or with controlled migration.
- Unified API namespace and docs are available (`/api/v1/*`).
- First external project can integrate without touching ShareME internals.
- Security baseline items from audit are closed or explicitly mitigated.

## 13) Practical Recommendations (Priority)

1. Do not jump to microservices yet.
2. Fix critical audit items before opening shared APIs.
3. Introduce API versioning from day one.
4. Keep old endpoints temporarily to avoid frontend breakage.
5. Add module template + OpenAPI spec early to standardize onboarding.

## 14) What I Did in This Request

- Updated `docs/unified-backend-server-plan.md` with exact development and production LAN topology guidance.
- Did **not** implement backend/server code changes.
