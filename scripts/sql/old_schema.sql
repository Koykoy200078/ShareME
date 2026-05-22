CREATE TABLE `es_contestant_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `contestant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `participant_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_es_contestant_participants_contestant_order` (`contestant_id`,`sort_order`),
  CONSTRAINT `fk_es_contestant_participants_contestant` FOREIGN KEY (`contestant_id`) REFERENCES `es_contestants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=93 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_contestants` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entry_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'group',
  `program_tag` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_es_contestants_event_order` (`event_id`,`sort_order`),
  CONSTRAINT `fk_es_contestants_event` FOREIGN KEY (`event_id`) REFERENCES `es_events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_criteria` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_score` decimal(10,3) NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_es_criteria_event_order` (`event_id`,`sort_order`),
  CONSTRAINT `fk_es_criteria_event` FOREIGN KEY (`event_id`) REFERENCES `es_events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_events` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_scoring_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `rubric_legend_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `direct_rating_config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_es_events_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_judges` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_es_judges_token` (`token`),
  KEY `idx_es_judges_event_order` (`event_id`,`sort_order`),
  CONSTRAINT `fk_es_judges_event` FOREIGN KEY (`event_id`) REFERENCES `es_events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_presentation_slot_judges` (
  `slot_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `judge_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`slot_id`,`judge_id`),
  KEY `idx_es_presentation_slot_judges_judge` (`judge_id`),
  CONSTRAINT `fk_es_presentation_slot_judges_judge` FOREIGN KEY (`judge_id`) REFERENCES `es_judges` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_presentation_slot_judges_slot` FOREIGN KEY (`slot_id`) REFERENCES `es_presentation_slots` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_presentation_slots` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contestant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_es_presentation_slots_event_contestant` (`event_id`,`contestant_id`),
  KEY `idx_es_presentation_slots_event_order` (`event_id`,`sort_order`),
  KEY `fk_es_presentation_slots_contestant` (`contestant_id`),
  CONSTRAINT `fk_es_presentation_slots_contestant` FOREIGN KEY (`contestant_id`) REFERENCES `es_contestants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_presentation_slots_event` FOREIGN KEY (`event_id`) REFERENCES `es_events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_subcriteria` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `criterion_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_score` decimal(10,3) NOT NULL,
  `sort_order` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_es_subcriteria_criterion_order` (`criterion_id`,`sort_order`),
  CONSTRAINT `fk_es_subcriteria_criterion` FOREIGN KEY (`criterion_id`) REFERENCES `es_criteria` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_submission_contestant_details` (
  `submission_id` bigint unsigned NOT NULL,
  `contestant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `strand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remark` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `additional_info` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`submission_id`,`contestant_id`),
  KEY `idx_es_submission_contestant_details_contestant` (`contestant_id`),
  CONSTRAINT `fk_es_submission_contestant_details_contestant` FOREIGN KEY (`contestant_id`) REFERENCES `es_contestants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_submission_contestant_details_submission` FOREIGN KEY (`submission_id`) REFERENCES `es_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_submission_saved_contestants` (
  `submission_id` bigint unsigned NOT NULL,
  `contestant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`submission_id`,`contestant_id`),
  KEY `idx_es_submission_saved_contestants_contestant` (`contestant_id`),
  CONSTRAINT `fk_es_submission_saved_contestants_contestant` FOREIGN KEY (`contestant_id`) REFERENCES `es_contestants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_submission_saved_contestants_submission` FOREIGN KEY (`submission_id`) REFERENCES `es_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_submission_scores` (
  `submission_id` bigint unsigned NOT NULL,
  `contestant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `subcriterion_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` decimal(10,3) NOT NULL,
  PRIMARY KEY (`submission_id`,`contestant_id`,`subcriterion_id`),
  KEY `idx_es_submission_scores_contestant` (`contestant_id`),
  KEY `idx_es_submission_scores_subcriterion` (`subcriterion_id`),
  CONSTRAINT `fk_es_submission_scores_contestant` FOREIGN KEY (`contestant_id`) REFERENCES `es_contestants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_submission_scores_subcriterion` FOREIGN KEY (`subcriterion_id`) REFERENCES `es_subcriteria` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_submission_scores_submission` FOREIGN KEY (`submission_id`) REFERENCES `es_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `es_submissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `judge_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_es_submissions_event_judge` (`event_id`,`judge_id`),
  KEY `idx_es_submissions_event` (`event_id`),
  KEY `fk_es_submissions_judge` (`judge_id`),
  CONSTRAINT `fk_es_submissions_event` FOREIGN KEY (`event_id`) REFERENCES `es_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_submissions_judge` FOREIGN KEY (`judge_id`) REFERENCES `es_judges` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;