# 📁 ShareME - Local Network File Sharing

A simple and elegant Node.js application for sharing files and folders over a trusted local network. Upload entire folders with their structure preserved, download files, and manage shared content through a modern Next.js web interface.

> **Scope:** ShareME is intended for **local-network-only** usage (devices on the same trusted LAN/subnet). It is **not** designed for public internet exposure.

## ✨ Features

- **Folder Upload Support** - Upload entire folders with all files and subdirectories
- **No File Size Limits** - Upload files of any size
- **File Integrity Verification** - Automatic SHA-256 hash verification to detect corrupted files
- **Real-time Progress** - See upload speed, remaining time, and progress
- **Concurrent Uploads** - Up to 5 files uploaded in parallel for better throughput
- **Cancel Upload** - Stop ongoing uploads at any time
- **Drag & Drop Interface** - Simply drag and drop files or folders
- **Real-time File Updates** - WebSocket-based live updates for uploads/deletes
- **Local Network Access** - Share files with devices on the same trusted network
- **File Management** - View, download, and delete uploaded files
- **Direct PDF Printing (Windows)** - Send PDF files to printer from the app
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **File Preview** - Built-in modal to view PDFs, images, and videos directly

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Install backend dependencies:

```powershell
cd C:\Projects\ShareME
npm install
```

2. Install frontend dependencies:

```powershell
cd screens\sharemeweb
npm install
```

3. Configure your Environment:
   Create a `.env` file in the root directory (or use the existing one):

```env
PORT=3007
FRONTEND_PORT=3000
EVENTSCORER_PORT=3001
EVENTSCORER_DB_HOST=127.0.0.1
EVENTSCORER_DB_PORT=3306
EVENTSCORER_DB_USER=root
EVENTSCORER_DB_PASSWORD=your_password_here
EVENTSCORER_DB_NAME=shareme_eventscorer
EVENTSCORER_DB_POOL_SIZE=4
EVENTSCORER_DB_MAX_IDLE=2
EVENTSCORER_DB_IDLE_TIMEOUT_MS=15000
EVENTSCORER_DB_QUEUE_LIMIT=200
EVENTSCORER_DB_RESERVED_CONNECTIONS=5
```

4. Start the Application:

```powershell
cd C:\Projects\ShareME
npm run dev:all
```

5. Open your browser and navigate to:
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_LOCAL_IP:3000`

## EventScorer API and DB Operations

- Root Express (`server.js`) owns EventScorer API endpoints via `/api/eventscorer/*`.
- EventScorer frontend requests are rewritten to this backend namespace.

MySQL rollout commands:

```powershell
npm run eventscorer:db:migrate
```

The migrate command now applies schema changes and imports `screens/eventscorer/data/events.json` when the target database is empty.

Merge a SQL dump with upsert semantics (insert new rows, update changed rows, keep existing rows):

```powershell
npm run eventscorer:db:merge -- --source "C:\Users\Franc\Desktop\dump1.sql"
```

Merge multiple dumps in one run (older to newer order):

```powershell
npm run eventscorer:db:merge -- --source "C:\Users\Franc\Desktop\dump.sql" --source "C:\Users\Franc\Desktop\dump1.sql" --source "C:\Users\Franc\Desktop\aw.sql"
```

Audit already-registered judges and show a consolidated merge-ready directory (grouped by normalized judge name):

```powershell
npm run eventscorer:db:audit-judges
```

Auto-fix judge aliases, merge duplicate judge rows within the same event, remove redundant judge IDs, and reindex sort order values:

```powershell
npm run eventscorer:db:fix-judges
```

Apply the fixes (commit transaction):

```powershell
npm run eventscorer:db:fix-judges -- --apply
```

Export the full judge audit report as JSON:

```powershell
npm run eventscorer:db:audit-judges -- --out "scripts\reports\judge-audit.json"
```

Run schema migration and dump merge in one command:

```powershell
npm run eventscorer:db:migrate -- --merge-dump "C:\Users\Franc\Desktop\dump1.sql"
```

Optional flags for merge commands:

- `--dry-run` parses/validates without writing merged data.
- `--batch-size <number>` controls upsert batch size (default `200`).
- `--table-prefix <prefix>` limits tables (default `es_`).
- `--all-tables` merges all tables in the dump.
- `--timezone <offset>` sets DB session timezone during migration/merge (default `+08:00` for Philippines).

Rollback (requires explicit confirmation):

```powershell
npm run eventscorer:db:rollback -- --yes
```

DB pressure checks:

```powershell
npm run eventscorer:db:pressure
```

Strict mode (non-zero exit when warning/critical):

```powershell
npm run eventscorer:db:pressure:strict
```

Live endpoint for monitoring:

- `GET /api/eventscorer/health/db-pressure`
- `GET /api/eventscorer/health/db-pressure?strict=1` (returns non-200 when pressure is warning/critical)

SQL artifacts:

- `scripts/sql/eventscorer-migration.sql`
- `scripts/sql/eventscorer-rollback.sql`

## 📖 Deployment & Server Setup

To deploy this application to a dedicated server PC on your network, use the included deployment scripts:

1. **Deploy to Server**: Run `.\scripts\deploy.ps1` from your local machine. It uses fast network sync (Robocopy) to push code to your server PC while skipping heavy `node_modules`.
2. **Install on Server**: Connect to your server, navigate to the folder, and run `npm install` in both the root directory and `screens\sharemeweb`.
3. **Register Background Task**: Run `.\scripts\register-shareme-startup.ps1` on the server as Administrator. ShareME will now automatically start completely hidden in the background every time the server boots up!

_(For a full breakdown, read the `scripts\SERVER_SETUP_GUIDE.md` document)._

## 📁 Project Structure

```
ShareME/
├── server.js           # Express backend server with upload/print handling
├── scripts/            # Deployment and auto-startup PowerShell scripts
├── screens/
│   ├── sharemeweb/     # ShareME Next.js frontend (Port 3000)
│   │   ├── app/
│   │   └── public/
│   └── eventscorer/    # EventScorer Next.js frontend (Port 3001)
│       └── app/
├── uploads/            # Uploaded files storage (auto-created)
├── package.json        # Dependencies
├── .env                # Port configurations
└── README.md           # This file
```

## 🔒 Security Notes

- This application is designed for **local-network-only** use.
- Only allow access from your trusted local subnet (same network).
- **Do not expose this app to the internet** (no port forwarding, no public reverse proxy/NAT exposure).
- By default, users on the LAN can upload, download, delete files, and use print endpoints.
- If your LAN is shared/semi-trusted (guest Wi-Fi, office shared network), use firewall/subnet isolation.

## 🌐 Network Configuration

The server automatically binds to `0.0.0.0` to accept connections from any network interface.
The backend runs on port `3007`, and the Next.js frontend runs on `3000`.

Recommended LAN controls:

- Allow inbound access only on private network profiles.
- Restrict access to your trusted subnet via firewall rules.
- Avoid exposing ports `3000` and `3007` beyond your local network.

## 📦 Core Dependencies

- **express** - Backend API framework
- **next** - React frontend framework
- **ws** - WebSocket real-time updates
- **multer** - Multipart file upload handling
- **dotenv** - Environment variable loading
- **pdf-to-printer** - Windows server-side PDF printing
- **nodemon** / **turbopack** - Development auto-reload

## 📝 License

MIT License - Feel free to use and modify for your needs.

---

**Enjoy sharing files on your local network! 🚀**
