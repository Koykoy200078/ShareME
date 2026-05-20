-- EventScorer schema migration (structure only)

CREATE TABLE IF NOT EXISTS es_events (
	id VARCHAR(36) NOT NULL,
	title VARCHAR(255) NOT NULL,
	description TEXT NULL,
	created_by VARCHAR(255) NULL,
	event_scoring_type VARCHAR(32) NOT NULL DEFAULT 'standard',
	created_at DATETIME(3) NOT NULL,
	PRIMARY KEY (id),
	INDEX idx_es_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_event_rubric_legend (
	event_id VARCHAR(36) NOT NULL,
	score DECIMAL(10,3) NOT NULL,
	label VARCHAR(255) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (event_id, sort_order),
	INDEX idx_es_event_rubric_legend_event_score (event_id, score),
	CONSTRAINT fk_es_event_rubric_legend_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_event_direct_rating_config (
	event_id VARCHAR(36) NOT NULL,
	ave_gpa_max_score DECIMAL(10,3) NOT NULL,
	noat_max_score DECIMAL(10,3) NOT NULL,
	interview_max_score DECIMAL(10,3) NOT NULL,
	ave_gpa_weight DECIMAL(10,3) NOT NULL,
	noat_weight DECIMAL(10,3) NOT NULL,
	interview_weight DECIMAL(10,3) NOT NULL,
	single_aligned_bonus_points DECIMAL(10,3) NOT NULL DEFAULT 0,
	multi_aligned_bonus_points DECIMAL(10,3) NOT NULL DEFAULT 0,
	PRIMARY KEY (event_id),
	CONSTRAINT fk_es_event_direct_rating_config_event FOREIGN KEY (event_id) REFERENCES es_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_event_direct_rating_single_strands (
	event_id VARCHAR(36) NOT NULL,
	strand VARCHAR(255) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (event_id, strand),
	INDEX idx_es_event_direct_rating_single_strands_event_order (event_id, sort_order),
	CONSTRAINT fk_es_event_direct_rating_single_strands_config FOREIGN KEY (event_id) REFERENCES es_event_direct_rating_config(event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS es_event_direct_rating_multi_strands (
	event_id VARCHAR(36) NOT NULL,
	strand VARCHAR(255) NOT NULL,
	sort_order INT NOT NULL,
	PRIMARY KEY (event_id, strand),
	INDEX idx_es_event_direct_rating_multi_strands_event_order (event_id, sort_order),
	CONSTRAINT fk_es_event_direct_rating_multi_strands_config FOREIGN KEY (event_id) REFERENCES es_event_direct_rating_config(event_id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS es_submission_contestant_details (
	submission_id BIGINT UNSIGNED NOT NULL,
	contestant_id VARCHAR(36) NOT NULL,
	strand VARCHAR(255) NULL,
	remark VARCHAR(255) NULL,
	additional_info TEXT NULL,
	PRIMARY KEY (submission_id, contestant_id),
	INDEX idx_es_submission_contestant_details_contestant (contestant_id),
	CONSTRAINT fk_es_submission_contestant_details_submission FOREIGN KEY (submission_id) REFERENCES es_submissions(id) ON DELETE CASCADE,
	CONSTRAINT fk_es_submission_contestant_details_contestant FOREIGN KEY (contestant_id) REFERENCES es_contestants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
