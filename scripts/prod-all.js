const { spawn } = require('child_process')
const net = require('net')
const path = require('path')
const fs = require('fs')

const rootDir = path.resolve(__dirname, '..')
const webDir = path.join(rootDir, 'screens', 'sharemeweb')
const eventscorerDir = path.join(rootDir, 'screens', 'eventscorer')
const npmCommand = 'npm'

// ─── Load root .env so ports are driven by a single config file ──────────────
// We parse it manually (no dotenv dependency in scripts/) and only set keys
// that are not already in process.env (so CI/shell overrides still win).
function loadRootEnv() {
	const envPath = path.join(rootDir, '.env')
	if (!fs.existsSync(envPath)) return
	const lines = fs.readFileSync(envPath, 'utf8').split('\n')
	for (const raw of lines) {
		const line = raw.trim()
		if (!line || line.startsWith('#')) continue
		const eq = line.indexOf('=')
		if (eq === -1) continue
		const key = line.slice(0, eq).trim()
		const val = line.slice(eq + 1).trim()
		if (key && !(key in process.env)) {
			process.env[key] = val
		}
	}
}
loadRootEnv()

const PROTOCOL = 'http'

const os = require('os')

function getLocalIPAddress() {
	const interfaces = os.networkInterfaces()
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] || []) {
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address
			}
		}
	}
	return '127.0.0.1'
}

function isLocalIPv4Address(address) {
	if (!address) return false
	const interfaces = os.networkInterfaces()
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name] || []) {
			if (iface.family === 'IPv4' && iface.address === address) {
				return true
			}
		}
	}
	return false
}

const STATIC_SERVER_IP = (process.env.SERVER_IP || '').trim()
const BACKEND_HOST = isLocalIPv4Address(STATIC_SERVER_IP) ? STATIC_SERVER_IP : getLocalIPAddress()

// ─── Resolve ports from env (after loading .env) ─────────────────────────────
function parsePortFromEnv(key, fallback) {
	const rawValue = (process.env[key] || String(fallback)).trim()
	const parsed = Number.parseInt(rawValue, 10)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
		throw new Error(`[prod:all] Invalid ${key}="${rawValue}". Expected an integer between 1 and 65535.`)
	}
	return parsed
}

const BACKEND_PORT = parsePortFromEnv('PORT', 3007)
const FRONTEND_PORT = parsePortFromEnv('FRONTEND_PORT', 3000)
const EVENTSCORER_PORT = parsePortFromEnv('EVENTSCORER_PORT', 3001)
const BACKEND_ORIGIN = `${PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}`
const NEXT_PROXY_API_PORT = BACKEND_PORT
const NEXT_PROXY_API_ORIGIN = `http://127.0.0.1:${NEXT_PROXY_API_PORT}`

console.log(`[prod:all] Mode        → ${PROTOCOL.toUpperCase()}`)
console.log(`[prod:all] Backend Host → ${BACKEND_HOST}`)
console.log(`[prod:all] Backend     → :${BACKEND_PORT}`)
console.log(`[prod:all] Proxy API   → ${NEXT_PROXY_API_ORIGIN}`)
console.log(`[prod:all] Frontend    → :${FRONTEND_PORT}`)
console.log(`[prod:all] Eventscorer → :${EVENTSCORER_PORT}`)

let shuttingDown = false
let backend = null
let frontend = null
let eventscorer = null

function ensureUniquePorts() {
	const checks = [
		{ name: 'backend', port: BACKEND_PORT },
		{ name: 'frontend', port: FRONTEND_PORT },
		{ name: 'eventscorer', port: EVENTSCORER_PORT },
	]
	const seen = new Map()
	for (const check of checks) {
		if (seen.has(check.port)) {
			const first = seen.get(check.port)
			throw new Error(`[prod:all] Port collision: ${first} and ${check.name} both use ${check.port}. Set distinct PORT/FRONTEND_PORT/EVENTSCORER_PORT values in .env.`)
		}
		seen.set(check.port, check.name)
	}
}

function ensureProductionBuildArtifacts() {
	const buildChecks = [
		{ name: 'sharemeweb', file: path.join(webDir, '.next', 'BUILD_ID') },
		{ name: 'eventscorer', file: path.join(eventscorerDir, '.next', 'BUILD_ID') },
	]
	const missing = buildChecks.filter((item) => !fs.existsSync(item.file))
	if (missing.length > 0) {
		const names = missing.map((item) => item.name).join(', ')
		throw new Error(`[prod:all] Missing Next.js production build artifact(s) for: ${names}. Build these apps before running prod mode.`)
	}
}

function buildSpawnEnv(envOverrides = {}) {
	const env = {}
	for (const [key, value] of Object.entries(process.env)) {
		if (!key || key.startsWith('=') || key.includes('\0')) continue
		if (typeof value !== 'string') continue
		env[key] = value
	}
	for (const [key, value] of Object.entries(envOverrides)) {
		if (!key || key.startsWith('=') || key.includes('\0')) continue
		if (value === undefined || value === null) continue
		env[key] = String(value)
	}
	return env
}

function startProcess(name, command, args, cwd, envOverrides = {}) {
	const spawnOptions = {
		cwd,
		env: buildSpawnEnv(envOverrides),
		stdio: 'inherit',
	}

	const child = process.platform === 'win32' ? spawn(`${command} ${args.join(' ')}`, { ...spawnOptions, shell: true }) : spawn(command, args, { ...spawnOptions, shell: false })

	child.on('exit', (code, signal) => {
		if (!shuttingDown) {
			console.log(`[${name}] exited (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Stopping all services...`)
			shutdown()
		}
	})

	child.on('error', (error) => {
		console.error(`[${name}] failed to start:`, error.message)
		if (!shuttingDown) shutdown()
	})

	return child
}

function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer()
		server.once('error', () => resolve(false))
		server.once('listening', () => server.close(() => resolve(true)))
		server.listen(port, '0.0.0.0')
	})
}

async function ensurePortsAreAvailable() {
	const checks = [
		{ name: 'frontend', port: FRONTEND_PORT },
		{ name: 'eventscorer', port: EVENTSCORER_PORT },
		{ name: 'backend', port: BACKEND_PORT },
	]

	let hasBusyPort = false
	for (const check of checks) {
		const available = await isPortAvailable(check.port)
		if (!available) {
			hasBusyPort = true
			console.error(`[prod:all] Port ${check.port} (${check.name}) is already in use. Stop existing services first, then run npm run prod:all again.`)
		}
	}
	return !hasBusyPort
}

async function main() {
	ensureUniquePorts()
	ensureProductionBuildArtifacts()

	const ready = await ensurePortsAreAvailable()
	if (!ready) {
		process.exit(1)
		return
	}

	backend = startProcess('backend', npmCommand, ['start'], rootDir, {
		// PORT is already in process.env (loaded from .env above),
		// but we pass it explicitly so child also gets it.
		PORT: String(BACKEND_PORT),
		FORCE_HTTP_ONLY: '1',
	})

	const frontendArgs = ['npm', 'start', '--', '-H', '0.0.0.0']

	frontend = startProcess('frontend', frontendArgs[0], frontendArgs.slice(1), webDir, {
		UNIFIED_API_ORIGIN: BACKEND_ORIGIN,
		NEXT_PROXY_API_ORIGIN,
		NEXT_PUBLIC_BACKEND_PORT: String(BACKEND_PORT),
		NEXT_PUBLIC_BACKEND_HTTP_PORT: String(NEXT_PROXY_API_PORT),
		PORT: String(FRONTEND_PORT),
		NODE_ENV: 'production',
	})

	eventscorer = startProcess('eventscorer', frontendArgs[0], frontendArgs.slice(1), eventscorerDir, {
		UNIFIED_API_ORIGIN: BACKEND_ORIGIN,
		NEXT_PROXY_API_ORIGIN,
		NEXT_PUBLIC_BACKEND_PORT: String(BACKEND_PORT),
		NEXT_PUBLIC_BACKEND_HTTP_PORT: String(NEXT_PROXY_API_PORT),
		PORT: String(EVENTSCORER_PORT),
		NODE_ENV: 'production',
	})
}

function killChildTree(child) {
	if (!child || child.killed || !child.pid) return
	if (process.platform === 'win32') {
		spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
		return
	}
	child.kill('SIGINT')
}

function shutdown() {
	if (shuttingDown) return
	shuttingDown = true
	for (const child of [backend, frontend, eventscorer]) killChildTree(child)
	setTimeout(() => process.exit(0), 1200)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((error) => {
	console.error('[prod:all] startup failed:', error.message)
	process.exit(1)
})
