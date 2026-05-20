const fs = require('fs/promises')
const path = require('path')
const { randomBytes, randomUUID } = require('crypto')
const { applyDatabaseTimezone, mergeDumpFile, parseMergeCliArgs } = require('./lib/eventscorer-dump-merge')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const TABLE_EVENTS = 'es_events'
const TABLE_CONTESTANTS = 'es_contestants'
const TABLE_CONTESTANT_PARTICIPANTS = 'es_contestant_participants'
const TABLE_JUDGES = 'es_judges'
const TABLE_CRITERIA = 'es_criteria'
const TABLE_SUBCRITERIA = 'es_subcriteria'
const TABLE_PRESENTATION_SLOTS = 'es_presentation_slots'
const TABLE_PRESENTATION_SLOT_JUDGES = 'es_presentation_slot_judges'
const TABLE_SUBMISSIONS = 'es_submissions'
const TABLE_SUBMISSION_SAVED_CONTESTANTS = 'es_submission_saved_contestants'
const TABLE_SUBMISSION_SCORES = 'es_submission_scores'

const DEFAULT_RUBRIC_LEGEND = [
	{ score: 4, label: 'Excellent' },
	{ score: 3, label: 'Exceeds Expectations' },
	{ score: 2, label: 'Meets Expectations' },
	{ score: 1, label: 'Meets Expectations Sometimes' },
	{ score: 0, label: 'Does Not Meet Expectations' },
]

const DEFAULT_EVENTS_JSON_PATH = path.join(__dirname, '..', 'screens', 'eventscorer', 'data', 'events.json')

function compactWhitespace(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
}

function parseIntegerWithFallback(value, fallback) {
	const parsed = Number.parseInt(String(value || ''), 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseEventScoringType(value) {
	if (typeof value !== 'string') return null
	const normalized = compactWhitespace(value)
		.toLowerCase()
		.replace(/[_\s]+/g, '-')

	if (normalized === 'standard') return 'standard'
	if (normalized === 'final-oral-defense') return 'final-oral-defense'
	return null
}

function parseContestantEntryType(value) {
	if (typeof value !== 'string') return 'group'
	const normalized = compactWhitespace(value).toLowerCase()
	return normalized === 'individual' ? 'individual' : 'group'
}

function parseProgramTag(value) {
	if (typeof value !== 'string') return null
	const normalized = compactWhitespace(value).toUpperCase()
	return normalized === 'BSINT' || normalized === 'BSCS' ? normalized : null
}

function toPositiveNumberOrNull(value) {
	const numeric = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(numeric) || numeric <= 0) return null
	return Math.round(numeric * 1000) / 1000
}

function normalizeRubricLegend(rawLegend) {
	if (!Array.isArray(rawLegend)) {
		return [...DEFAULT_RUBRIC_LEGEND]
	}

	const normalized = rawLegend
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null
			}

			const score = typeof entry.score === 'number' ? entry.score : Number(entry.score)
			const label = compactWhitespace(entry.label)

			if (!Number.isFinite(score) || score < 0 || !label) {
				return null
			}

			return {
				score: Math.round(score * 1000) / 1000,
				label,
			}
		})
		.filter((entry) => entry !== null)

	if (normalized.length === 0) {
		return [...DEFAULT_RUBRIC_LEGEND]
	}

	return normalized.sort((left, right) => {
		if (right.score !== left.score) {
			return right.score - left.score
		}

		return left.label.localeCompare(right.label)
	})
}

function normalizeIsoTimestamp(value, fallbackIso) {
	if (typeof value !== 'string') {
		return fallbackIso || new Date().toISOString()
	}

	const raw = value.trim()
	if (!raw) {
		return fallbackIso || new Date().toISOString()
	}

	const withT = raw.includes('T') ? raw : raw.replace(' ', 'T')
	const withTimezone = /z$/i.test(withT) ? withT : `${withT}Z`
	const parsed = new Date(withTimezone)

	if (!Number.isFinite(parsed.getTime())) {
		return fallbackIso || new Date().toISOString()
	}

	return parsed.toISOString()
}

function toMySqlDateTime(isoString) {
	const parsed = new Date(isoString)
	if (!Number.isFinite(parsed.getTime())) {
		return toMySqlDateTime(new Date().toISOString())
	}

	const year = parsed.getUTCFullYear()
	const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
	const day = String(parsed.getUTCDate()).padStart(2, '0')
	const hour = String(parsed.getUTCHours()).padStart(2, '0')
	const minute = String(parsed.getUTCMinutes()).padStart(2, '0')
	const second = String(parsed.getUTCSeconds()).padStart(2, '0')
	const millisecond = String(parsed.getUTCMilliseconds()).padStart(3, '0')

	return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`
}

function uniqueValues(values) {
	return Array.from(new Set(values))
}

function chunkArray(items, size) {
	if (size <= 0 || items.length === 0) return [items]
	const chunks = []
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size))
	}
	return chunks
}

function generateUniqueId(rawValue, usedIds) {
	const preferred = compactWhitespace(rawValue)
	if (preferred && !usedIds.has(preferred)) {
		usedIds.add(preferred)
		return preferred
	}

	let generated = randomUUID()
	while (usedIds.has(generated)) {
		generated = randomUUID()
	}

	usedIds.add(generated)
	return generated
}

function generateUniqueToken(rawValue, usedTokens) {
	const preferred = compactWhitespace(rawValue)
	if (preferred && !usedTokens.has(preferred)) {
		usedTokens.add(preferred)
		return preferred
	}

	let generated = randomBytes(24).toString('hex')
	while (usedTokens.has(generated)) {
		generated = randomBytes(24).toString('hex')
	}

	usedTokens.add(generated)
	return generated
}

function inferEventScoringType(criteria) {
	const normalizedNames = criteria.map((criterion) => criterion.name.trim().toLowerCase())
	const hasGroup = normalizedNames.includes('group presentation')
	const hasIndividual = normalizedNames.includes('individual presentation')
	return hasGroup && hasIndividual ? 'final-oral-defense' : 'standard'
}

function normalizeScores(rawScores, contestantIdMap, subCriterionIdMap, subCriterionMaxById) {
	if (!rawScores || typeof rawScores !== 'object') {
		return {}
	}

	const normalizedScores = {}

	for (const [rawContestantId, rawSubScores] of Object.entries(rawScores)) {
		const contestantId = contestantIdMap.get(compactWhitespace(rawContestantId))
		if (!contestantId || !rawSubScores || typeof rawSubScores !== 'object') {
			continue
		}

		const contestantScores = {}

		for (const [rawSubCriterionId, rawScore] of Object.entries(rawSubScores)) {
			const subCriterionId = subCriterionIdMap.get(compactWhitespace(rawSubCriterionId))
			if (!subCriterionId) {
				continue
			}

			const numericScore = Number(rawScore)
			if (!Number.isFinite(numericScore)) {
				continue
			}

			const maxScore = subCriterionMaxById.get(subCriterionId) ?? Math.max(0, numericScore)
			const clampedScore = Math.max(0, Math.min(numericScore, maxScore))
			contestantScores[subCriterionId] = Math.round(clampedScore * 1000) / 1000
		}

		if (Object.keys(contestantScores).length > 0) {
			normalizedScores[contestantId] = contestantScores
		}
	}

	return normalizedScores
}

function inferSavedContestantIds(scores) {
	const savedIds = []

	for (const [contestantId, subScores] of Object.entries(scores)) {
		if (!subScores || typeof subScores !== 'object') {
			continue
		}

		const hasPositive = Object.values(subScores).some((value) => Number(value) > 0)
		if (hasPositive) {
			savedIds.push(contestantId)
		}
	}

	return uniqueValues(savedIds)
}

function normalizeEvent(rawEvent, used) {
	if (!rawEvent || typeof rawEvent !== 'object') {
		return null
	}

	const eventTitle = compactWhitespace(rawEvent.title)
	if (!eventTitle) {
		return null
	}

	const eventId = generateUniqueId(rawEvent.id, used.eventIds)
	const description = compactWhitespace(rawEvent.description)
	const createdBy = compactWhitespace(rawEvent.createdBy)
	const createdAtIso = normalizeIsoTimestamp(rawEvent.createdAt)

	const contestantIdMap = new Map()
	const contestants = []
	const sourceContestants = Array.isArray(rawEvent.contestants) ? rawEvent.contestants : []

	for (const rawContestant of sourceContestants) {
		if (!rawContestant || typeof rawContestant !== 'object') continue

		const name = compactWhitespace(rawContestant.name)
		if (!name) continue

		const sourceContestantId = compactWhitespace(rawContestant.id)
		const contestantId = generateUniqueId(sourceContestantId, used.contestantIds)
		if (sourceContestantId && !contestantIdMap.has(sourceContestantId)) {
			contestantIdMap.set(sourceContestantId, contestantId)
		}

		const entryType = parseContestantEntryType(rawContestant.entryType)
		const participants = Array.isArray(rawContestant.participants) ? rawContestant.participants.map((value) => compactWhitespace(value)).filter((value) => value.length > 0) : []

		contestants.push({
			id: contestantId,
			name,
			entryType,
			programTag: parseProgramTag(rawContestant.programTag),
			participants: entryType === 'group' ? participants : [],
		})
	}

	if (contestants.length === 0) {
		return null
	}

	const judgeIdMap = new Map()
	const judges = []
	const sourceJudges = Array.isArray(rawEvent.judges) ? rawEvent.judges : []

	for (const rawJudge of sourceJudges) {
		if (!rawJudge || typeof rawJudge !== 'object') continue

		const name = compactWhitespace(rawJudge.name)
		if (!name) continue

		const sourceJudgeId = compactWhitespace(rawJudge.id)
		const judgeId = generateUniqueId(sourceJudgeId, used.judgeIds)
		if (sourceJudgeId && !judgeIdMap.has(sourceJudgeId)) {
			judgeIdMap.set(sourceJudgeId, judgeId)
		}

		judges.push({
			id: judgeId,
			name,
			email: compactWhitespace(rawJudge.email) || null,
			token: generateUniqueToken(rawJudge.token, used.judgeTokens),
		})
	}

	if (judges.length === 0) {
		return null
	}

	const criterionIdMap = new Map()
	const subCriterionIdMap = new Map()
	const subCriterionMaxById = new Map()
	const criteria = []
	const sourceCriteria = Array.isArray(rawEvent.criteria) ? rawEvent.criteria : []

	for (const rawCriterion of sourceCriteria) {
		if (!rawCriterion || typeof rawCriterion !== 'object') continue

		const criterionName = compactWhitespace(rawCriterion.name)
		if (!criterionName) continue

		const sourceCriterionId = compactWhitespace(rawCriterion.id)
		const criterionId = generateUniqueId(sourceCriterionId, used.criterionIds)
		if (sourceCriterionId && !criterionIdMap.has(sourceCriterionId)) {
			criterionIdMap.set(sourceCriterionId, criterionId)
		}

		const sourceSubCriteria = Array.isArray(rawCriterion.subCriteria) ? rawCriterion.subCriteria : []
		const subCriteria = []

		for (const rawSubCriterion of sourceSubCriteria) {
			if (!rawSubCriterion || typeof rawSubCriterion !== 'object') continue

			const subCriterionName = compactWhitespace(rawSubCriterion.name)
			const subCriterionMaxScore = toPositiveNumberOrNull(rawSubCriterion.maxScore)

			if (!subCriterionName || subCriterionMaxScore === null) continue

			const sourceSubCriterionId = compactWhitespace(rawSubCriterion.id)
			const subCriterionId = generateUniqueId(sourceSubCriterionId, used.subCriterionIds)
			if (sourceSubCriterionId && !subCriterionIdMap.has(sourceSubCriterionId)) {
				subCriterionIdMap.set(sourceSubCriterionId, subCriterionId)
			}

			subCriterionMaxById.set(subCriterionId, subCriterionMaxScore)
			subCriteria.push({
				id: subCriterionId,
				name: subCriterionName,
				maxScore: subCriterionMaxScore,
			})
		}

		if (subCriteria.length === 0) continue

		const explicitCriterionMax = toPositiveNumberOrNull(rawCriterion.maxScore)
		const computedCriterionMax = Math.round(subCriteria.reduce((sum, subCriterion) => sum + subCriterion.maxScore, 0) * 1000) / 1000

		criteria.push({
			id: criterionId,
			name: criterionName,
			maxScore: explicitCriterionMax ?? computedCriterionMax,
			subCriteria,
		})
	}

	if (criteria.length === 0) {
		return null
	}

	const presentationSlots = []
	const usedContestantIdsInSlots = new Set()
	const sourceSlots = Array.isArray(rawEvent.presentationSlots) ? rawEvent.presentationSlots : []

	for (const rawSlot of sourceSlots) {
		if (!rawSlot || typeof rawSlot !== 'object') continue

		const rawContestantId = compactWhitespace(rawSlot.contestantId)
		const contestantId = contestantIdMap.get(rawContestantId)
		if (!contestantId || usedContestantIdsInSlots.has(contestantId)) continue

		usedContestantIdsInSlots.add(contestantId)

		const sourceSlotId = compactWhitespace(rawSlot.id)
		const slotId = generateUniqueId(sourceSlotId, used.slotIds)

		const mappedJudgeIds = Array.isArray(rawSlot.judgeIds) ? rawSlot.judgeIds.map((judgeId) => judgeIdMap.get(compactWhitespace(judgeId))).filter((judgeId) => typeof judgeId === 'string' && judgeId.length > 0) : []

		presentationSlots.push({
			id: slotId,
			label: compactWhitespace(rawSlot.label) || `Slot ${presentationSlots.length + 1}`,
			contestantId,
			judgeIds: uniqueValues(mappedJudgeIds),
		})
	}

	const sourceSubmissions = Array.isArray(rawEvent.submissions) ? rawEvent.submissions : []
	const latestSubmissionByJudge = new Map()

	for (const rawSubmission of sourceSubmissions) {
		if (!rawSubmission || typeof rawSubmission !== 'object') continue

		const judgeId = judgeIdMap.get(compactWhitespace(rawSubmission.judgeId))
		if (!judgeId) continue

		const submittedAt = normalizeIsoTimestamp(rawSubmission.submittedAt, createdAtIso)
		const scores = normalizeScores(rawSubmission.scores, contestantIdMap, subCriterionIdMap, subCriterionMaxById)

		const explicitSavedContestantIds = Array.isArray(rawSubmission.savedContestantIds) ? uniqueValues(rawSubmission.savedContestantIds.map((contestantId) => contestantIdMap.get(compactWhitespace(contestantId))).filter((contestantId) => typeof contestantId === 'string' && contestantId.length > 0)) : []

		const savedContestantIds = explicitSavedContestantIds.length > 0 ? explicitSavedContestantIds : inferSavedContestantIds(scores)

		const normalizedSubmission = {
			judgeId,
			submittedAt,
			scores,
			savedContestantIds,
		}

		const existing = latestSubmissionByJudge.get(judgeId)
		if (!existing) {
			latestSubmissionByJudge.set(judgeId, normalizedSubmission)
			continue
		}

		const existingTime = new Date(existing.submittedAt).getTime()
		const currentTime = new Date(submittedAt).getTime()
		if (!Number.isFinite(existingTime) || currentTime >= existingTime) {
			latestSubmissionByJudge.set(judgeId, normalizedSubmission)
		}
	}

	const eventScoringType = parseEventScoringType(rawEvent.eventScoringType) ?? inferEventScoringType(criteria)
	const rubricLegend = normalizeRubricLegend(rawEvent.rubricLegend)

	return {
		id: eventId,
		title: eventTitle,
		description: description || null,
		createdBy: createdBy || null,
		eventScoringType,
		rubricLegend,
		createdAt: createdAtIso,
		contestants,
		judges,
		criteria,
		presentationSlots,
		submissions: Array.from(latestSubmissionByJudge.values()),
	}
}

function normalizeEvents(sourceEvents) {
	const used = {
		eventIds: new Set(),
		contestantIds: new Set(),
		judgeIds: new Set(),
		criterionIds: new Set(),
		subCriterionIds: new Set(),
		slotIds: new Set(),
		judgeTokens: new Set(),
	}

	const normalized = []

	for (const rawEvent of sourceEvents) {
		const event = normalizeEvent(rawEvent, used)
		if (event) {
			normalized.push(event)
		}
	}

	return normalized
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

async function insertBatch(connection, sqlPrefix, rows, chunkSize = 250) {
	if (!Array.isArray(rows) || rows.length === 0) {
		return
	}

	const placeholder = `(${new Array(rows[0].length).fill('?').join(',')})`

	for (const chunk of chunkArray(rows, chunkSize)) {
		const values = []
		for (const row of chunk) {
			values.push(...row)
		}

		const placeholders = new Array(chunk.length).fill(placeholder).join(',')
		await connection.execute(`${sqlPrefix} VALUES ${placeholders}`, values)
	}
}

async function ensureRubricLegendColumn(connection) {
	const [rows] = await connection.query(
		`SELECT COUNT(*) AS total
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?`,
		[TABLE_EVENTS, 'rubric_legend_json'],
	)

	const exists = Number(rows?.[0]?.total || 0) > 0
	if (!exists) {
		await connection.query(`ALTER TABLE ${TABLE_EVENTS} ADD COLUMN rubric_legend_json LONGTEXT NULL AFTER event_scoring_type`)
	}
}

async function importNormalizedEvent(connection, event) {
	await connection.execute(`INSERT INTO ${TABLE_EVENTS} (id, title, description, created_by, event_scoring_type, rubric_legend_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
		event.id,
		event.title,
		event.description,
		event.createdBy,
		event.eventScoringType,
		JSON.stringify(normalizeRubricLegend(event.rubricLegend)),
		toMySqlDateTime(event.createdAt),
	])

	await insertBatch(
		connection,
		`INSERT INTO ${TABLE_CONTESTANTS} (id, event_id, name, entry_type, program_tag, sort_order)`,
		event.contestants.map((contestant, index) => [contestant.id, event.id, contestant.name, contestant.entryType, contestant.programTag, index + 1]),
	)

	const participantRows = []
	for (const contestant of event.contestants) {
		for (const [index, participantName] of contestant.participants.entries()) {
			participantRows.push([contestant.id, participantName, index + 1])
		}
	}

	await insertBatch(connection, `INSERT INTO ${TABLE_CONTESTANT_PARTICIPANTS} (contestant_id, participant_name, sort_order)`, participantRows)

	await insertBatch(
		connection,
		`INSERT INTO ${TABLE_JUDGES} (id, event_id, name, email, token, sort_order)`,
		event.judges.map((judge, index) => [judge.id, event.id, judge.name, judge.email, judge.token, index + 1]),
	)

	await insertBatch(
		connection,
		`INSERT INTO ${TABLE_CRITERIA} (id, event_id, name, max_score, sort_order)`,
		event.criteria.map((criterion, index) => [criterion.id, event.id, criterion.name, criterion.maxScore, index + 1]),
	)

	const subCriterionRows = []
	for (const criterion of event.criteria) {
		for (const [index, subCriterion] of criterion.subCriteria.entries()) {
			subCriterionRows.push([subCriterion.id, criterion.id, subCriterion.name, subCriterion.maxScore, index + 1])
		}
	}

	await insertBatch(connection, `INSERT INTO ${TABLE_SUBCRITERIA} (id, criterion_id, name, max_score, sort_order)`, subCriterionRows)

	await insertBatch(
		connection,
		`INSERT INTO ${TABLE_PRESENTATION_SLOTS} (id, event_id, label, contestant_id, sort_order)`,
		event.presentationSlots.map((slot, index) => [slot.id, event.id, slot.label, slot.contestantId, index + 1]),
	)

	const slotJudgeRows = []
	for (const slot of event.presentationSlots) {
		for (const [index, judgeId] of slot.judgeIds.entries()) {
			slotJudgeRows.push([slot.id, judgeId, index + 1])
		}
	}

	await insertBatch(connection, `INSERT INTO ${TABLE_PRESENTATION_SLOT_JUDGES} (slot_id, judge_id, sort_order)`, slotJudgeRows)

	for (const submission of event.submissions) {
		const [result] = await connection.execute(`INSERT INTO ${TABLE_SUBMISSIONS} (event_id, judge_id, submitted_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE submitted_at = VALUES(submitted_at), id = LAST_INSERT_ID(id)`, [event.id, submission.judgeId, toMySqlDateTime(submission.submittedAt)])

		const submissionId = Number(result.insertId)
		if (!Number.isFinite(submissionId) || submissionId <= 0) {
			continue
		}

		await connection.execute(`DELETE FROM ${TABLE_SUBMISSION_SAVED_CONTESTANTS} WHERE submission_id = ?`, [submissionId])
		await connection.execute(`DELETE FROM ${TABLE_SUBMISSION_SCORES} WHERE submission_id = ?`, [submissionId])

		await insertBatch(
			connection,
			`INSERT INTO ${TABLE_SUBMISSION_SAVED_CONTESTANTS} (submission_id, contestant_id)`,
			submission.savedContestantIds.map((contestantId) => [submissionId, contestantId]),
		)

		const scoreRows = []
		for (const [contestantId, scoresBySubCriterion] of Object.entries(submission.scores)) {
			if (!scoresBySubCriterion || typeof scoresBySubCriterion !== 'object') continue

			for (const [subCriterionId, score] of Object.entries(scoresBySubCriterion)) {
				scoreRows.push([submissionId, contestantId, subCriterionId, score])
			}
		}

		await insertBatch(connection, `INSERT INTO ${TABLE_SUBMISSION_SCORES} (submission_id, contestant_id, subcriterion_id, score)`, scoreRows)
	}
}

async function importEventsJsonIfDatabaseIsEmpty(connection) {
	const enabled = String(process.env.EVENTSCORER_IMPORT_EVENTS_JSON || '1').trim() !== '0'
	if (!enabled) {
		return { status: 'disabled' }
	}

	const [[countRow]] = await connection.query(`SELECT COUNT(*) AS total FROM ${TABLE_EVENTS}`)
	const existingEvents = Number(countRow?.total || 0)

	if (existingEvents > 0) {
		return { status: 'skipped-not-empty', existingEvents }
	}

	const jsonPath = process.env.EVENTSCORER_EVENTS_JSON_PATH || DEFAULT_EVENTS_JSON_PATH

	let rawFile
	try {
		rawFile = await fs.readFile(jsonPath, 'utf8')
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return { status: 'missing-json', jsonPath }
		}
		throw error
	}

	if (!rawFile.trim()) {
		return { status: 'empty-json', jsonPath }
	}

	let parsedStore
	try {
		parsedStore = JSON.parse(rawFile)
	} catch {
		return { status: 'invalid-json', jsonPath }
	}

	const sourceEvents = Array.isArray(parsedStore?.events) ? parsedStore.events : []
	if (sourceEvents.length === 0) {
		return { status: 'no-events', jsonPath }
	}

	const normalizedEvents = normalizeEvents(sourceEvents)
	if (normalizedEvents.length === 0) {
		return {
			status: 'no-valid-events',
			jsonPath,
			totalEventsInFile: sourceEvents.length,
		}
	}

	let imported = 0
	const failures = []

	for (const event of normalizedEvents) {
		await connection.beginTransaction()

		try {
			await importNormalizedEvent(connection, event)
			await connection.commit()
			imported += 1
		} catch (error) {
			await connection.rollback()
			failures.push({ eventId: event.id, eventTitle: event.title, message: error.message })
			console.warn(`[eventscorer:migrate] Skipped event ${event.title}: ${error.message}`)
		}
	}

	return {
		status: 'imported',
		jsonPath,
		totalEventsInFile: sourceEvents.length,
		normalizedEvents: normalizedEvents.length,
		imported,
		failures,
	}
}

async function run() {
	const cliOptions = parseMergeCliArgs(process.argv.slice(2))
	if (cliOptions.errors.length > 0) {
		throw new Error(cliOptions.errors.join(' '))
	}

	if (cliOptions.unknownArgs.length > 0) {
		console.warn(`[eventscorer:migrate] Ignoring unknown argument(s): ${cliOptions.unknownArgs.join(' ')}`)
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
		await ensureRubricLegendColumn(connection)
		await applyDatabaseTimezone(connection, cliOptions.timezone, (message) => console.log(`[eventscorer:migrate] ${message}`))

		const sourcePaths = cliOptions.sourcePaths.length > 0 ? cliOptions.sourcePaths : cliOptions.sourcePath ? [cliOptions.sourcePath] : []

		if (sourcePaths.length > 0) {
			let totalProcessedRows = 0
			let totalProcessedStatements = 0
			let totalAffectedRows = 0
			let totalWarnings = 0

			for (let index = 0; index < sourcePaths.length; index += 1) {
				const sourcePath = sourcePaths[index]
				console.log(`[eventscorer:migrate] Source ${index + 1}/${sourcePaths.length}: ${sourcePath}`)

				const mergeReport = await mergeDumpFile(connection, sourcePath, {
					dryRun: cliOptions.dryRun,
					batchSize: cliOptions.batchSize,
					tablePrefix: cliOptions.tablePrefix,
					includeAllTables: cliOptions.includeAllTables,
					logger: (message) => console.log(`[eventscorer:migrate] ${message}`),
				})

				totalProcessedRows += mergeReport.processedRows
				totalProcessedStatements += mergeReport.processedStatements
				totalAffectedRows += mergeReport.affectedRows
				totalWarnings += mergeReport.parseWarnings.length + mergeReport.executionWarnings.length
			}

			console.log(`[eventscorer:migrate] ${cliOptions.dryRun ? 'Dry-run merge complete' : 'Dump merge complete'} across ${sourcePaths.length} dump(s): ${totalProcessedRows} row tuple(s) processed across ${totalProcessedStatements} batch query(ies), ${totalAffectedRows} affected rows.`)

			if (totalWarnings > 0) {
				console.log(`[eventscorer:migrate] Dump merge finished with ${totalWarnings} warning(s).`)
			}
		}

		const shouldImportEventsJson = !(sourcePaths.length > 0 && cliOptions.dryRun)
		const importSummary = shouldImportEventsJson ? await importEventsJsonIfDatabaseIsEmpty(connection) : { status: 'skipped-merge-dry-run' }

		console.log(`[eventscorer:migrate] Schema ready at ${config.host}:${config.port}/${config.database}`)

		if (importSummary.status === 'imported') {
			console.log(`[eventscorer:migrate] Imported ${importSummary.imported}/${importSummary.normalizedEvents} valid events from ${importSummary.jsonPath}`)

			if (importSummary.failures.length > 0) {
				console.log(`[eventscorer:migrate] ${importSummary.failures.length} event(s) failed to import. See warnings above.`)
			}
		} else if (importSummary.status === 'skipped-not-empty') {
			console.log(`[eventscorer:migrate] Skipped events.json import because database already has ${importSummary.existingEvents} event(s).`)
		} else if (importSummary.status === 'missing-json') {
			console.log(`[eventscorer:migrate] events.json not found at ${importSummary.jsonPath}. Schema migration completed.`)
		} else if (importSummary.status === 'disabled') {
			console.log('[eventscorer:migrate] events.json import disabled (EVENTSCORER_IMPORT_EVENTS_JSON=0).')
		} else if (importSummary.status === 'skipped-merge-dry-run') {
			console.log('[eventscorer:migrate] Skipped events.json import because --merge-dump was run with --dry-run.')
		} else {
			console.log(`[eventscorer:migrate] events.json import result: ${importSummary.status}.`)
		}
	} finally {
		await connection.end()
	}
}

run().catch((error) => {
	console.error('[eventscorer:migrate] Failed:', error.message)
	process.exitCode = 1
})
