# 📁 ShareME - Local Network File Sharing

A simple and elegant Node.js application for sharing files and folders over your local network. Upload entire folders with their structure preserved, download files, and manage shared content through a beautiful web interface.

## ✨ Features

- **Folder Upload Support** - Upload entire folders with all files and subdirectories
- **No File Size Limits** - Upload files of any size
- **File Integrity Verification** - Automatic SHA-256 hash verification to detect corrupted files
- **Real-time Progress** - See upload speed, remaining time, and progress
- **Sequential Upload** - Files uploaded one at a time to keep browser responsive
- **Cancel Upload** - Stop ongoing uploads at any time
- **Drag & Drop Interface** - Simply drag and drop files or folders
- **Local Network Access** - Share files with anyone on your network
- **File Management** - View, download, and delete uploaded files
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **File Preview** - Icons for different file types

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Navigate to the project directory:

```powershell
cd d:\Projects\ShareME
```

2. Install dependencies:

```powershell
npm install
```

3. Start the server:

```powershell
npm start
```

4. Open your browser and navigate to:
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_LOCAL_IP:3000` (shown in terminal)

## 📖 Usage

### For the Server Host

1. Run `npm start` in the project directory
2. Note the network URL displayed in the terminal (e.g., `http://192.168.1.100:3000`)
3. Share this URL with others on your local network

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

To run the server with auto-reload during development:

```powershell
npm run dev
```

## 📁 Project Structure

```
ShareME/
├── server.js           # Express server with upload handling
├── public/             # Client-side files
│   ├── index.html     # Main UI
│   ├── styles.css     # Styling
│   └── script.js      # Client-side logic
├── uploads/           # Uploaded files storage (auto-created)
├── package.json       # Dependencies
└── README.md          # This file
```

## 🔒 Security Notes

- This application is designed for **local network use only**
- Do not expose to the internet without proper security measures
- All users on the network can upload, download, and delete files
- Consider implementing authentication for production use

## 🌐 Network Configuration

The server automatically:

- Binds to `0.0.0.0` to accept connections from any network interface
- Displays your local IP address for easy sharing
- Runs on port 3000 (can be modified in `server.js`)

To find your network URL:

- The server displays it on startup
- Or check your IP with: `ipconfig` (Windows) / `ifconfig` (Mac/Linux)

## 📦 Dependencies

- **express** - Web server framework
- **multer** - File upload handling
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
