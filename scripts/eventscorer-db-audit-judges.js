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

function parseCliArgs(argv = []) {
	const options = {
		limit: 50,
		json: false,
		outPath: null,
		help: false,
		errors: [],
		unknownArgs: [],
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]

		if (arg === '--limit') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push('--limit requires a positive integer value.')
				continue
			}

			options.limit = parseIntegerWithFallback(value, 50)
			index += 1
			continue
		}

		if (arg === '--json') {
			options.json = true
			continue
		}

		if (arg === '--out') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push('--out requires a file path.')
				continue
			}

			options.outPath = value
			index += 1
			continue
		}

		if (arg === '--help' || arg === '-h') {
			options.help = true
			continue
		}

		options.unknownArgs.push(arg)
	}

	return options
}

function printHelp() {
	console.log('Usage: node scripts/eventscorer-db-audit-judges.js [options]')
	console.log('')
	console.log('Options:')
	console.log('  --limit <number>   Number of consolidated rows to preview (default: 50)')
	console.log('  --json             Print full audit as JSON')
	console.log('  --out <path>       Write full audit JSON to file')
	console.log('  --help             Show this help')
}

function toIso(value) {
	if (!value) {
		return null
	}

	if (value instanceof Date) {
		return Number.isNaN(value.valueOf()) ? null : value.toISOString()
	}

	const parsed = new Date(value)
	return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString()
}

function compareIsoDate(left, right) {
	if (!left && !right) return 0
	if (!left) return 1
	if (!right) return -1
	if (left === right) return 0
	return left < right ? 1 : -1
}

function summarizeJudgeRows(rows) {
	const byNormalizedName = new Map()

	for (const row of rows) {
		const normalizedName = String(row.normalizedName || '').trim()
		const name = String(row.name || '').trim()
		if (!normalizedName || !name) {
			continue
		}

		const email = String(row.email || '').trim()
		const lastUsedAt = toIso(row.lastUsedAt)
		const existing = byNormalizedName.get(normalizedName)

		if (!existing) {
			const emailVariants = new Set()
			if (email) {
				emailVariants.add(email)
			}

			byNormalizedName.set(normalizedName, {
				normalizedName,
				name,
				email: email || null,
				usageCount: 1,
				lastUsedAt,
				nameVariants: new Set([name]),
				emailVariants,
			})
			continue
		}

		existing.usageCount += 1
		existing.nameVariants.add(name)
		if (email) {
			existing.emailVariants.add(email)
		}

		if (!existing.email && email) {
			existing.email = email
		}

		if (compareIsoDate(lastUsedAt, existing.lastUsedAt) < 0) {
			existing.lastUsedAt = lastUsedAt
		}
	}

	const consolidated = Array.from(byNormalizedName.values())
		.map((item) => ({
			normalizedName: item.normalizedName,
			name: item.name,
			email: item.email,
			usageCount: item.usageCount,
			lastUsedAt: item.lastUsedAt,
			nameVariants: Array.from(item.nameVariants).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
			emailVariants: Array.from(item.emailVariants).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
		}))
		.sort((left, right) => {
			if (right.usageCount !== left.usageCount) {
				return right.usageCount - left.usageCount
			}

			const dateCompare = compareIsoDate(left.lastUsedAt, right.lastUsedAt)
			if (dateCompare !== 0) {
				return dateCompare
			}

			return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
		})

	const duplicateGroups = consolidated.filter((entry) => entry.usageCount > 1)

	return {
		totalRows: rows.length,
		uniqueNormalizedNames: consolidated.length,
		duplicateGroupCount: duplicateGroups.length,
		consolidated,
		duplicateGroups,
	}
}

async function run() {
	const cliOptions = parseCliArgs(process.argv.slice(2))
	if (cliOptions.help) {
		printHelp()
		return
	}

	if (cliOptions.errors.length > 0) {
		throw new Error(cliOptions.errors.join(' '))
	}

	if (cliOptions.unknownArgs.length > 0) {
		console.warn(`[eventscorer:judge-audit] Ignoring unknown argument(s): ${cliOptions.unknownArgs.join(' ')}`)
	}

	const mysql = require('mysql2/promise')
	const config = buildDatabaseConfig()
	const connection = await mysql.createConnection({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
	})

	try {
		const [rowCountResult] = await connection.execute('SELECT COUNT(*) AS totalRows FROM es_judges')
		const totalRowsInTable = Number(rowCountResult?.[0]?.totalRows || 0)

		const [rows] = await connection.execute(
			`SELECT
				LOWER(TRIM(j.name)) AS normalizedName,
				TRIM(j.name) AS name,
				NULLIF(TRIM(j.email), '') AS email,
				e.created_at AS lastUsedAt
			FROM es_judges AS j
			INNER JOIN es_events AS e ON e.id = j.event_id
			WHERE TRIM(j.name) <> ''
			ORDER BY e.created_at DESC, j.sort_order ASC, j.id DESC`,
		)

		const summary = summarizeJudgeRows(rows)
		const report = {
			timestamp: new Date().toISOString(),
			database: config.database,
			totalRowsInTable,
			totalRowsWithName: summary.totalRows,
			uniqueNormalizedNames: summary.uniqueNormalizedNames,
			duplicateGroupCount: summary.duplicateGroupCount,
			duplicateGroups: summary.duplicateGroups,
			consolidatedDirectory: summary.consolidated,
		}

		if (cliOptions.json) {
			console.log(JSON.stringify(report, null, 2))
		} else {
			console.log(`[eventscorer:judge-audit] Database: ${report.database}`)
			console.log(`[eventscorer:judge-audit] Total judge rows: ${report.totalRowsInTable}`)
			console.log(`[eventscorer:judge-audit] Rows with names: ${report.totalRowsWithName}`)
			console.log(`[eventscorer:judge-audit] Unique normalized names: ${report.uniqueNormalizedNames}`)
			console.log(`[eventscorer:judge-audit] Duplicate name groups: ${report.duplicateGroupCount}`)

			if (report.duplicateGroups.length > 0) {
				console.log('[eventscorer:judge-audit] Duplicate groups:')
				console.table(
					report.duplicateGroups.map((entry) => ({
						name: entry.name,
						usageCount: entry.usageCount,
						emailVariants: entry.emailVariants.length > 0 ? entry.emailVariants.join(' | ') : '(none)',
						nameVariants: entry.nameVariants.length > 1 ? entry.nameVariants.join(' | ') : '(single variant)',
						lastUsedAt: entry.lastUsedAt || '(unknown)',
					})),
				)
			}

			const previewLimit = Math.max(1, cliOptions.limit)
			const previewRows = report.consolidatedDirectory.slice(0, previewLimit).map((entry) => ({
				name: entry.name,
				email: entry.email || '(none)',
				usageCount: entry.usageCount,
				lastUsedAt: entry.lastUsedAt || '(unknown)',
			}))

			console.log(`[eventscorer:judge-audit] Consolidated directory preview (top ${previewRows.length}):`)
			console.table(previewRows)
		}

		if (cliOptions.outPath) {
			const resolvedOutPath = path.resolve(process.cwd(), cliOptions.outPath)
			await fs.mkdir(path.dirname(resolvedOutPath), { recursive: true })
			await fs.writeFile(resolvedOutPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
			console.log(`[eventscorer:judge-audit] Wrote full report to ${resolvedOutPath}`)
		}
	} finally {
		await connection.end()
	}
}

run().catch((error) => {
	console.error('[eventscorer:judge-audit] Failed:', error.message)
	process.exitCode = 1
})
