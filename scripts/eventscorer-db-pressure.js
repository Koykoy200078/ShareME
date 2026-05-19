const mysql = require('mysql2/promise')

function compactWhitespace(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
}

function parsePositiveIntegerWithFallback(value, fallback) {
	const parsed = Number.parseInt(String(value || ''), 10)
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback
	return parsed
}

function parseNumber(value, fallback = 0) {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return parsed
}

function parseBooleanFlag(value) {
	const normalized = compactWhitespace(value).toLowerCase()
	return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function readDatabaseConfigFromEnv() {
	const host = compactWhitespace(process.env.EVENTSCORER_DB_HOST || process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1')
	const port = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PORT || process.env.MYSQL_PORT || process.env.DB_PORT, 3306)
	const user = compactWhitespace(process.env.EVENTSCORER_DB_USER || process.env.MYSQL_USER || process.env.DB_USER || '')
	const password = process.env.EVENTSCORER_DB_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || ''
	const database = compactWhitespace(process.env.EVENTSCORER_DB_NAME || process.env.MYSQL_DATABASE || process.env.DB_NAME || '')

	if (!user) {
		throw new Error('Database user is required. Set EVENTSCORER_DB_USER in .env.')
	}

	return {
		host,
		port,
		user,
		password,
		database: database || undefined,
	}
}

function buildThresholdsFromEnv() {
	const warnThreadsConnectedPct = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_WARN_THREADS_PCT, 80)
	const warnMaxUsedPct = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_WARN_MAX_USED_PCT, 90)
	const criticalThreadsConnectedPct = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_CRITICAL_THREADS_PCT, 92)
	const criticalMaxUsedPct = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_CRITICAL_MAX_USED_PCT, 97)
	const warningConnectionErrors = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_WARN_CONNECTION_ERRORS, 1)
	const criticalConnectionErrors = parsePositiveIntegerWithFallback(process.env.EVENTSCORER_DB_PRESSURE_CRITICAL_CONNECTION_ERRORS, 25)

	return {
		warnThreadsConnectedPct,
		warnMaxUsedPct,
		criticalThreadsConnectedPct,
		criticalMaxUsedPct,
		warningConnectionErrors,
		criticalConnectionErrors,
	}
}

function mergeThresholds(overrides) {
	if (!overrides || typeof overrides !== 'object') return buildThresholdsFromEnv()
	const base = buildThresholdsFromEnv()

	return {
		warnThreadsConnectedPct: parsePositiveIntegerWithFallback(overrides.warnThreadsConnectedPct, base.warnThreadsConnectedPct),
		warnMaxUsedPct: parsePositiveIntegerWithFallback(overrides.warnMaxUsedPct, base.warnMaxUsedPct),
		criticalThreadsConnectedPct: parsePositiveIntegerWithFallback(overrides.criticalThreadsConnectedPct, base.criticalThreadsConnectedPct),
		criticalMaxUsedPct: parsePositiveIntegerWithFallback(overrides.criticalMaxUsedPct, base.criticalMaxUsedPct),
		warningConnectionErrors: parsePositiveIntegerWithFallback(overrides.warningConnectionErrors, base.warningConnectionErrors),
		criticalConnectionErrors: parsePositiveIntegerWithFallback(overrides.criticalConnectionErrors, base.criticalConnectionErrors),
	}
}

function evaluateDbPressure(snapshot, thresholds) {
	const maxConnections = Math.max(1, parseNumber(snapshot.maxConnections, 1))
	const threadsConnected = Math.max(0, parseNumber(snapshot.threadsConnected, 0))
	const maxUsedConnections = Math.max(0, parseNumber(snapshot.maxUsedConnections, 0))
	const connectionErrorsMaxConnections = Math.max(0, parseNumber(snapshot.connectionErrorsMaxConnections, 0))

	const threadsConnectedPct = (threadsConnected / maxConnections) * 100
	const maxUsedPct = (maxUsedConnections / maxConnections) * 100
	const maxUsedConnectionsDelta = maxConnections - maxUsedConnections
	const currentHeadroom = maxConnections - threadsConnected

	const critical = threadsConnectedPct >= thresholds.criticalThreadsConnectedPct || maxUsedPct >= thresholds.criticalMaxUsedPct || connectionErrorsMaxConnections >= thresholds.criticalConnectionErrors

	const warning = threadsConnectedPct >= thresholds.warnThreadsConnectedPct || maxUsedPct >= thresholds.warnMaxUsedPct || connectionErrorsMaxConnections >= thresholds.warningConnectionErrors

	const level = critical ? 'critical' : warning ? 'warning' : 'ok'
	const recommendations = []

	if (threadsConnectedPct >= thresholds.warnThreadsConnectedPct) {
		recommendations.push('Reduce app pool sizes or stop duplicate Node/Next processes.')
	}

	if (maxUsedPct >= thresholds.warnMaxUsedPct) {
		recommendations.push('Increase MySQL max_connections carefully or tune pooling limits.')
	}

	if (connectionErrorsMaxConnections >= thresholds.warningConnectionErrors) {
		recommendations.push('Investigate recent connection spikes; errors indicate clients were rejected by MySQL.')
	}

	return {
		level,
		ok: level === 'ok',
		metrics: {
			...snapshot,
			threadsConnectedPct: Math.round(threadsConnectedPct * 100) / 100,
			maxUsedPct: Math.round(maxUsedPct * 100) / 100,
			maxUsedConnectionsDelta,
			currentHeadroom,
		},
		recommendations,
	}
}

async function queryDbPressureSnapshot(config) {
	const connection = await mysql.createConnection({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
	})

	try {
		const [variableRows] = await connection.query("SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections')")
		const [statusRows] = await connection.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections','Connection_errors_max_connections','Aborted_connects')")

		const byName = new Map()
		for (const row of variableRows) {
			byName.set(String(row.Variable_name), parseNumber(row.Value, 0))
		}
		for (const row of statusRows) {
			byName.set(String(row.Variable_name), parseNumber(row.Value, 0))
		}

		return {
			capturedAt: new Date().toISOString(),
			maxConnections: byName.get('max_connections') || 0,
			threadsConnected: byName.get('Threads_connected') || 0,
			threadsRunning: byName.get('Threads_running') || 0,
			maxUsedConnections: byName.get('Max_used_connections') || 0,
			connectionErrorsMaxConnections: byName.get('Connection_errors_max_connections') || 0,
			abortedConnects: byName.get('Aborted_connects') || 0,
		}
	} finally {
		await connection.end()
	}
}

async function getEventscorerDbPressure(options = {}) {
	const config = options.config || readDatabaseConfigFromEnv()
	const thresholds = mergeThresholds(options.thresholds)
	const snapshot = await queryDbPressureSnapshot(config)
	const evaluation = evaluateDbPressure(snapshot, thresholds)

	return {
		service: 'eventscorer-db-pressure',
		thresholds,
		...evaluation,
	}
}

function parseCliFlags(argv) {
	const flagSet = new Set(argv.map((entry) => String(entry).trim()))
	return {
		pretty: flagSet.has('--pretty'),
		strict: flagSet.has('--strict'),
	}
}

async function runCli() {
	require('dotenv').config()

	const flags = parseCliFlags(process.argv.slice(2))
	const result = await getEventscorerDbPressure()
	const output = flags.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result)
	console.log(output)

	if (flags.strict && result.level !== 'ok') {
		process.exit(result.level === 'critical' ? 2 : 1)
	}
}

module.exports = {
	getEventscorerDbPressure,
	readDatabaseConfigFromEnv,
	evaluateDbPressure,
}

if (require.main === module) {
	runCli().catch((error) => {
		const message = error && error.message ? error.message : String(error)
		console.error(JSON.stringify({ service: 'eventscorer-db-pressure', error: message }))
		process.exit(1)
	})
}
