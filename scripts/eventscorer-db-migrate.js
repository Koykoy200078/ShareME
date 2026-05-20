const fs = require('fs/promises')
const path = require('path')

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
		throw new Error(`mysql2 is required to run migrations: ${error.message}`)
	}
}

async function run() {
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
		console.log(`[eventscorer:migrate] Schema ready at ${config.host}:${config.port}/${config.database}`)
	} finally {
		await connection.end()
	}
}

run().catch((error) => {
	console.error('[eventscorer:migrate] Failed:', error.message)
	process.exitCode = 1
})
