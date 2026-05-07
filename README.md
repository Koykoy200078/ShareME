# 📁 ShareME - Local Network File Sharing

A simple and elegant Node.js application for sharing files and folders over a trusted local network. Upload entire folders with their structure preserved, download files, and manage shared content through a web interface.

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
- **File Preview** - Icons for different file types

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Install backend dependencies:

```powershell
cd d:\Projects\ShareME
npm install
```

2. Install frontend dependencies:

```powershell
cd d:\Projects\ShareME\screens\sharemeweb
npm install
```

3. Start the backend API server (recommended on port 3001):

```powershell
cd d:\Projects\ShareME
$env:PORT="3001"
npm run dev
```

4. Start the Next.js frontend:

```powershell
cd d:\Projects\ShareME\screens\sharemeweb
npm run dev
```

5. Open your browser and navigate to:
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_LOCAL_IP:3000`

6. Share the network URL only with users/devices on your same trusted LAN.

## 📖 Usage

### For the Server Host

1. Run backend (`PORT=3001`) from repo root and frontend (`next dev`) from `screens/sharemeweb`
2. Use the frontend URL (e.g., `http://192.168.1.100:3000`) as the shared LAN entrypoint
3. Keep backend API port internal to trusted LAN hosts only

### For Clients (Users Uploading Files)

1. Open the network URL in your browser
2. Choose to upload either:
   - **Select Files** - Upload individual files
   - **Select Folder** - Upload an entire folder with its structure
   - **Drag & Drop** - Drag files or folders directly to the upload area
3. Click "Upload All Files" to start the upload
4. View all shared files in the "Shared Files" section

### File Operations

- **Download** - Click the download button on any file card
- **Delete** - Remove files you no longer need
- **Refresh** - Update the file list to see new uploads

## 🛠️ Development

To run backend + frontend together with one command:

```powershell
cd d:\Projects\ShareME
npm run dev:all
```

To run only the backend server with auto-reload:

```powershell
npm run dev
```

## 📁 Project Structure

```
ShareME/
├── server.js           # Express server with upload handling
├── screens/
│   └── sharemeweb/     # Next.js frontend app
│       ├── app/        # UI route/components
│       └── public/
│           └── shareme/
│               ├── styles.css  # Legacy styles used by Next page
│               └── script.js   # Legacy behavior script used by Next page
├── uploads/           # Uploaded files storage (auto-created)
├── package.json       # Dependencies
└── README.md          # This file
```

## 🔒 Security Notes

- This application is designed for **local-network-only** use.
- Only allow access from your trusted local subnet (same network).
- **Do not expose this app to the internet** (no port forwarding, no public reverse proxy/NAT exposure).
- By default, users on the LAN can upload, download, and delete files, and use print endpoints.
- If your LAN is shared/semi-trusted (guest Wi-Fi, office shared network), use firewall/subnet isolation and add app-level auth (PIN/token) for sensitive actions.

## 🧪 Audit Alignment (2026-05-07)

Latest audit report: `docs/workspace-deep-audit-2026-05-07.md`

The following hardening items are identified by audit and are not fully implemented yet:

- Path traversal hardening for upload destination (`folderPath` validation and normalization).
- Safer path boundary checks for delete/print file operations.
- XSS-safe frontend rendering for file/folder names and paths.
- Upload cancel/retry flow accuracy fixes (UI deadlock and retry accounting edge cases).

## 🌐 Network Configuration

The server automatically:

- Binds to `0.0.0.0` to accept connections from any network interface
- Displays your local IP address for easy sharing
- Should run on port `3001` when paired with Next.js dev server on `3000`

Recommended LAN controls:

- Allow inbound access only on private network profile.
- Restrict access to your trusted subnet via firewall rules.
- Avoid exposing ports `3000` and `3001` beyond your local network.

To find your network URL:

- The server displays it on startup
- Or check your IP with: `ipconfig` (Windows) / `ifconfig` (Mac/Linux)

## 📦 Dependencies

- **express** - Web server framework
- **ws** - WebSocket real-time updates
- **multer** - File upload handling
- **compression** - Response compression
- **dotenv** - Environment variable loading
- **pdf-to-printer** - Windows server-side PDF printing
- **nodemon** - Development auto-reload (dev dependency)

## 🎨 Features in Detail

### Folder Structure Preservation

When you upload a folder, the complete directory structure is maintained on the server, making it easy to share organized content.

### Drag and Drop

Simply drag folders or files from your file explorer directly into the browser window.

### Visual Feedback

- Upload progress bar
- Success/error notifications
- File type icons
- File size and upload time display

## 🔧 Configuration

You can modify the following in `server.js`:

- `PORT` - Change the server port (default: 3000)
- `uploadsDir` - Change the upload directory location

## 📝 License

MIT License - Feel free to use and modify for your needs.

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## 💡 Tips

- Make sure all devices are on the same network
- Check firewall settings if clients can't connect
- The uploads folder will be created automatically
- File paths use forward slashes for cross-platform compatibility

---

**Enjoy sharing files on your local network! 🚀**
