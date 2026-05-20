-- EventScorer schema rollback
-- Drops EventScorer tables in foreign-key safe order.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS es_submission_scores;
DROP TABLE IF EXISTS es_submission_contestant_details;
DROP TABLE IF EXISTS es_submission_saved_contestants;
DROP TABLE IF EXISTS es_submissions;
DROP TABLE IF EXISTS es_presentation_slot_judges;
DROP TABLE IF EXISTS es_presentation_slots;
DROP TABLE IF EXISTS es_subcriteria;
DROP TABLE IF EXISTS es_criteria;
DROP TABLE IF EXISTS es_judges;
DROP TABLE IF EXISTS es_contestant_participants;
DROP TABLE IF EXISTS es_contestants;
DROP TABLE IF EXISTS es_events;

SET FOREIGN_KEY_CHECKS = 1;
