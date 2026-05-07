const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'screens', 'sharemeweb');
const npmCommand = 'npm';

// ─── Load root .env so ports are driven by a single config file ──────────────
// We parse it manually (no dotenv dependency in scripts/) and only set keys
// that are not already in process.env (so CI/shell overrides still win).
function loadRootEnv() {
	const envPath = path.join(rootDir, '.env');
	if (!fs.existsSync(envPath)) return;
	const lines = fs.readFileSync(envPath, 'utf8').split('\n');
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		const val = line.slice(eq + 1).trim();
		if (key && !(key in process.env)) {
			process.env[key] = val;
		}
	}
}
loadRootEnv();

// ─── Resolve ports from env (after loading .env) ─────────────────────────────
const BACKEND_PORT  = parseInt(process.env.PORT           || '3007', 10);
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT  || '3000', 10);
const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

console.log(`[dev:all] Backend  → :${BACKEND_PORT}`);
console.log(`[dev:all] Frontend → :${FRONTEND_PORT}`);

let shuttingDown = false;
let backend = null;
let frontend = null;

function buildSpawnEnv(envOverrides = {}) {
	const env = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (!key || key.startsWith('=') || key.includes('\0')) continue;
		if (typeof value !== 'string') continue;
		env[key] = value;
	}
	for (const [key, value] of Object.entries(envOverrides)) {
		if (!key || key.startsWith('=') || key.includes('\0')) continue;
		if (value === undefined || value === null) continue;
		env[key] = String(value);
	}
	return env;
}

function startProcess(name, command, args, cwd, envOverrides = {}) {
	const spawnOptions = {
		cwd,
		env: buildSpawnEnv(envOverrides),
		stdio: 'inherit',
	};

	const child =
		process.platform === 'win32'
			? spawn(`npm ${args.join(' ')}`, { ...spawnOptions, shell: true })
			: spawn(command, args, { ...spawnOptions, shell: false });

	child.on('exit', (code, signal) => {
		if (!shuttingDown) {
			console.log(`[${name}] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Stopping all services...`);
			shutdown();
		}
	});

	child.on('error', (error) => {
		console.error(`[${name}] failed to start:`, error.message);
		if (!shuttingDown) shutdown();
	});

	return child;
}

function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => server.close(() => resolve(true)));
		server.listen(port, '0.0.0.0');
	});
}

async function ensurePortsAreAvailable() {
	const checks = [
		{ name: 'frontend', port: FRONTEND_PORT },
		{ name: 'backend',  port: BACKEND_PORT  },
	];

	let hasBusyPort = false;
	for (const check of checks) {
		const available = await isPortAvailable(check.port);
		if (!available) {
			hasBusyPort = true;
			console.error(
				`[dev:all] Port ${check.port} (${check.name}) is already in use. Stop existing dev servers first, then run npm run dev:all again.`
			);
		}
	}
	return !hasBusyPort;
}

async function main() {
	const ready = await ensurePortsAreAvailable();
	if (!ready) {
		process.exit(1);
		return;
	}

	backend = startProcess('backend', npmCommand, ['run', 'dev'], rootDir, {
		// PORT is already in process.env (loaded from .env above),
		// but we pass it explicitly so nodemon child also gets it.
		PORT: String(BACKEND_PORT),
	});

	frontend = startProcess('frontend', npmCommand, ['run', 'dev'], webDir, {
		// Tells Next.js which origin to proxy API calls to
		UNIFIED_API_ORIGIN: BACKEND_ORIGIN,
		// Exposes the backend port to client-side code (NEXT_PUBLIC_ prefix)
		NEXT_PUBLIC_BACKEND_PORT: String(BACKEND_PORT),
		// Port Next.js listens on
		PORT: String(FRONTEND_PORT),
	});
}

function killChildTree(child) {
	if (!child || child.killed || !child.pid) return;
	if (process.platform === 'win32') {
		spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
		return;
	}
	child.kill('SIGINT');
}

function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const child of [backend, frontend]) killChildTree(child);
	setTimeout(() => process.exit(0), 1200);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
	console.error('[dev:all] startup failed:', error.message);
	process.exit(1);
});
