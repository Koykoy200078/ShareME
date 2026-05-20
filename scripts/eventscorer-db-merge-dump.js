const fs = require('fs/promises')
const path = require('path')

const { DEFAULT_DB_TIMEZONE, applyDatabaseTimezone, mergeDumpFile, parseMergeCliArgs } = require('./lib/eventscorer-dump-merge')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

function parseIntegerWithFallback(value, fallback) {
	const parsed = Number.parseInt(String(value || ''), 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildDatabaseConfig() {
	const host = process.env.EVENTSCORER_DB_HOST || process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1'
	const port = parseIntegerWithFallback(process.env.EVENTSCORER_DB_PORT || process.env.MYSQL_PORT || process.env.DB_PORT, 3306)
	const user = process.env.EVENTSCORER_DB_USER || process.env.MYSQL_USER || process.env.DB_USER || ''
	const password = process.env.EVENTSCORER_DB_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || ''
	const database = process.env.EVENTSCORER_DB_NAME || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'shareme_eventscorer'

	if (!host) throw new Error('Database host is required.')
	if (!user) throw new Error('Database user is required. Set EVENTSCORER_DB_USER in .env.')
	if (!database) throw new Error('Database name is required.')

	return { host, port, user, password, database }
}

function loadMysqlClient() {
	try {
		return require('mysql2/promise')
	} catch (error) {
		throw new Error(`mysql2 is required to merge dumps: ${error.message}`)
	}
}

function printHelp() {
	console.log('Usage: node scripts/eventscorer-db-merge-dump.js --source <path-to-dump.sql> [--source <path-to-dump.sql> ...] [options]')
	console.log('')
	console.log('Options:')
	console.log('  --source <path>          Source SQL dump to merge (repeatable)')
	console.log('  --dry-run                Parse and validate without writing changes')
	console.log('  --batch-size <number>    Number of rows per upsert batch (default: 200)')
	console.log('  --table-prefix <prefix>  Limit to tables with this prefix (default: es_)')
	console.log(`  --timezone <offset>      DB session timezone (default: ${DEFAULT_DB_TIMEZONE})`)
	console.log('  --all-tables             Merge all tables found in the dump')
	console.log('  --help                   Show this help')
}

async function run() {
	const cliOptions = parseMergeCliArgs(process.argv.slice(2))

	if (cliOptions.help) {
		printHelp()
		return
	}

	if (cliOptions.errors.length > 0) {
		throw new Error(cliOptions.errors.join(' '))
	}

	const sourcePaths = cliOptions.sourcePaths.length > 0 ? cliOptions.sourcePaths : cliOptions.sourcePath ? [cliOptions.sourcePath] : []

	if (sourcePaths.length === 0) {
		printHelp()
		throw new Error('Missing required --source argument(s).')
	}

	if (cliOptions.unknownArgs.length > 0) {
		console.warn(`[eventscorer:merge] Ignoring unknown argument(s): ${cliOptions.unknownArgs.join(' ')}`)
	}

	const mysql = loadMysqlClient()
	const config = buildDatabaseConfig()
	const sqlPath = path.join(__dirname, 'sql', 'eventscorer-migration.sql')
	const migrationSql = await fs.readFile(sqlPath, 'utf8')

	const connection = await mysql.createConnection({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		multipleStatements: true,
	})

	try {
		await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
		await connection.query(`USE \`${config.database}\``)
		await connection.query(migrationSql)
		await applyDatabaseTimezone(connection, cliOptions.timezone, (message) => console.log(`[eventscorer:merge] ${message}`))

		let totalProcessedRows = 0
		let totalProcessedStatements = 0
		let totalAffectedRows = 0
		let totalWarnings = 0

		for (let index = 0; index < sourcePaths.length; index += 1) {
			const sourcePath = sourcePaths[index]
			console.log(`[eventscorer:merge] Source ${index + 1}/${sourcePaths.length}: ${sourcePath}`)

			const report = await mergeDumpFile(connection, sourcePath, {
				dryRun: cliOptions.dryRun,
				batchSize: cliOptions.batchSize,
				tablePrefix: cliOptions.tablePrefix,
				includeAllTables: cliOptions.includeAllTables,
				logger: (message) => console.log(`[eventscorer:merge] ${message}`),
			})

			totalProcessedRows += report.processedRows
			totalProcessedStatements += report.processedStatements
			totalAffectedRows += report.affectedRows
			totalWarnings += report.parseWarnings.length + report.executionWarnings.length
		}

		if (totalWarnings > 0) {
			console.log(`[eventscorer:merge] Completed with ${totalWarnings} warning(s).`)
		}

		console.log(`[eventscorer:merge] ${cliOptions.dryRun ? 'Dry run finished' : 'Merge finished'} across ${sourcePaths.length} dump(s): processed ${totalProcessedRows} row tuple(s) across ${totalProcessedStatements} batch query(ies), affected rows ${totalAffectedRows}.`)
	} finally {
		await connection.end()
	}
}

run().catch((error) => {
	console.error('[eventscorer:merge] Failed:', error.message)
	process.exitCode = 1
})
