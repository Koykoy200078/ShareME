ALTER TABLE es_contestants ADD COLUMN academic_track VARCHAR(512) NULL AFTER noat_score;
ALTER TABLE es_contestants ADD COLUMN laptop_available VARCHAR(512) NULL AFTER academic_track;
