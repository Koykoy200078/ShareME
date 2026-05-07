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
```

4. Start the Application:
```powershell
cd C:\Projects\ShareME
npm run dev:all
```

5. Open your browser and navigate to:
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_LOCAL_IP:3000`

## 📖 Deployment & Server Setup

To deploy this application to a dedicated server PC on your network, use the included deployment scripts:

1. **Deploy to Server**: Run `.\scripts\deploy.ps1` from your local machine. It uses fast network sync (Robocopy) to push code to your server PC while skipping heavy `node_modules`.
2. **Install on Server**: Connect to your server, navigate to the folder, and run `npm install` in both the root directory and `screens\sharemeweb`.
3. **Register Background Task**: Run `.\scripts\register-shareme-startup.ps1` on the server as Administrator. ShareME will now automatically start completely hidden in the background every time the server boots up!

*(For a full breakdown, read the `scripts\SERVER_SETUP_GUIDE.md` document).*

## 📁 Project Structure

```
ShareME/
├── server.js           # Express backend server with upload/print handling
├── scripts/            # Deployment and auto-startup PowerShell scripts
├── screens/
│   └── sharemeweb/     # Modern Next.js 16 frontend app
│       ├── app/        # UI routes, components, contexts, and hooks
│       └── public/     # Static assets
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
