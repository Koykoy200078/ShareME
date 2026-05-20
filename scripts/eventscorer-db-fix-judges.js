const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const DEFAULT_ALIAS_RULES = [
	{ from: 'Ariel', to: 'Ariel Bensing' },
	{ from: 'Gab', to: 'Gabrielle Saranillo' },
	{ from: 'Chan', to: 'Christian Carvajal' },
	{ from: 'Jasper', to: 'Jasper Bardo' },
	{ from: 'Rosette', to: 'Rosette C. Cagang' },
	{ from: 'Diana', to: 'Diana Nazareth' },
	{ from: 'Chester Cofino', to: 'Dr. Chester L. Cofino' },
]

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
		apply: false,
		noAlias: false,
		help: false,
		errors: [],
		unknownArgs: [],
	}

	for (const arg of argv) {
		if (arg === '--apply') {
			options.apply = true
			continue
		}

		if (arg === '--dry-run') {
			options.apply = false
			continue
		}

		if (arg === '--no-alias') {
			options.noAlias = true
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
	console.log('Usage: node scripts/eventscorer-db-fix-judges.js [options]')
	console.log('')
	console.log('Options:')
	console.log('  --apply     Apply changes and commit transaction (default is dry-run rollback)')
	console.log('  --dry-run   Simulate changes only (default)')
	console.log('  --no-alias  Skip alias-to-canonical name updates')
	console.log('  --help      Show this help')
}

function normalizeJudgeNameKey(name) {
	return String(name || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase()
}

function chooseSurvivor(candidates) {
	if (!Array.isArray(candidates) || candidates.length === 0) {
		throw new Error('No candidates provided when choosing a survivor.')
	}

	const sorted = [...candidates].sort((left, right) => {
		if (right.submissionCount !== left.submissionCount) {
			return right.submissionCount - left.submissionCount
		}

		const leftHasEmail = left.email && String(left.email).trim().length > 0 ? 1 : 0
		const rightHasEmail = right.email && String(right.email).trim().length > 0 ? 1 : 0
		if (rightHasEmail !== leftHasEmail) {
			return rightHasEmail - leftHasEmail
		}

		const leftSort = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER
		const rightSort = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER
		if (leftSort !== rightSort) {
			return leftSort - rightSort
		}

		return String(left.id).localeCompare(String(right.id), undefined, { sensitivity: 'base' })
	})

	return sorted[0]
}

async function applyAliasRules(connection, summary, aliasRules) {
	for (const rule of aliasRules) {
		const [result] = await connection.execute(
			`UPDATE es_judges
			 SET name = ?
			 WHERE LOWER(TRIM(name)) = LOWER(?)
			   AND LOWER(TRIM(name)) <> LOWER(?)`,
			[rule.to, rule.from, rule.to],
		)

		const affectedRows = Number(result?.affectedRows || 0)
		summary.aliasRowsUpdated += affectedRows
		if (affectedRows > 0) {
			summary.aliasDetails.push({ from: rule.from, to: rule.to, affectedRows })
		}
	}
}

async function loadJudgeRows(connection) {
	const [rows] = await connection.execute(
		`SELECT
			j.id AS id,
			j.event_id AS eventId,
			TRIM(j.name) AS name,
			NULLIF(TRIM(COALESCE(j.email, '')), '') AS email,
			COALESCE(j.sort_order, 0) AS sortOrder,
			COALESCE(s.submission_count, 0) AS submissionCount
		 FROM es_judges j
		 LEFT JOIN (
			SELECT judge_id, COUNT(*) AS submission_count
			FROM es_submissions
			GROUP BY judge_id
		 ) s ON s.judge_id = j.id
		 WHERE TRIM(j.name) <> ''
		 ORDER BY j.event_id ASC, j.sort_order ASC, j.id ASC`,
	)

	return rows.map((row) => ({
		id: row.id,
		eventId: row.eventId,
		name: row.name,
		email: row.email,
		sortOrder: Number(row.sortOrder || 0),
		submissionCount: Number(row.submissionCount || 0),
	}))
}

async function mergeSubmissionIntoSurvivor(connection, survivorSubmissionId, duplicateSubmissionId, duplicateSubmittedAt, summary) {
	const [savedContestantsInsert] = await connection.execute(
		`INSERT IGNORE INTO es_submission_saved_contestants (submission_id, contestant_id)
		 SELECT ?, contestant_id
		 FROM es_submission_saved_contestants
		 WHERE submission_id = ?`,
		[survivorSubmissionId, duplicateSubmissionId],
	)
	summary.savedContestantsMerged += Number(savedContestantsInsert?.affectedRows || 0)

	const [scoresInsert] = await connection.execute(
		`INSERT INTO es_submission_scores (submission_id, contestant_id, subcriterion_id, score)
		 SELECT ?, contestant_id, subcriterion_id, score
		 FROM es_submission_scores
		 WHERE submission_id = ?
		 ON DUPLICATE KEY UPDATE score = VALUES(score)`,
		[survivorSubmissionId, duplicateSubmissionId],
	)
	summary.scoreRowsMerged += Number(scoresInsert?.affectedRows || 0)

	const [detailsInsert] = await connection.execute(
		`INSERT INTO es_submission_contestant_details (submission_id, contestant_id, strand, remark, additional_info)
		 SELECT ?, contestant_id, strand, remark, additional_info
		 FROM es_submission_contestant_details
		 WHERE submission_id = ?
		 ON DUPLICATE KEY UPDATE
			strand = COALESCE(NULLIF(VALUES(strand), ''), strand),
			remark = COALESCE(NULLIF(VALUES(remark), ''), remark),
			additional_info = COALESCE(NULLIF(VALUES(additional_info), ''), additional_info)`,
		[survivorSubmissionId, duplicateSubmissionId],
	)
	summary.detailRowsMerged += Number(detailsInsert?.affectedRows || 0)

	await connection.execute(
		`UPDATE es_submissions
		 SET submitted_at = GREATEST(submitted_at, ?)
		 WHERE id = ?`,
		[duplicateSubmittedAt, survivorSubmissionId],
	)

	const [submissionDelete] = await connection.execute('DELETE FROM es_submissions WHERE id = ?', [duplicateSubmissionId])
	summary.duplicateSubmissionRowsDeleted += Number(submissionDelete?.affectedRows || 0)
	summary.submissionsMerged += 1
}

async function mergeJudgeRow(connection, survivor, duplicate, summary) {
	const [slotInsert] = await connection.execute(
		`INSERT IGNORE INTO es_presentation_slot_judges (slot_id, judge_id, sort_order)
		 SELECT slot_id, ?, sort_order
		 FROM es_presentation_slot_judges
		 WHERE judge_id = ?`,
		[survivor.id, duplicate.id],
	)
	summary.presentationSlotLinksMoved += Number(slotInsert?.affectedRows || 0)

	const [slotDelete] = await connection.execute('DELETE FROM es_presentation_slot_judges WHERE judge_id = ?', [duplicate.id])
	summary.duplicatePresentationSlotLinksDeleted += Number(slotDelete?.affectedRows || 0)

	const [duplicateSubmissions] = await connection.execute(
		`SELECT id, submitted_at
		 FROM es_submissions
		 WHERE event_id = ? AND judge_id = ?
		 ORDER BY submitted_at DESC, id DESC`,
		[duplicate.eventId, duplicate.id],
	)

	for (const duplicateSubmission of duplicateSubmissions) {
		const [survivorSubmissions] = await connection.execute(
			`SELECT id
			 FROM es_submissions
			 WHERE event_id = ? AND judge_id = ?
			 LIMIT 1`,
			[duplicate.eventId, survivor.id],
		)

		if (survivorSubmissions.length === 0) {
			const [reassign] = await connection.execute('UPDATE es_submissions SET judge_id = ? WHERE id = ?', [survivor.id, duplicateSubmission.id])
			summary.submissionsReassigned += Number(reassign?.affectedRows || 0)
			continue
		}

		await mergeSubmissionIntoSurvivor(connection, survivorSubmissions[0].id, duplicateSubmission.id, duplicateSubmission.submitted_at, summary)
	}

	const [judgeDelete] = await connection.execute('DELETE FROM es_judges WHERE id = ?', [duplicate.id])
	summary.duplicateJudgeRowsDeleted += Number(judgeDelete?.affectedRows || 0)
}

async function mergeDuplicateJudgesWithinEvent(connection, summary) {
	const judges = await loadJudgeRows(connection)
	const groups = new Map()

	for (const judge of judges) {
		const nameKey = normalizeJudgeNameKey(judge.name)
		if (!nameKey) {
			continue
		}

		const groupKey = `${judge.eventId}::${nameKey}`
		const existing = groups.get(groupKey)
		if (!existing) {
			groups.set(groupKey, [judge])
			continue
		}

		existing.push(judge)
	}

	for (const groupRows of groups.values()) {
		if (groupRows.length <= 1) {
			continue
		}

		summary.duplicateGroupsFound += 1
		const survivor = chooseSurvivor(groupRows)
		const duplicates = groupRows.filter((row) => row.id !== survivor.id)

		for (const duplicate of duplicates) {
			await mergeJudgeRow(connection, survivor, duplicate, summary)
			summary.duplicateRowsMerged += 1
		}
	}
}

async function reorderJudgeSortOrder(connection, summary) {
	const [rows] = await connection.execute(
		`SELECT id, event_id AS eventId, COALESCE(sort_order, 0) AS sortOrder, TRIM(name) AS name
		 FROM es_judges
		 ORDER BY event_id ASC, sort_order ASC, name ASC, id ASC`,
	)

	let currentEventId = null
	let nextIndex = 0

	for (const row of rows) {
		if (currentEventId !== row.eventId) {
			currentEventId = row.eventId
			nextIndex = 1
		} else {
			nextIndex += 1
		}

		if (Number(row.sortOrder || 0) === nextIndex) {
			continue
		}

		const [update] = await connection.execute('UPDATE es_judges SET sort_order = ? WHERE id = ?', [nextIndex, row.id])
		summary.judgeSortOrderUpdates += Number(update?.affectedRows || 0)
	}
}

async function reorderPresentationSlotJudgeSortOrder(connection, summary) {
	const [rows] = await connection.execute(
		`SELECT
			psj.slot_id AS slotId,
			psj.judge_id AS judgeId,
			COALESCE(psj.sort_order, 0) AS sortOrder,
			COALESCE(j.sort_order, 0) AS judgeSortOrder,
			TRIM(j.name) AS judgeName
		 FROM es_presentation_slot_judges psj
		 INNER JOIN es_judges j ON j.id = psj.judge_id
		 ORDER BY psj.slot_id ASC, j.sort_order ASC, j.name ASC, psj.judge_id ASC`,
	)

	let currentSlotId = null
	let nextIndex = 0

	for (const row of rows) {
		if (currentSlotId !== row.slotId) {
			currentSlotId = row.slotId
			nextIndex = 1
		} else {
			nextIndex += 1
		}

		if (Number(row.sortOrder || 0) === nextIndex) {
			continue
		}

		const [update] = await connection.execute('UPDATE es_presentation_slot_judges SET sort_order = ? WHERE slot_id = ? AND judge_id = ?', [nextIndex, row.slotId, row.judgeId])
		summary.slotJudgeSortOrderUpdates += Number(update?.affectedRows || 0)
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
		console.warn(`[eventscorer:fix-judges] Ignoring unknown argument(s): ${cliOptions.unknownArgs.join(' ')}`)
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

	const summary = {
		mode: cliOptions.apply ? 'apply' : 'dry-run',
		database: config.database,
		aliasRowsUpdated: 0,
		aliasDetails: [],
		duplicateGroupsFound: 0,
		duplicateRowsMerged: 0,
		duplicateJudgeRowsDeleted: 0,
		presentationSlotLinksMoved: 0,
		duplicatePresentationSlotLinksDeleted: 0,
		submissionsReassigned: 0,
		submissionsMerged: 0,
		duplicateSubmissionRowsDeleted: 0,
		savedContestantsMerged: 0,
		scoreRowsMerged: 0,
		detailRowsMerged: 0,
		judgeSortOrderUpdates: 0,
		slotJudgeSortOrderUpdates: 0,
	}

	try {
		await connection.beginTransaction()

		if (!cliOptions.noAlias) {
			await applyAliasRules(connection, summary, DEFAULT_ALIAS_RULES)
		}

		await mergeDuplicateJudgesWithinEvent(connection, summary)
		await reorderJudgeSortOrder(connection, summary)
		await reorderPresentationSlotJudgeSortOrder(connection, summary)

		if (cliOptions.apply) {
			await connection.commit()
			console.log('[eventscorer:fix-judges] Changes committed.')
		} else {
			await connection.rollback()
			console.log('[eventscorer:fix-judges] Dry-run complete (rolled back).')
		}

		console.log('[eventscorer:fix-judges] Summary:')
		console.log(JSON.stringify(summary, null, 2))
	} catch (error) {
		try {
			await connection.rollback()
		} catch {
			// Best effort rollback only.
		}
		throw error
	} finally {
		await connection.end()
	}
}

run().catch((error) => {
	console.error('[eventscorer:fix-judges] Failed:', error.message)
	process.exitCode = 1
})
