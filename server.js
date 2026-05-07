const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const compression = require('compression');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const pdf2printer = require('pdf-to-printer');

// Load environment variables from .env if present
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MIN_FREE_BYTES = (parseInt(process.env.MIN_FREE_MB, 10) || 100) * 1024 * 1024;

// WebSocket clients storage with metadata
let wsClients = new Map(); // Map<WebSocket, { isAlive: boolean, clientIP: string }>
let activeUploaders = new Map(); // Map<clientId, { filename, progress, startTime }>

// ============================================
// Persistent Config (config.json)
// ============================================
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Print settings — loaded from config.json on startup
let printSettings = { printer: '' };

// Print history (in-memory, capped at MAX_PRINT_HISTORY entries)
const MAX_PRINT_HISTORY = 50;
let printHistory = [];

function loadConfig() {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
			if (typeof data.printer === 'string') printSettings.printer = data.printer;
		}
	} catch (e) {
		console.error('Failed to load config:', e.message);
	}
}

function saveConfig() {
	try {
		fs.writeFileSync(CONFIG_FILE, JSON.stringify({ printer: printSettings.printer }, null, 2));
	} catch (e) {
		console.error('Failed to save config:', e.message);
	}
}

// Load persisted settings on startup
loadConfig();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		const folderPath = req.body?.folderPath || '';
		const fullPath = path.join(uploadsDir, folderPath);
		if (!fs.existsSync(fullPath)) {
			fs.mkdirSync(fullPath, { recursive: true });
		}
		cb(null, fullPath);
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	},
});

const upload = multer({
	storage: storage,
	limits: {
		fileSize: Infinity, // No file size limit
		files: Infinity, // No file count limit
		fieldSize: Infinity,
		parts: Infinity,
		fieldNameSize: Infinity,
		headerPairs: Infinity,
	},
});

// ============================================
// CORS — allow the Next.js frontend (:3000) to POST directly to :3007
// for multipart uploads (Next.js proxy buffers multipart which breaks multer)
// ============================================
app.use((req, res, next) => {
	const origin = req.headers.origin || '';
	// Allow same LAN origin (any port on the same hostname)
	res.setHeader('Access-Control-Allow-Origin', origin || '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
	if (req.method === 'OPTIONS') return res.sendStatus(204);
	next();
});

// Enable gzip compression for faster responses
app.use(compression());

// Parse request bodies for API routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50gb', extended: true }));

// Increase timeout for large uploads (5 hours)
app.use((req, res, next) => {
	req.setTimeout(18000000); // 5 hours
	res.setTimeout(18000000); // 5 hours
	next();
});

// Serve uploaded files for download
app.use('/files', express.static(uploadsDir));

// Get local IP address
function getLocalIPAddress() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address;
			}
		}
	}
	return 'localhost';
}

// ============================================
// Disk Space Check
// ============================================

// Get free and total bytes on the drive that hosts the uploads directory
async function getDiskSpace() {
	return new Promise((resolve) => {
		const drive = path.parse(uploadsDir).root.slice(0, 1); // e.g. 'C'
		exec(
			`powershell -NoProfile -Command "[System.IO.DriveInfo]::new('${drive}') | Select-Object AvailableFreeSpace,TotalSize | ConvertTo-Json"`,
			(err, stdout) => {
				if (err) return resolve({ free: null, total: null });
				try {
					const d = JSON.parse(stdout.trim());
					resolve({ free: d.AvailableFreeSpace, total: d.TotalSize });
				} catch {
					resolve({ free: null, total: null });
				}
			},
		);
	});
}

// Middleware: reject upload if drive has less than MIN_FREE_BYTES free
async function checkDiskSpace(req, res, next) {
	try {
		const { free } = await getDiskSpace();
		if (free !== null && free < MIN_FREE_BYTES) {
			return res.status(507).json({ error: `Insufficient storage: only ${formatBytes(free)} free on server` });
		}
	} catch (_) { /* allow upload if check fails */ }
	next();
}

// Chunked upload endpoint - handles up to 5 files at a time with verification
app.post('/upload-chunk', checkDiskSpace, (req, res) => {
	upload.array('files', 5)(req, res, async (err) => {
		if (err) {
			console.error('Upload error:', err);
			return res.status(500).json({ error: 'Upload failed: ' + err.message });
		}

		try {
			if (!req.files || req.files.length === 0) {
				return res.status(400).json({ error: 'No files uploaded' });
			}

			const clientHashes = JSON.parse(req.body.hashes || '[]');
			const results = [];
			const skipVerification = clientHashes.length === 0;

			// Process each file
			for (let i = 0; i < req.files.length; i++) {
				const file = req.files[i];

				try {
					let fileHash = null;
					let isCorrupted = false;

					// Only verify hash if client provided hashes
					if (!skipVerification && clientHashes[i]) {
						fileHash = await calculateFileHash(file.path);
						const clientHash = clientHashes[i];

						// Verify file integrity
						if (fileHash !== clientHash) {
							fs.unlinkSync(file.path); // Delete corrupted file
							isCorrupted = true;
						}
					}

					if (isCorrupted) {
						results.push({
							filename: file.originalname,
							success: false,
							corrupted: true,
							error: 'File corrupted during upload',
						});
						console.log(`✗ Corrupted: ${file.originalname}`);
					} else {
						results.push({
							filename: file.originalname,
							path: file.path.replace(uploadsDir, '').replace(/\\/g, '/'),
							size: file.size,
							hash: fileHash,
							success: true,
						});
						console.log(`✓ Uploaded: ${file.originalname} (${formatBytes(file.size)})${skipVerification ? ' [No verification]' : ''}`);
					}
				} catch (error) {
					console.error(`Error processing ${file.originalname}:`, error);
					results.push({
						filename: file.originalname,
						success: false,
						error: error.message,
					});
				}
			}

			const successCount = results.filter((r) => r.success).length;
			res.json({
				success: successCount > 0,
				message: `${successCount}/${req.files.length} file(s) uploaded successfully`,
				results: results,
			});

			// Broadcast file update to all WebSocket clients
			if (successCount > 0) {
				broadcastFileUpdate(
					'upload',
					results.filter((r) => r.success),
				);

			}
		} catch (error) {
			console.error('Upload processing error:', error);
			res.status(500).json({ error: 'Upload failed: ' + error.message });
		}
	});
});

// Calculate file hash for integrity verification
async function calculateFileHash(filePath) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);

		stream.on('data', (data) => hash.update(data));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', reject);
	});
}

// Helper function to format bytes
function formatBytes(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Upload status endpoint - for checking progress
app.get('/upload-status', (req, res) => {
	res.json({ status: 'ready' });
});

// Disk space endpoint — used by the client storage gauge
app.get('/disk-space', async (req, res) => {
	const space = await getDiskSpace();
	res.json(space);
});

// List all files
app.get('/files-list', async (req, res) => {
	try {
		const files = await getAllFiles(uploadsDir);
		res.json({ files });
	} catch (error) {
		console.error('Error listing files:', error);
		res.status(500).json({ error: 'Failed to list files' });
	}
});

// Recursive function to get all files (async to avoid blocking the event loop)
async function getAllFiles(dirPath, arrayOfFiles = [], baseDir = uploadsDir) {
	const files = await fs.promises.readdir(dirPath);
	for (const file of files) {
		const fullPath = path.join(dirPath, file);
		const stats = await fs.promises.stat(fullPath);
		if (stats.isDirectory()) {
			arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles, baseDir);
		} else {
			const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/');
			arrayOfFiles.push({
				name: file,
				path: relativePath,
				size: stats.size,
				uploadedAt: stats.mtime,
			});
		}
	}
	return arrayOfFiles;
}

// Delete file endpoint
app.delete('/delete/:filename(*)', (req, res) => {
	try {
		const filename = req.params.filename;
		const filePath = path.join(uploadsDir, filename);

		if (!isWithinUploadsDir(filePath)) {
			return res.status(403).json({ error: 'Access denied' });
		}

		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
			console.log(`Deleted file: ${filename}`);
			res.json({ success: true, message: 'File deleted successfully' });

			// Broadcast delete event to all WebSocket clients
			broadcastFileUpdate('delete', [{ path: '/' + filename }]);
		} else {
			res.status(404).json({ error: 'File not found' });
		}
	} catch (error) {
		console.error('Delete error:', error);
		res.status(500).json({ error: 'Failed to delete file' });
	}
});

// Bulk delete endpoint
app.post('/delete-bulk', express.json(), (req, res) => {
	try {
		const { files } = req.body;
		if (!files || !Array.isArray(files) || files.length === 0) {
			return res.status(400).json({ error: 'No files specified' });
		}

		const results = { deleted: [], failed: [] };

		files.forEach((filePath) => {
			try {
				const fullPath = path.join(uploadsDir, filePath);
				if (!isWithinUploadsDir(fullPath)) {
					results.failed.push({ path: filePath, error: 'Access denied' });
					return;
				}
				if (fs.existsSync(fullPath)) {
					fs.unlinkSync(fullPath);
					results.deleted.push(filePath);
					console.log(`Deleted: ${filePath}`);
				} else {
					results.failed.push({ path: filePath, error: 'Not found' });
				}
			} catch (err) {
				results.failed.push({ path: filePath, error: err.message });
			}
		});

		// Broadcast delete event
		if (results.deleted.length > 0) {
			broadcastFileUpdate(
				'delete',
				results.deleted.map((p) => ({ path: '/' + p })),
			);
		}

		res.json({
			success: results.deleted.length > 0,
			message: `Deleted ${results.deleted.length}/${files.length} files`,
			results,
		});
	} catch (error) {
		console.error('Bulk delete error:', error);
		res.status(500).json({ error: 'Bulk delete failed: ' + error.message });
	}
});

// Upload activity endpoint for broadcasting progress
app.post('/upload-activity', express.json(), (req, res) => {
	const { clientId, action, filename, progress } = req.body;

	if (action === 'start') {
		activeUploaders.set(clientId, { filename, progress: 0, startTime: Date.now() });
	} else if (action === 'progress') {
		if (activeUploaders.has(clientId)) {
			activeUploaders.get(clientId).progress = progress;
			activeUploaders.get(clientId).filename = filename;
		}
	} else if (action === 'end') {
		activeUploaders.delete(clientId);
	}

	// Broadcast upload activity to all clients
	broadcastUploadActivity();
	res.json({ success: true });
});

// ============================================
// Print Settings Endpoints
// ============================================

// Validate that a resolved path is within uploadsDir (path traversal guard)
function isWithinUploadsDir(filePath) {
	return path.resolve(filePath).startsWith(path.resolve(uploadsDir));
}

// Get available printers
app.get('/printers', (req, res) => {
	exec('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json"', (error, stdout) => {
		if (error) {
			console.error('Failed to get printers:', error.message);
			return res.json({ printers: [] });
		}
		try {
			let printers = JSON.parse(stdout.trim());
			if (!Array.isArray(printers)) printers = [printers];
			res.json({ printers });
		} catch {
			res.json({ printers: [] });
		}
	});
});

// Get / update print settings
app.get('/print-settings', (req, res) => {
	res.json(printSettings);
});

app.post('/print-settings', express.json(), (req, res) => {
	const { printer } = req.body;
	if (typeof printer === 'string') {
		printSettings.printer = printer;
		saveConfig();
	}
	console.log(`Print settings updated: printer="${printSettings.printer || 'default'}"`);
	res.json({ success: true, settings: printSettings });
});

// Print a specific file on demand
app.post('/print-file', express.json(), (req, res) => {
	const { filePath: relPath, printer, copies, paperSize, colorMode, scale } = req.body;
	if (!relPath) return res.status(400).json({ error: 'filePath required' });

	const fullPath = path.join(uploadsDir, relPath.startsWith('/') ? relPath.slice(1) : relPath);

	if (!isWithinUploadsDir(fullPath)) {
		return res.status(403).json({ error: 'Access denied' });
	}
	if (!fs.existsSync(fullPath)) {
		return res.status(404).json({ error: 'File not found' });
	}

	// Whitelist allowed paper sizes to prevent arbitrary value injection
	const ALLOWED_PAPER_SIZES = [
		// ISO A
		'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
		// ISO B
		'B4', 'B5', 'B6',
		// US
		'Letter', 'Legal', 'Tabloid', 'Executive', 'Statement', 'Folio',
	];
	const safePaperSize = ALLOWED_PAPER_SIZES.includes(paperSize) ? paperSize : '';
	const safeColorMode = colorMode === 'bw' ? 'bw' : 'color';
	const ALLOWED_SCALES = ['fit', 'noscale', 'shrink'];
	const safeScale = ALLOWED_SCALES.includes(scale) ? scale : 'fit';

	const targetPrinter = printer || printSettings.printer || '';
	const numCopies = Math.min(Math.max(parseInt(copies, 10) || 1, 1), 99);
	printFileOnServer(fullPath, targetPrinter, numCopies, safePaperSize, safeColorMode, safeScale)
		.then(() => res.json({ success: true, message: `Print job sent (${numCopies} cop${numCopies === 1 ? 'y' : 'ies'}${safePaperSize ? ', ' + safePaperSize : ''}, ${safeColorMode === 'bw' ? 'B&W' : 'Color'}, ${safeScale})` }))
		.catch((err) => {
			console.error('Print error:', err.message);
			res.status(500).json({ error: 'Print failed: ' + err.message });
		});
});

// Get print history (last MAX_PRINT_HISTORY jobs)
app.get('/print-history', (req, res) => {
	res.json({ history: printHistory });
});

// ============================================
// Printer Color Mode (Windows DEVMODE level)
// ============================================

/**
 * Gets whether color is enabled for a named printer via PowerShell.
 * Returns true (color), false (monochrome), or null (unknown/error).
 */
function getPrinterColorEnabled(printerName) {
	return new Promise((resolve) => {
		const safe = printerName.replace(/'/g, "''");
		exec(
			`powershell -NoProfile -Command "(Get-PrintConfiguration -PrinterName '${safe}' -ErrorAction SilentlyContinue).Color"`,
			(err, stdout) => {
				if (err || !stdout.trim()) return resolve(null);
				const v = stdout.trim().toLowerCase();
				resolve(v === 'true' ? true : v === 'false' ? false : null);
			}
		);
	});
}

/**
 * Sets color-enabled state for a named printer via PowerShell (DEVMODE level).
 * Non-fatal: errors are only warned, never thrown.
 */
function setPrinterColorEnabled(printerName, enabled) {
	return new Promise((resolve) => {
		const safe = printerName.replace(/'/g, "''");
		const val = enabled ? '$true' : '$false';
		exec(
			`powershell -NoProfile -Command "Set-PrintConfiguration -PrinterName '${safe}' -Color ${val} -ErrorAction SilentlyContinue"`,
			(err) => {
				if (err) console.warn(`Could not set printer color mode: ${err.message}`);
				resolve();
			}
		);
	});
}

// Print helper — uses pdf-to-printer (bundles SumatraPDF) for reliable Windows printing
async function printFileOnServer(fullPath, printerName, copies = 1, paperSize = '', colorMode = 'color', scale = 'fit') {
	const options = {};
	if (printerName) options.printer = printerName;
	if (paperSize) options.paperSize = paperSize;
	// SumatraPDF rendering-level: converts page content to grayscale before spooling
	options.monochrome = colorMode === 'bw';
	// scale: sent directly to SumatraPDF -print-settings (fit/noscale/shrink)
	options.scale = scale;
	// Use native copies so SumatraPDF sends a single collated job instead of N separate jobs
	options.copies = copies;

	// Also enforce at the Windows printer driver (DEVMODE) level.
	// SumatraPDF's monochrome only converts rendering — it doesn't change dmColor in DEVMODE,
	// so inkjet drivers can still mix CMY inks for "gray". Set-PrintConfiguration fixes that.
	//
	// IMPORTANT: when printerName is '' (system default), we must resolve the real printer
	// name first — otherwise the DEVMODE fix is silently skipped.
	const wantColor = colorMode !== 'bw';
	let priorColorMode = null; // null = we did not change it, nothing to restore

	let effectivePrinterName = printerName || null;
	if (!effectivePrinterName) {
		try {
			const def = await pdf2printer.getDefaultPrinter();
			effectivePrinterName = def ? def.name : null;
		} catch (_) {
			effectivePrinterName = null;
		}
	}

	if (effectivePrinterName) {
		const current = await getPrinterColorEnabled(effectivePrinterName);
		if (current !== null && current !== wantColor) {
			await setPrinterColorEnabled(effectivePrinterName, wantColor);
			priorColorMode = current; // remember so we can restore
		}
	}

	console.log(`Printing: ${path.basename(fullPath)} → ${printerName || 'default'} ×${copies}${paperSize ? ' [' + paperSize + ']' : ''} [${colorMode === 'bw' ? 'B&W' : 'Color'}] [scale:${scale}]`);
	const entry = { file: path.basename(fullPath), printer: printerName || 'default', copies, paperSize: paperSize || 'default', colorMode, scale, timestamp: Date.now() };
	try {
		await pdf2printer.print(fullPath, options);
		printHistory.unshift({ ...entry, success: true });
	} catch (err) {
		printHistory.unshift({ ...entry, success: false, error: err.message });
		throw err;
	} finally {
		if (printHistory.length > MAX_PRINT_HISTORY) printHistory.length = MAX_PRINT_HISTORY;
		// Restore the printer's original color mode (DEVMODE) after the job is spooled
		if (priorColorMode !== null && effectivePrinterName) {
			await setPrinterColorEnabled(effectivePrinterName, priorColorMode);
		}
	}
}

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
	const localIP = getLocalIPAddress();
	console.log('\n=================================');
	console.log('ShareME Server is running!');
	console.log('=================================');
	console.log(`Local access:    http://localhost:${PORT}`);
	console.log(`Network access:  http://${localIP}:${PORT}`);
	console.log('=================================\n');
	console.log('Share the network URL with others on your local network to allow file uploads.');
});

// Configure server timeouts for large file uploads
server.keepAliveTimeout = 18000000; // 5 hours
server.headersTimeout = 18000000; // 5 hours
server.requestTimeout = 18000000; // 5 hours
server.timeout = 18000000; // 5 hours

// WebSocket Server for real-time updates
const wss = new WebSocketServer({ server });

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

wss.on('connection', (ws, req) => {
	const clientIP = req.socket.remoteAddress;
	console.log(`WebSocket client connected: ${clientIP}`);

	// Store client with metadata
	wsClients.set(ws, { isAlive: true, clientIP });

	// Send initial connection confirmation
	ws.send(
		JSON.stringify({
			type: 'connected',
			message: 'Real-time updates enabled',
			activeUploaders: Array.from(activeUploaders.entries()).map(([id, data]) => ({ clientId: id, ...data })),
		}),
	);

	// Handle pong responses (heartbeat)
	ws.on('pong', () => {
		const clientData = wsClients.get(ws);
		if (clientData) clientData.isAlive = true;
	});

	ws.on('close', () => {
		console.log(`WebSocket client disconnected: ${clientIP}`);
		wsClients.delete(ws);
	});

	ws.on('error', (error) => {
		console.error('WebSocket error:', error);
		wsClients.delete(ws);
	});
});

// Heartbeat - ping all clients every 30 seconds to detect dead connections
const heartbeatInterval = setInterval(() => {
	wsClients.forEach((clientData, ws) => {
		if (!clientData.isAlive) {
			console.log(`Terminating dead connection: ${clientData.clientIP}`);
			wsClients.delete(ws);
			return ws.terminate();
		}

		clientData.isAlive = false;
		ws.ping();
	});
}, HEARTBEAT_INTERVAL);

// Clean up heartbeat on server close
wss.on('close', () => {
	clearInterval(heartbeatInterval);
});

// Broadcast file updates to all connected clients
function broadcastFileUpdate(action, files) {
	const message = JSON.stringify({
		type: 'fileUpdate',
		action: action,
		files: files,
		timestamp: Date.now(),
	});

	wsClients.forEach((clientData, client) => {
		if (client.readyState === 1) {
			// WebSocket.OPEN
			client.send(message);
		}
	});

	console.log(`Broadcasted ${action} event to ${wsClients.size} client(s)`);
}

// Broadcast upload activity (who is uploading what)
function broadcastUploadActivity() {
	const uploaders = Array.from(activeUploaders.entries()).map(([id, data]) => ({
		clientId: id,
		filename: data.filename,
		progress: data.progress,
		duration: Date.now() - data.startTime,
	}));

	const message = JSON.stringify({
		type: 'uploadActivity',
		uploaders: uploaders,
		timestamp: Date.now(),
	});

	wsClients.forEach((clientData, client) => {
		if (client.readyState === 1) {
			client.send(message);
		}
	});
}
