# 🚀 ShareME Server Setup & Deployment Guide

This guide explains how to deploy and manage the ShareME ecosystem (Backend + Next.js Web + EventScorer) across local development and production network environments.

---

## 🛠️ Modes of Operation

### 1. Development Mode (Local PC)
Best for testing changes. Uses **hot-reloading** (Nodemon and Next.js Dev Server).
*   **Command:** `npm run dev:all`
*   **Behavior:** Restarts automatically when you save code. Binds to `0.0.0.0` so other devices on your LAN can access it.

### 2. Production Mode (Server Machine)
Best for reliability and performance. Uses **compiled artifacts** (Next.js Build).
*   **Command:** `npm run prod:all`
*   **Behavior:** Runs optimized versions of the frontend. Built artifacts are synced via the deployment script.

---

## 📦 Phase 1: Local PC to Production Network
Run these steps on your **Personal PC** whenever you have new code ready for the server.

1.  Open PowerShell in the project root.
2.  Run the deployment script:
    ```powershell
    .\scripts\deploy.ps1
    ```
    *This script automatically builds the optimized production bundles for both frontends and syncs them to `\\192.168.2.25\Project\ShareME`.*

---

## 🖥️ Phase 2: Production Server Setup
Perform these steps once on the **Server Machine** (at `192.168.2.25`).

1.  **Navigate to the project folder:**
    ```powershell
    cd "\\192.168.2.25\Project\ShareME"
    ```
2.  **Install Production Dependencies:**
    ```powershell
    npm install --production
    ```
3.  **Start the Production Environment:**
    *   **Foreground (Console):** `npm run prod:all`
    *   **Background (Hidden):** `.\scripts\start-shareme-prod.ps1`

---

## 🔄 Phase 3: Auto-Startup & Maintenance

### Setting up Auto-Startup
To ensure the server starts automatically every time the machine boots or a user logs in:

1.  Open PowerShell **as Administrator** on the server.
2.  Run the registration script:
    ```powershell
    .\scripts\register-shareme-prod-startup.ps1
    ```
    *This creates a Windows Task Scheduler task named "ShareME Server".*

### Rescheduling / Updating Startup
If you move the project to a different folder or if you want to update the startup parameters:
*   Simply re-run the `.\scripts\register-shareme-prod-startup.ps1` script. It uses the `-Force` flag to automatically update the existing task with your new configuration.

---

## 💡 Troubleshooting & Maintenance

### Killing the Server
If you need to stop the hidden background server manually:
1.  Open **Task Manager** on the server.
2.  Go to the **Details** tab.
3.  Right-click and "End Task" on all `node.exe` processes.

### Viewing Logs
Since the server runs hidden, check these log files for errors or connection history:
*   `C:\Project\ShareME\scripts\logs\shareme-server.log`
*   `C:\Project\ShareME\scripts\logs\shareme-server-error.log`

---

*Note: Always ensure that port `3000`, `3001`, and `3007` are allowed through the Windows Firewall on the Server PC.*
