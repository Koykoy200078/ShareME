const fs = require('fs/promises')
const path = require('path')

const DEFAULT_BATCH_SIZE = 200
const DEFAULT_TABLE_PREFIX = 'es_'
const DEFAULT_DB_TIMEZONE = '+08:00'

const TABLE_EXECUTION_ORDER = {
	es_events: 1,
	es_contestants: 2,
	es_contestant_participants: 3,
	es_judges: 4,
	es_criteria: 5,
	es_subcriteria: 6,
	es_presentation_slots: 7,
	es_presentation_slot_judges: 8,
	es_submissions: 9,
	es_submission_saved_contestants: 10,
	es_submission_scores: 11,
	es_submission_contestant_details: 12,
}

const ID_CONFLICT_REPLACE_RULES = {
	es_judges: {
		idColumn: 'id',
		matchColumns: ['token'],
	},
	es_presentation_slots: {
		idColumn: 'id',
		matchColumns: ['event_id', 'contestant_id'],
	},
	es_submissions: {
		idColumn: 'id',
		matchColumns: ['event_id', 'judge_id'],
	},
}

function parseIntegerWithFallback(value, fallback) {
	const parsed = Number.parseInt(String(value || ''), 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeTimezone(rawTimezone) {
	if (typeof rawTimezone !== 'string') {
		return DEFAULT_DB_TIMEZONE
	}

	const normalized = rawTimezone.trim()
	if (!normalized) {
		return DEFAULT_DB_TIMEZONE
	}

	if (normalized.toUpperCase() === 'SYSTEM') {
		return 'SYSTEM'
	}

	if (/^[+-](0\d|1\d|2[0-3]):[0-5]\d$/.test(normalized)) {
		return normalized
	}

	throw new Error('Invalid timezone. Use format +08:00, -05:00, or SYSTEM.')
}

async function applySessionTimezone(connection, rawTimezone = DEFAULT_DB_TIMEZONE, logger = () => {}) {
	if (!connection || typeof connection.execute !== 'function') {
		throw new Error('A valid mysql2 connection is required to set timezone.')
	}

	const timezone = normalizeTimezone(rawTimezone)
	await connection.execute('SET time_zone = ?', [timezone])
	logger(`Session time zone set to ${timezone}.`)
	return timezone
}

async function applyDatabaseTimezone(connection, rawTimezone = DEFAULT_DB_TIMEZONE, logger = () => {}) {
	const timezone = normalizeTimezone(rawTimezone)

	try {
		await connection.execute('SET GLOBAL time_zone = ?', [timezone])
		logger(`Global time zone set to ${timezone}.`)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unknown error'
		logger(`Global time zone unchanged (${message}).`)
	}

	await applySessionTimezone(connection, timezone, logger)
	return timezone
}

function chunkArray(items, size) {
	if (!Array.isArray(items) || items.length === 0) return []
	if (!Number.isFinite(size) || size <= 0) return [items]

	const chunks = []
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size))
	}

	return chunks
}

function quoteIdentifier(identifier) {
	return `\`${String(identifier || '').replace(/`/g, '``')}\``
}

function normalizeIdentifier(rawIdentifier) {
	if (typeof rawIdentifier !== 'string') return ''
	const withoutBackticks = rawIdentifier.replace(/`/g, '').trim()
	if (!withoutBackticks) return ''

	const parts = withoutBackticks
		.split('.')
		.map((part) => part.trim())
		.filter(Boolean)

	if (parts.length === 0) return ''
	return parts[parts.length - 1]
}

function extractApproximateRowHints(sqlText) {
	const rowsByTable = new Map()
	if (typeof sqlText !== 'string' || sqlText.length === 0) {
		return rowsByTable
	}

	const hintPattern = /^--\s*Dumping data for table\s+(.+?):\s*~?([\d,]+)\s+rows/gi
	let match
	while ((match = hintPattern.exec(sqlText)) !== null) {
		const tableName = normalizeIdentifier(match[1])
		const rows = Number.parseInt(String(match[2] || '').replace(/,/g, ''), 10)
		if (!tableName || !Number.isFinite(rows) || rows < 0) {
			continue
		}

		rowsByTable.set(tableName, rows)
	}

	return rowsByTable
}

function extractInsertStatements(sqlText) {
	if (typeof sqlText !== 'string' || sqlText.length === 0) {
		return []
	}

	const lines = sqlText.split(/\r?\n/)
	const statements = []
	let buffer = []
	let collecting = false

	for (const line of lines) {
		const trimmedStart = line.trimStart()
		const trimmedEnd = line.trimEnd()

		if (!collecting) {
			if (/^INSERT\s+INTO\b/i.test(trimmedStart)) {
				collecting = true
				buffer = [line]

				if (trimmedEnd.endsWith(';')) {
					statements.push(buffer.join('\n'))
					buffer = []
					collecting = false
				}
			}
			continue
		}

		buffer.push(line)
		if (trimmedEnd.endsWith(';')) {
			statements.push(buffer.join('\n'))
			buffer = []
			collecting = false
		}
	}

	if (collecting && buffer.length > 0) {
		statements.push(buffer.join('\n'))
	}

	return statements
}

function parseInsertStatement(statementSql) {
	if (typeof statementSql !== 'string' || statementSql.trim() === '') {
		throw new Error('Insert statement is empty.')
	}

	const trimmed = statementSql.trim()
	const insertPattern = /^INSERT\s+INTO\s+((?:`[^`]+`|[A-Za-z0-9_]+)(?:\.(?:`[^`]+`|[A-Za-z0-9_]+))?)\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*);$/i
	const match = trimmed.match(insertPattern)
	if (!match) {
		throw new Error('Unsupported INSERT format.')
	}

	const rawTable = match[1]
	const rawColumns = match[2]
	const rawValues = match[3]

	const tableName = normalizeIdentifier(rawTable)
	if (!tableName) {
		throw new Error('Unable to parse table name in INSERT statement.')
	}

	const columns = rawColumns
		.split(',')
		.map((column) => normalizeIdentifier(column))
		.filter(Boolean)

	if (columns.length === 0) {
		throw new Error(`No columns found for table ${tableName}.`)
	}

	return {
		tableName,
		columns,
		valuesSql: rawValues.trim(),
	}
}

function splitInsertTuples(valuesSql) {
	if (typeof valuesSql !== 'string' || valuesSql.trim() === '') {
		return []
	}

	const tuples = []
	let inString = false
	let escaped = false
	let depth = 0
	let tupleStart = -1

	for (let index = 0; index < valuesSql.length; index += 1) {
		const char = valuesSql[index]
		const nextChar = valuesSql[index + 1]

		if (inString) {
			if (escaped) {
				escaped = false
				continue
			}

			if (char === '\\') {
				escaped = true
				continue
			}

			if (char === "'" && nextChar === "'") {
				index += 1
				continue
			}

			if (char === "'") {
				inString = false
			}
			continue
		}

		if (char === "'") {
			inString = true
			continue
		}

		if (char === '(') {
			if (depth === 0) {
				tupleStart = index
			}
			depth += 1
			continue
		}

		if (char === ')') {
			depth -= 1
			if (depth === 0 && tupleStart >= 0) {
				tuples.push(valuesSql.slice(tupleStart, index + 1).trim())
				tupleStart = -1
			}
			continue
		}
	}

	if (depth !== 0 || inString) {
		throw new Error('Unbalanced VALUES tuples while parsing INSERT statement.')
	}

	return tuples
}

function splitTupleValues(tupleSql) {
	if (typeof tupleSql !== 'string') {
		throw new Error('Tuple SQL must be a string.')
	}

	const trimmed = tupleSql.trim()
	if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
		throw new Error('Tuple SQL must start with "(" and end with ")".')
	}

	const inner = trimmed.slice(1, -1)
	const values = []
	let startIndex = 0
	let inString = false
	let escaped = false
	let nestedDepth = 0

	for (let index = 0; index < inner.length; index += 1) {
		const char = inner[index]
		const nextChar = inner[index + 1]

		if (inString) {
			if (escaped) {
				escaped = false
				continue
			}

			if (char === '\\') {
				escaped = true
				continue
			}

			if (char === "'" && nextChar === "'") {
				index += 1
				continue
			}

			if (char === "'") {
				inString = false
			}
			continue
		}

		if (char === "'") {
			inString = true
			continue
		}

		if (char === '(') {
			nestedDepth += 1
			continue
		}

		if (char === ')') {
			nestedDepth -= 1
			continue
		}

		if (char === ',' && nestedDepth === 0) {
			values.push(inner.slice(startIndex, index).trim())
			startIndex = index + 1
		}
	}

	if (inString || nestedDepth !== 0) {
		throw new Error('Unbalanced tuple value expression.')
	}

	values.push(inner.slice(startIndex).trim())
	return values
}

function shouldIncludeTable(tableName, options) {
	if (!tableName) return false
	if (options.includeAllTables) return true
	if (!options.tablePrefix) return true
	return tableName.startsWith(options.tablePrefix)
}

function hasSameColumns(leftColumns, rightColumns) {
	if (!Array.isArray(leftColumns) || !Array.isArray(rightColumns)) return false
	if (leftColumns.length !== rightColumns.length) return false

	for (let index = 0; index < leftColumns.length; index += 1) {
		if (leftColumns[index] !== rightColumns[index]) {
			return false
		}
	}

	return true
}

function summarizeList(values, maxItems = 6) {
	if (!Array.isArray(values) || values.length === 0) return ''
	if (values.length <= maxItems) return values.join(', ')

	const shown = values.slice(0, maxItems).join(', ')
	return `${shown} (+${values.length - maxItems} more)`
}

function buildUpsertSql(tableName, columns, tupleBatch) {
	const quotedTable = quoteIdentifier(tableName)
	const quotedColumns = columns.map((column) => quoteIdentifier(column)).join(', ')
	const updates = columns.map((column) => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`).join(', ')

	return `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${tupleBatch.join(',\n')} ON DUPLICATE KEY UPDATE ${updates}`
}

function buildConflictDeleteSql(tableName, columns, tupleBatch) {
	const rule = ID_CONFLICT_REPLACE_RULES[tableName]
	if (!rule || !Array.isArray(tupleBatch) || tupleBatch.length === 0) {
		return null
	}

	const idIndex = columns.indexOf(rule.idColumn)
	const matchIndexes = rule.matchColumns.map((columnName) => columns.indexOf(columnName))
	if (idIndex < 0 || matchIndexes.some((index) => index < 0)) {
		return null
	}

	const predicates = []
	for (const tuple of tupleBatch) {
		const tupleValues = splitTupleValues(tuple)
		if (tupleValues.length !== columns.length) {
			throw new Error(`Unable to align tuple values for ${tableName}.`)
		}

		const idValue = tupleValues[idIndex]
		const matchClauses = rule.matchColumns.map((columnName, index) => `${quoteIdentifier(columnName)} = ${tupleValues[matchIndexes[index]]}`)
		predicates.push(`(${matchClauses.join(' AND ')} AND ${quoteIdentifier(rule.idColumn)} <> ${idValue})`)
	}

	if (predicates.length === 0) {
		return null
	}

	return `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${predicates.join(' OR ')}`
}

async function fetchExistingTables(connection) {
	const [rows] = await connection.query(
		`SELECT table_name AS tableName
		 FROM information_schema.tables
		 WHERE table_schema = DATABASE()`,
	)

	return new Set(rows.map((row) => normalizeIdentifier(row.tableName)).filter(Boolean))
}

async function fetchTableColumns(connection, tableName) {
	const [rows] = await connection.query(
		`SELECT column_name AS columnName
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?`,
		[tableName],
	)

	return new Set(rows.map((row) => normalizeIdentifier(row.columnName)).filter(Boolean))
}

function resolveDumpPath(sourcePath, cwd = process.cwd()) {
	if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
		throw new Error('A source dump file path is required.')
	}

	const normalized = sourcePath.trim()
	if (path.isAbsolute(normalized)) {
		return normalized
	}

	return path.resolve(cwd, normalized)
}

function normalizeOptions(rawOptions = {}) {
	const includeAllTables = rawOptions.includeAllTables === true
	const tablePrefix = includeAllTables ? '' : String(rawOptions.tablePrefix || DEFAULT_TABLE_PREFIX).trim()

	return {
		dryRun: rawOptions.dryRun === true,
		batchSize: parseIntegerWithFallback(rawOptions.batchSize, DEFAULT_BATCH_SIZE),
		tablePrefix,
		includeAllTables,
		logger: typeof rawOptions.logger === 'function' ? rawOptions.logger : () => {},
	}
}

function parseMergeCliArgs(argv = []) {
	const options = {
		sourcePath: null,
		sourcePaths: [],
		dryRun: false,
		batchSize: DEFAULT_BATCH_SIZE,
		tablePrefix: DEFAULT_TABLE_PREFIX,
		timezone: DEFAULT_DB_TIMEZONE,
		includeAllTables: false,
		help: false,
		errors: [],
		unknownArgs: [],
	}

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]

		if (arg === '--source' || arg === '--merge-dump') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push(`${arg} requires a file path.`)
				continue
			}

			options.sourcePath = value
			options.sourcePaths.push(value)
			index += 1
			continue
		}

		if (arg === '--dry-run') {
			options.dryRun = true
			continue
		}

		if (arg === '--batch-size') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push('--batch-size requires a positive integer value.')
				continue
			}

			options.batchSize = parseIntegerWithFallback(value, DEFAULT_BATCH_SIZE)
			index += 1
			continue
		}

		if (arg === '--table-prefix') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push('--table-prefix requires a value.')
				continue
			}

			options.tablePrefix = value.trim()
			index += 1
			continue
		}

		if (arg === '--timezone') {
			const value = argv[index + 1]
			if (!value || value.startsWith('--')) {
				options.errors.push('--timezone requires a value (e.g., +08:00).')
				continue
			}

			try {
				options.timezone = normalizeTimezone(value)
			} catch (error) {
				options.errors.push(error instanceof Error ? error.message : 'Invalid timezone value.')
			}

			index += 1
			continue
		}

		if (arg === '--all-tables') {
			options.includeAllTables = true
			continue
		}

		if (arg === '--help' || arg === '-h') {
			options.help = true
			continue
		}

		options.unknownArgs.push(arg)
	}

	if (options.includeAllTables) {
		options.tablePrefix = ''
	}

	if (!options.includeAllTables && !options.tablePrefix) {
		options.tablePrefix = DEFAULT_TABLE_PREFIX
	}

	if (options.sourcePaths.length > 0) {
		const deduped = []
		const seen = new Set()
		for (const sourcePath of options.sourcePaths) {
			const key = String(sourcePath || '')
				.trim()
				.toLowerCase()
			if (!key || seen.has(key)) {
				continue
			}

			seen.add(key)
			deduped.push(sourcePath)
		}

		options.sourcePaths = deduped
		options.sourcePath = deduped[deduped.length - 1] ?? null
	}

	return options
}

async function mergeDumpFile(connection, sourcePath, rawOptions = {}) {
	if (!connection || typeof connection.query !== 'function') {
		throw new Error('A valid mysql2 connection is required.')
	}

	const options = normalizeOptions(rawOptions)
	const resolvedPath = resolveDumpPath(sourcePath)
	const sqlText = await fs.readFile(resolvedPath, 'utf8')
	const approxRowsByTable = extractApproximateRowHints(sqlText)
	const rawStatements = extractInsertStatements(sqlText)

	const parsedStatements = []
	const parseWarnings = []
	for (let index = 0; index < rawStatements.length; index += 1) {
		const statement = rawStatements[index]
		try {
			const parsed = parseInsertStatement(statement)
			parsed.tupleCount = splitInsertTuples(parsed.valuesSql).length
			parsed.sourceIndex = index
			parsedStatements.push(parsed)
		} catch (error) {
			parseWarnings.push(error.message)
		}
	}

	const tableSummary = new Map()
	for (const statement of parsedStatements) {
		if (!shouldIncludeTable(statement.tableName, options)) {
			continue
		}

		if (!tableSummary.has(statement.tableName)) {
			tableSummary.set(statement.tableName, {
				tableName: statement.tableName,
				sourceColumns: [...statement.columns],
				statementCount: 0,
				sourceTupleCount: 0,
				approxRows: approxRowsByTable.get(statement.tableName) ?? null,
				status: 'pending',
				message: '',
				missingTargetColumns: [],
				targetOnlyColumns: [],
				processedRows: 0,
				deletedRows: 0,
				affectedRows: 0,
				executedBatches: 0,
			})
		}

		const summary = tableSummary.get(statement.tableName)
		summary.statementCount += 1
		summary.sourceTupleCount += statement.tupleCount

		if (!hasSameColumns(summary.sourceColumns, statement.columns)) {
			summary.status = 'skipped'
			summary.message = 'inconsistent dump columns across INSERT statements'
		}
	}

	const existingTables = await fetchExistingTables(connection)
	const tableColumnCache = new Map()

	for (const summary of tableSummary.values()) {
		if (summary.status === 'skipped') {
			continue
		}

		if (!existingTables.has(summary.tableName)) {
			summary.status = 'skipped'
			summary.message = 'table does not exist in target database'
			continue
		}

		let columns = tableColumnCache.get(summary.tableName)
		if (!columns) {
			columns = await fetchTableColumns(connection, summary.tableName)
			tableColumnCache.set(summary.tableName, columns)
		}

		const missingColumns = summary.sourceColumns.filter((column) => !columns.has(column))
		const targetOnlyColumns = Array.from(columns).filter((column) => !summary.sourceColumns.includes(column))

		summary.missingTargetColumns = missingColumns
		summary.targetOnlyColumns = targetOnlyColumns

		if (missingColumns.length > 0) {
			summary.status = 'skipped'
			summary.message = `missing target columns: ${summarizeList(missingColumns)}`
			continue
		}

		if (targetOnlyColumns.length > 0) {
			summary.message = `target-only columns not in dump: ${summarizeList(targetOnlyColumns)}`
		}

		summary.status = options.dryRun ? 'dry-run' : 'ready'
	}

	const executionWarnings = []
	let processedStatements = 0
	let processedRows = 0
	let affectedRows = 0

	const executableStatements = parsedStatements
		.filter((statement) => {
			if (!shouldIncludeTable(statement.tableName, options)) {
				return false
			}

			const summary = tableSummary.get(statement.tableName)
			return Boolean(summary) && summary.status !== 'skipped'
		})
		.sort((left, right) => {
			const leftOrder = TABLE_EXECUTION_ORDER[left.tableName] ?? Number.MAX_SAFE_INTEGER
			const rightOrder = TABLE_EXECUTION_ORDER[right.tableName] ?? Number.MAX_SAFE_INTEGER
			if (leftOrder !== rightOrder) {
				return leftOrder - rightOrder
			}

			return left.sourceIndex - right.sourceIndex
		})

	for (const statement of executableStatements) {
		if (!shouldIncludeTable(statement.tableName, options)) {
			continue
		}

		const summary = tableSummary.get(statement.tableName)
		if (!summary || summary.status === 'skipped') {
			continue
		}

		let tuples
		try {
			tuples = splitInsertTuples(statement.valuesSql)
		} catch (error) {
			executionWarnings.push(`${statement.tableName}: ${error.message}`)
			continue
		}

		if (tuples.length === 0) {
			continue
		}

		for (const tupleBatch of chunkArray(tuples, options.batchSize)) {
			if (tupleBatch.length === 0) {
				continue
			}

			const conflictDeleteSql = buildConflictDeleteSql(statement.tableName, statement.columns, tupleBatch)
			if (conflictDeleteSql && !options.dryRun) {
				const [deleteResult] = await connection.query(conflictDeleteSql)
				summary.deletedRows += Number(deleteResult?.affectedRows || 0)
			}

			const upsertSql = buildUpsertSql(statement.tableName, statement.columns, tupleBatch)
			if (!options.dryRun) {
				const [result] = await connection.query(upsertSql)
				const currentAffectedRows = Number(result?.affectedRows || 0)
				affectedRows += currentAffectedRows
				summary.affectedRows += currentAffectedRows
			}

			processedStatements += 1
			processedRows += tupleBatch.length
			summary.processedRows += tupleBatch.length
			summary.executedBatches += 1
		}
	}

	const finalTableSummary = Array.from(tableSummary.values()).sort((left, right) => left.tableName.localeCompare(right.tableName))

	const report = {
		sourcePath,
		resolvedPath,
		dryRun: options.dryRun,
		tablePrefix: options.includeAllTables ? null : options.tablePrefix,
		includeAllTables: options.includeAllTables,
		batchSize: options.batchSize,
		rawInsertStatements: rawStatements.length,
		parsedStatements: parsedStatements.length,
		parseWarnings,
		executionWarnings,
		processedStatements,
		processedRows,
		affectedRows,
		tables: finalTableSummary,
	}

	options.logger(`Parsed ${report.parsedStatements}/${report.rawInsertStatements} INSERT statements from ${report.resolvedPath}`)
	if (parseWarnings.length > 0) {
		options.logger(`Skipped ${parseWarnings.length} statement(s) due to parsing issues.`)
	}

	for (const table of finalTableSummary) {
		const approxPart = Number.isFinite(table.approxRows) ? `, dump hint ~${table.approxRows}` : ''
		const sourceColumnsPart = table.sourceColumns.length > 0 ? `, source_columns=${table.sourceColumns.length}` : ''
		options.logger(`${table.tableName}: status=${table.status}, statements=${table.statementCount}, rows=${table.sourceTupleCount}${approxPart}${sourceColumnsPart}, processed=${table.processedRows}, deleted=${table.deletedRows}, affected=${table.affectedRows}${table.message ? ` (${table.message})` : ''}`)
	}

	if (executionWarnings.length > 0) {
		options.logger(`Encountered ${executionWarnings.length} execution warning(s).`)
	}

	return report
}

module.exports = {
	DEFAULT_BATCH_SIZE,
	DEFAULT_DB_TIMEZONE,
	DEFAULT_TABLE_PREFIX,
	applyDatabaseTimezone,
	applySessionTimezone,
	parseMergeCliArgs,
	mergeDumpFile,
	normalizeTimezone,
	resolveDumpPath,
}
