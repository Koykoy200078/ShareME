const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Carvs@10072000',
        database: 'shareme_db'
    });

    const eventId = '46caee26-eb44-4d90-8583-06f961abe387';

    // 1. Get old subcriteria
    const [oldSubCriteria] = await connection.execute(`
        SELECT s.id, s.name, s.criterion_id
        FROM es_subcriteria s
        JOIN es_criteria c ON c.id = s.criterion_id
        WHERE c.event_id = ?
    `, [eventId]);

    console.log('Old Subcriteria:', oldSubCriteria);

    const aveSub = oldSubCriteria.find(sc => sc.name === 'AVE/GPA');
    const noatSub = oldSubCriteria.find(sc => sc.name === 'NOAT');
    const interviewSub = oldSubCriteria.find(sc => sc.name === 'Interview');

    if (!aveSub || !noatSub || !interviewSub) {
        console.log('Event does not have the old 3 criteria. Maybe already migrated?');
        process.exit(1);
    }

    const oldCriterionId = aveSub.criterion_id;

    // 2. Fetch all old scores
    const [oldScores] = await connection.execute(`
        SELECT * FROM es_submission_scores
        WHERE subcriterion_id IN (?, ?, ?)
    `, [aveSub.id, noatSub.id, interviewSub.id]);

    console.log(`Found ${oldScores.length} old scores.`);

    // 3. Create new criteria & subcriteria UUIDs
    const crypto = require('crypto');
    const newCriterionId = crypto.randomUUID();
    const newAveId = crypto.randomUUID();
    const newNoatId = crypto.randomUUID();
    const newCommId = crypto.randomUUID();
    const newPersId = crypto.randomUUID();
    const newIntId = crypto.randomUUID();
    const newSpecId = crypto.randomUUID();

    // 4. Delete old criteria (this will cascade delete scores and subcriteria)
    await connection.execute(`DELETE FROM es_criteria WHERE id = ?`, [oldCriterionId]);
    console.log('Deleted old criteria and cascaded scores.');

    // 5. Insert new criteria
    await connection.execute(`
        INSERT INTO es_criteria (id, event_id, name, max_score, sort_order)
        VALUES (?, ?, 'Direct Rating', 100, 0)
    `, [newCriterionId, eventId]);

    // 6. Insert new subcriteria
    const newSubCriteria = [
        [newAveId, newCriterionId, 'AVE/GPA', 100, 0],
        [newNoatId, newCriterionId, 'NOAT', 100, 1],
        [newCommId, newCriterionId, 'Communication Skills', 20, 2],
        [newPersId, newCriterionId, 'Personality (Bearing)', 20, 3],
        [newIntId, newCriterionId, 'Interest in the Program', 40, 4],
        [newSpecId, newCriterionId, 'Special Skills', 20, 5],
    ];

    for (const sc of newSubCriteria) {
        await connection.execute(`
            INSERT INTO es_subcriteria (id, criterion_id, name, max_score, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `, sc);
    }
    console.log('Inserted new subcriteria.');

    // 7. Re-insert scores with mapping
    const newScoresToInsert = [];

    for (const score of oldScores) {
        if (score.subcriterion_id === aveSub.id) {
            newScoresToInsert.push([score.submission_id, score.contestant_id, newAveId, score.score]);
        } else if (score.subcriterion_id === noatSub.id) {
            newScoresToInsert.push([score.submission_id, score.contestant_id, newNoatId, score.score]);
        } else if (score.subcriterion_id === interviewSub.id) {
            // Split interview score
            const total = Number(score.score);
            const comm = Math.round((total * 4 / 20) * 1000) / 1000;
            const pers = Math.round((total * 4 / 20) * 1000) / 1000;
            const interest = Math.round((total * 8 / 20) * 1000) / 1000;
            const spec = Math.round((total - (comm + pers + interest)) * 1000) / 1000;

            newScoresToInsert.push([score.submission_id, score.contestant_id, newCommId, comm]);
            newScoresToInsert.push([score.submission_id, score.contestant_id, newPersId, pers]);
            newScoresToInsert.push([score.submission_id, score.contestant_id, newIntId, interest]);
            newScoresToInsert.push([score.submission_id, score.contestant_id, newSpecId, spec]);
        }
    }

    if (newScoresToInsert.length > 0) {
        const placeholders = newScoresToInsert.map(() => '(?, ?, ?, ?)').join(', ');
        const flatValues = newScoresToInsert.flat();
        await connection.execute(`
            INSERT INTO es_submission_scores (submission_id, contestant_id, subcriterion_id, score)
            VALUES ${placeholders}
        `, flatValues);
    }
    console.log(`Inserted ${newScoresToInsert.length} mapped scores.`);
    
    await connection.end();
}

migrate().catch(console.error);
