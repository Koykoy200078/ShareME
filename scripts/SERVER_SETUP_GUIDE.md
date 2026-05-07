# ShareME Server Setup & Deployment Guide

This guide covers everything from deploying the code from your development PC to getting it running silently in the background on a fresh Windows server.

## Step 1: Deploy from your Personal PC
First, open PowerShell on your **personal PC** (where you write the code) and run the deploy script. This will delete the old files on the network share and copy the fresh ones over. The script uses Robocopy to skip copying the heavy `node_modules` folders to save time.

```powershell
# Run this on your PERSONAL PC
cd C:\Projects\ShareME
.\scripts\deploy.ps1
```

---

## Step 2: Install Dependencies on the Fresh Server
Go to your **Server PC**. Since it's a fresh server or a fresh deployment, you need to install the Node.js packages for both the backend and the Next.js frontend. 

Open PowerShell on the **Server PC** and run:

```powershell
# 1. Navigate to the project folder on the server
cd C:\Project\ShareME    # (Change this if your path on the server is different)

# 2. Install backend dependencies
npm install

# 3. Install frontend (Next.js) dependencies
cd screens\sharemeweb
npm install

# 4. Go back to the root folder
cd ..\..
```

---

## Step 3: Test it Manually (Optional but Recommended)
Before setting it up to run silently in the background, it's best to test it manually to ensure there are no firewall or port issues.

```powershell
# Run this in the root folder (C:\Project\ShareME) on the Server PC
npm run dev:all
```

*Wait for it to say `ShareME Server is running!` and `Ready in XXXms`. Go to `http://localhost:3000` on the server to verify it works. Once verified, press **Ctrl+C** to stop it.*

---

## Step 4: Register the Auto-Startup Task
To make the server start completely hidden in the background every time the Server PC boots up or you log in, run the registration script.

Open PowerShell **as Administrator** on the Server PC and run:

```powershell
# Run this in the root folder
.\scripts\register-shareme-startup.ps1
```
*Output should say: `Scheduled task 'ShareME Server' registered...`*

### To start it immediately without restarting the PC:
You can manually trigger the background script for the first time by running:

```powershell
.\scripts\start-shareme.ps1
```
It will immediately return you to the prompt, but the server is now running hidden in the background!

---

## 💡 Troubleshooting & Logs
Because the server runs completely hidden, you won't see console errors. If the site ever goes down, you can check the logs the startup script generates.

Open these files in Notepad on the server:
* **Standard Logs:** `C:\Project\ShareME\scripts\logs\shareme-server.log`
* **Error Logs:** `C:\Project\ShareME\scripts\logs\shareme-server-error.log`

*(If you ever need to kill the hidden server manually, open Task Manager on the server, go to the "Details" tab, and "End Task" on all `node.exe` processes).*
