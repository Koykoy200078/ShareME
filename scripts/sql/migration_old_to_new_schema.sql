-- Migration Script: Old Schema to New Schema
-- Use this script to upgrade an old database schema to the latest version.

-- 1. Add missing columns to es_events
ALTER TABLE `es_events` 
  ADD COLUMN `show_rubric_legend` TINYINT(1) NOT NULL DEFAULT '0' AFTER `rubric_legend_json`;

-- 2. Add missing columns to es_contestants
ALTER TABLE `es_contestants`
  ADD COLUMN `section` VARCHAR(64) NULL AFTER `program_tag`;

-- 3. Create newly introduced tables
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
