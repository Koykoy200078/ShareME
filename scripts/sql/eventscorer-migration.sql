-- EventScorer schema migration
-- Idempotent and self-healing:
-- 1) Creates/repairs tables and columns
-- 2) Migrates legacy participant-table naming
-- 3) Normalizes existing data on every run
-- 4) Repairs common integrity issues (orphans, clamped scores, inferred saved contestants)

SET @schema_name := DATABASE();

CREATE TABLE IF NOT EXISTS es_events (
	id VARCHAR(36) NOT NULL,
	title VARCHAR(255) NOT NULL,
	description TEXT NULL,
	created_by VARCHAR(255) NULL,
	event_scoring_type VARCHAR(32) NOT NULL DEFAULT 'standard',
	rubric_legend_json LONGTEXT NULL,
	created_at DATETIME(3) NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_contestants (
	id VARCHAR(36) NOT NULL,
	event_id VARCHAR(36) NOT NULL,
	name VARCHAR(255) NOT NULL,
	entry_type VARCHAR(32) NOT NULL DEFAULT 'group',
	program_tag VARCHAR(16) NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_contestants_event_order (event_id, sort_order),
	CONSTRAINT fk_es_contestants_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compatibility fix: some legacy setups used a typo table name.
SET @has_es_contestant_participants := (
	SELECT COUNT(*)
	FROM information_schema.tables
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestant_participants'
);
SET @has_es_contestants_participants := (
	SELECT COUNT(*)
	FROM information_schema.tables
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestants_participants'
);
SET @rename_participants_sql := IF(
	@has_es_contestant_participants = 0 AND @has_es_contestants_participants > 0,
	'RENAME TABLE es_contestants_participants TO es_contestant_participants',
	'SELECT 1'
);
PREPARE stmt_rename_participants FROM @rename_participants_sql;
EXECUTE stmt_rename_participants;
DEALLOCATE PREPARE stmt_rename_participants;

CREATE TABLE IF NOT EXISTS es_contestant_participants (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	contestant_id VARCHAR(36) NOT NULL,
	participant_name VARCHAR(255) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_contestant_participants_contestant_order (contestant_id, sort_order),
	CONSTRAINT fk_es_contestant_participants_contestant FOREIGN KEY (contestant_id) REFERENCES es_contestants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_judges (
	id VARCHAR(36) NOT NULL,
	event_id VARCHAR(36) NOT NULL,
	name VARCHAR(255) NOT NULL,
	email VARCHAR(255) NULL,
	token VARCHAR(128) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_es_judges_token (token),
	INDEX idx_es_judges_event_order (event_id, sort_order),
	CONSTRAINT fk_es_judges_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_criteria (
	id VARCHAR(36) NOT NULL,
	event_id VARCHAR(36) NOT NULL,
	name VARCHAR(255) NOT NULL,
	max_score DECIMAL(10,3) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_criteria_event_order (event_id, sort_order),
	CONSTRAINT fk_es_criteria_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_subcriteria (
	id VARCHAR(36) NOT NULL,
	criterion_id VARCHAR(36) NOT NULL,
	name VARCHAR(255) NOT NULL,
	max_score DECIMAL(10,3) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_subcriteria_criterion_order (criterion_id, sort_order),
	CONSTRAINT fk_es_subcriteria_criterion FOREIGN KEY (criterion_id) REFERENCES es_criteria(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_presentation_slots (
	id VARCHAR(36) NOT NULL,
	event_id VARCHAR(36) NOT NULL,
	label VARCHAR(255) NOT NULL,
	contestant_id VARCHAR(36) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_es_presentation_slots_event_contestant (event_id, contestant_id),
	INDEX idx_es_presentation_slots_event_order (event_id, sort_order),
	CONSTRAINT fk_es_presentation_slots_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_presentation_slots_contestant FOREIGN KEY (contestant_id) REFERENCES es_contestants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_presentation_slot_judges (
	slot_id VARCHAR(36) NOT NULL,
	judge_id VARCHAR(36) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (slot_id, judge_id),
	INDEX idx_es_presentation_slot_judges_judge (judge_id),
	CONSTRAINT fk_es_presentation_slot_judges_slot FOREIGN KEY (slot_id) REFERENCES es_presentation_slots(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_presentation_slot_judges_judge FOREIGN KEY (judge_id) REFERENCES es_judges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_submissions (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	event_id VARCHAR(36) NOT NULL,
	judge_id VARCHAR(36) NOT NULL,
	submitted_at DATETIME(3) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_es_submissions_event_judge (event_id, judge_id),
	INDEX idx_es_submissions_event (event_id),
	CONSTRAINT fk_es_submissions_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_submissions_judge FOREIGN KEY (judge_id) REFERENCES es_judges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_submission_saved_contestants (
	submission_id BIGINT UNSIGNED NOT NULL,
	contestant_id VARCHAR(36) NOT NULL,
	PRIMARY KEY (submission_id, contestant_id),
	INDEX idx_es_submission_saved_contestants_contestant (contestant_id),
	CONSTRAINT fk_es_submission_saved_contestants_submission FOREIGN KEY (submission_id) REFERENCES es_submissions(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_submission_saved_contestants_contestant FOREIGN KEY (contestant_id) REFERENCES es_contestants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_submission_scores (
	submission_id BIGINT UNSIGNED NOT NULL,
	contestant_id VARCHAR(36) NOT NULL,
	subcriterion_id VARCHAR(36) NOT NULL,
	score DECIMAL(10,3) NOT NULL,
	PRIMARY KEY (submission_id, contestant_id, subcriterion_id),
	INDEX idx_es_submission_scores_contestant (contestant_id),
	INDEX idx_es_submission_scores_subcriterion (subcriterion_id),
	CONSTRAINT fk_es_submission_scores_submission FOREIGN KEY (submission_id) REFERENCES es_submissions(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_submission_scores_contestant FOREIGN KEY (contestant_id) REFERENCES es_contestants(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_submission_scores_subcriterion FOREIGN KEY (subcriterion_id) REFERENCES es_subcriteria(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compatibility: es_contestant_participants may still use legacy column `name`.
SET @has_participant_name_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestant_participants'
	  AND column_name = 'participant_name'
);
SET @has_legacy_name_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestant_participants'
	  AND column_name = 'name'
);
SET @participants_column_rename_sql := IF(
	@has_participant_name_column = 0 AND @has_legacy_name_column > 0,
	'ALTER TABLE es_contestant_participants CHANGE COLUMN name participant_name VARCHAR(255) NOT NULL',
	'SELECT 1'
);
PREPARE stmt_participants_column_rename FROM @participants_column_rename_sql;
EXECUTE stmt_participants_column_rename;
DEALLOCATE PREPARE stmt_participants_column_rename;

SET @has_participant_name_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestant_participants'
	  AND column_name = 'participant_name'
);
SET @participants_column_add_sql := IF(
	@has_participant_name_column = 0,
	'ALTER TABLE es_contestant_participants ADD COLUMN participant_name VARCHAR(255) NOT NULL',
	'SELECT 1'
);
PREPARE stmt_participants_column_add FROM @participants_column_add_sql;
EXECUTE stmt_participants_column_add;
DEALLOCATE PREPARE stmt_participants_column_add;

SET @has_entry_type_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestants'
	  AND column_name = 'entry_type'
);
SET @contestants_entry_type_add_sql := IF(
	@has_entry_type_column = 0,
	'ALTER TABLE es_contestants ADD COLUMN entry_type VARCHAR(32) NOT NULL DEFAULT ''group'' AFTER name',
	'SELECT 1'
);
PREPARE stmt_contestants_entry_type_add FROM @contestants_entry_type_add_sql;
EXECUTE stmt_contestants_entry_type_add;
DEALLOCATE PREPARE stmt_contestants_entry_type_add;

SET @has_program_tag_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_contestants'
	  AND column_name = 'program_tag'
);
SET @contestants_program_tag_add_sql := IF(
	@has_program_tag_column = 0,
	'ALTER TABLE es_contestants ADD COLUMN program_tag VARCHAR(16) NULL AFTER entry_type',
	'SELECT 1'
);
PREPARE stmt_contestants_program_tag_add FROM @contestants_program_tag_add_sql;
EXECUTE stmt_contestants_program_tag_add;
DEALLOCATE PREPARE stmt_contestants_program_tag_add;

SET @has_event_scoring_type_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_events'
	  AND column_name = 'event_scoring_type'
);
SET @events_scoring_type_add_sql := IF(
	@has_event_scoring_type_column = 0,
	'ALTER TABLE es_events ADD COLUMN event_scoring_type VARCHAR(32) NOT NULL DEFAULT ''standard'' AFTER created_by',
	'SELECT 1'
);
PREPARE stmt_events_scoring_type_add FROM @events_scoring_type_add_sql;
EXECUTE stmt_events_scoring_type_add;
DEALLOCATE PREPARE stmt_events_scoring_type_add;

SET @has_rubric_legend_json_column := (
	SELECT COUNT(*)
	FROM information_schema.columns
	WHERE table_schema = @schema_name
	  AND table_name = 'es_events'
	  AND column_name = 'rubric_legend_json'
);
SET @events_rubric_legend_add_sql := IF(
	@has_rubric_legend_json_column = 0,
	'ALTER TABLE es_events ADD COLUMN rubric_legend_json LONGTEXT NULL AFTER event_scoring_type',
	'SELECT 1'
);
PREPARE stmt_events_rubric_legend_add FROM @events_rubric_legend_add_sql;
EXECUTE stmt_events_rubric_legend_add;
DEALLOCATE PREPARE stmt_events_rubric_legend_add;

-- Data normalization + integrity repair (safe to rerun)
START TRANSACTION;

UPDATE es_events
SET
	title = TRIM(title),
	description = NULLIF(TRIM(COALESCE(description, '')), ''),
	created_by = NULLIF(TRIM(COALESCE(created_by, '')), ''),
	event_scoring_type = CASE
		WHEN LOWER(REPLACE(REPLACE(TRIM(COALESCE(event_scoring_type, '')), '_', '-'), ' ', '-')) = 'final-oral-defense' THEN 'final-oral-defense'
		ELSE 'standard'
	END;

UPDATE es_events
SET rubric_legend_json = '[{"score":4,"label":"Excellent"},{"score":3,"label":"Exceeds Expectations"},{"score":2,"label":"Meets Expectations"},{"score":1,"label":"Meets Expectations Sometimes"},{"score":0,"label":"Does Not Meet Expectations"}]'
WHERE rubric_legend_json IS NULL
	OR CHAR_LENGTH(TRIM(rubric_legend_json)) = 0
	OR JSON_VALID(rubric_legend_json) = 0;

UPDATE es_contestants
SET
	name = TRIM(name),
	entry_type = CASE WHEN LOWER(TRIM(COALESCE(entry_type, ''))) = 'individual' THEN 'individual' ELSE 'group' END,
	program_tag = CASE
		WHEN UPPER(TRIM(COALESCE(program_tag, ''))) IN ('BSINT', 'BSCS') THEN UPPER(TRIM(program_tag))
		ELSE NULL
	END,
	sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_judges
SET
	name = TRIM(name),
	email = NULLIF(TRIM(COALESCE(email, '')), ''),
	token = CASE
		WHEN token IS NULL OR CHAR_LENGTH(TRIM(token)) = 0 THEN REPLACE(UUID(), '-', '')
		ELSE TRIM(token)
	END,
	sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_criteria
SET
	name = TRIM(name),
	max_score = ROUND(GREATEST(COALESCE(max_score, 0), 0), 3),
	sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_subcriteria
SET
	name = TRIM(name),
	max_score = ROUND(GREATEST(COALESCE(max_score, 0), 0), 3),
	sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_presentation_slots
SET
	label = TRIM(label),
	sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_presentation_slot_judges
SET sort_order = CASE WHEN sort_order IS NULL OR sort_order <= 0 THEN 1 ELSE sort_order END;

UPDATE es_submission_scores ss
JOIN es_subcriteria sc ON sc.id = ss.subcriterion_id
SET ss.score = ROUND(LEAST(GREATEST(COALESCE(ss.score, 0), 0), GREATEST(COALESCE(sc.max_score, 0), 0)), 3);

-- Recompute parent criterion max_score from subcriteria to keep totals accurate.
UPDATE es_criteria c
JOIN (
	SELECT criterion_id, ROUND(SUM(GREATEST(COALESCE(max_score, 0), 0)), 3) AS computed_max
	FROM es_subcriteria
	GROUP BY criterion_id
) sc ON sc.criterion_id = c.id
SET c.max_score = sc.computed_max;

-- Remove blank-name rows that can break scoring/editor UX.
DELETE FROM es_contestants WHERE CHAR_LENGTH(TRIM(name)) = 0;
DELETE FROM es_judges WHERE CHAR_LENGTH(TRIM(name)) = 0;
DELETE FROM es_criteria WHERE CHAR_LENGTH(TRIM(name)) = 0;
DELETE FROM es_subcriteria WHERE CHAR_LENGTH(TRIM(name)) = 0;
DELETE FROM es_presentation_slots WHERE CHAR_LENGTH(TRIM(label)) = 0;
DELETE FROM es_contestant_participants WHERE CHAR_LENGTH(TRIM(participant_name)) = 0;

-- Individual entries should not keep participant rows.
DELETE cp
FROM es_contestant_participants cp
JOIN es_contestants c ON c.id = cp.contestant_id
WHERE c.entry_type = 'individual';

-- Clean up orphan rows for legacy databases where FK rules were not present/enforced.
DELETE cp
FROM es_contestant_participants cp
LEFT JOIN es_contestants c ON c.id = cp.contestant_id
WHERE c.id IS NULL;

DELETE psj
FROM es_presentation_slot_judges psj
LEFT JOIN es_presentation_slots ps ON ps.id = psj.slot_id
LEFT JOIN es_judges j ON j.id = psj.judge_id
WHERE ps.id IS NULL OR j.id IS NULL;

DELETE ssc
FROM es_submission_saved_contestants ssc
LEFT JOIN es_submissions s ON s.id = ssc.submission_id
LEFT JOIN es_contestants c ON c.id = ssc.contestant_id
WHERE s.id IS NULL OR c.id IS NULL;

DELETE ss
FROM es_submission_scores ss
LEFT JOIN es_submissions s ON s.id = ss.submission_id
LEFT JOIN es_contestants c ON c.id = ss.contestant_id
LEFT JOIN es_subcriteria sc ON sc.id = ss.subcriterion_id
WHERE s.id IS NULL OR c.id IS NULL OR sc.id IS NULL;

-- Ensure each contestant has a presentation slot.
INSERT INTO es_presentation_slots (id, event_id, label, contestant_id, sort_order)
SELECT
	REPLACE(UUID(), '-', ''),
	c.event_id,
	CONCAT('Slot ', c.sort_order),
	c.id,
	CASE WHEN c.sort_order IS NULL OR c.sort_order <= 0 THEN 1 ELSE c.sort_order END
FROM es_contestants c
LEFT JOIN es_presentation_slots ps
	ON ps.event_id = c.event_id
	AND ps.contestant_id = c.id
WHERE ps.id IS NULL;

-- Ensure each slot has judge assignments; if missing, assign all judges from the same event.
INSERT IGNORE INTO es_presentation_slot_judges (slot_id, judge_id, sort_order)
SELECT
	ps.id,
	j.id,
	CASE WHEN j.sort_order IS NULL OR j.sort_order <= 0 THEN 1 ELSE j.sort_order END
FROM es_presentation_slots ps
JOIN es_judges j ON j.event_id = ps.event_id
LEFT JOIN es_presentation_slot_judges psj ON psj.slot_id = ps.id
WHERE psj.slot_id IS NULL;

-- Infer saved contestants from positive scores when missing.
INSERT IGNORE INTO es_submission_saved_contestants (submission_id, contestant_id)
SELECT DISTINCT
	ss.submission_id,
	ss.contestant_id
FROM es_submission_scores ss
WHERE ss.score > 0;

COMMIT;
