const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function patch() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Carvs@10072000',
        database: 'shareme_db'
    });

    const eventId = '46caee26-eb44-4d90-8583-06f961abe387';

    // Find the Direct Rating criterion dynamically
    const [criteriaRows] = await connection.query(`SELECT id FROM es_criteria WHERE event_id = ? AND name = 'Direct Rating'`, [eventId]);
    if (criteriaRows.length === 0) {
        console.log('Could not find Direct Rating criterion for the event.');
        process.exit(1);
    }
    const criterionId = criteriaRows[0].id;

    // 1. Fetch old subcriteria
    const [subcriteria] = await connection.query(`SELECT * FROM es_subcriteria WHERE criterion_id = ?`, [criterionId]);
    
    const comm = subcriteria.find(s => s.name.includes('Communication'));
    const pers = subcriteria.find(s => s.name.includes('Personality'));
    const interest = subcriteria.find(s => s.name.includes('Interest'));
    const spec = subcriteria.find(s => s.name.includes('Special Skills'));

    if (!comm || !pers || !interest || !spec) {
        console.log('Could not find all 4 interview subcriteria.');
        process.exit(1);
    }

    // Check if Content already exists
    const existingContent = subcriteria.find(s => s.name.includes('CONTENT'));
    let contentId = existingContent ? existingContent.id : crypto.randomUUID();

    if (!existingContent) {
        await connection.execute(`
            INSERT INTO es_subcriteria (id, criterion_id, name, max_score, sort_order)
            VALUES (?, ?, 'CONTENT (Course Program Related)', 40, 2)
        `, [contentId, criterionId]);
        console.log('Inserted CONTENT subcriterion.');
    } else {
        console.log('CONTENT subcriterion already exists.');
    }

    // Update max scores and sort orders
    await connection.execute(`UPDATE es_subcriteria SET max_score=20, sort_order=3 WHERE id=?`, [comm.id]);
    await connection.execute(`UPDATE es_subcriteria SET max_score=20, sort_order=4 WHERE id=?`, [pers.id]);
    await connection.execute(`UPDATE es_subcriteria SET max_score=10, sort_order=5 WHERE id=?`, [interest.id]);
    await connection.execute(`UPDATE es_subcriteria SET max_score=10, sort_order=6 WHERE id=?`, [spec.id]);
    console.log('Updated existing subcriteria max_scores and sort_orders.');

    // Fetch all scores for the 4 fields
    const [scores] = await connection.query(`
        SELECT * FROM es_submission_scores 
        WHERE subcriterion_id IN (?, ?, ?, ?)
    `, [comm.id, pers.id, interest.id, spec.id]);

    const groups = {};
    for (const row of scores) {
        const key = `${row.submission_id}_${row.contestant_id}`;
        if (!groups[key]) groups[key] = { submission_id: row.submission_id, contestant_id: row.contestant_id, total: 0 };
        groups[key].total += Number(row.score);
    }

    let updatedCount = 0;
    let insertedCount = 0;

    for (const group of Object.values(groups)) {
        const total = group.total;
        if (total === 0) continue;

        const contentScore = Math.round((total * 40 / 100) * 1000) / 1000;
        const commScore = Math.round((total * 20 / 100) * 1000) / 1000;
        const persScore = Math.round((total * 20 / 100) * 1000) / 1000;
        const interestScore = Math.round((total * 10 / 100) * 1000) / 1000;
        const specScore = Math.round((total - (contentScore + commScore + persScore + interestScore)) * 1000) / 1000;

        // Insert or update Content score
        if (!existingContent) {
            await connection.execute(`
                INSERT INTO es_submission_scores (submission_id, contestant_id, subcriterion_id, score)
                VALUES (?, ?, ?, ?)
            `, [group.submission_id, group.contestant_id, contentId, contentScore]);
            insertedCount++;
        }

        // Update the other 4 scores
        await connection.execute(`
            UPDATE es_submission_scores SET score=? WHERE submission_id=? AND contestant_id=? AND subcriterion_id=?
        `, [commScore, group.submission_id, group.contestant_id, comm.id]);

        await connection.execute(`
            UPDATE es_submission_scores SET score=? WHERE submission_id=? AND contestant_id=? AND subcriterion_id=?
        `, [persScore, group.submission_id, group.contestant_id, pers.id]);

        await connection.execute(`
            UPDATE es_submission_scores SET score=? WHERE submission_id=? AND contestant_id=? AND subcriterion_id=?
        `, [interestScore, group.submission_id, group.contestant_id, interest.id]);

        await connection.execute(`
            UPDATE es_submission_scores SET score=? WHERE submission_id=? AND contestant_id=? AND subcriterion_id=?
        `, [specScore, group.submission_id, group.contestant_id, spec.id]);
        
        updatedCount += 4;
    }

    console.log(`Inserted ${insertedCount} Content scores.`);
    console.log(`Updated ${updatedCount} existing scores to new fractions.`);
    
    // Also patch es_events direct_rating_config_json just in case
    const eventId = '46caee26-eb44-4d90-8583-06f961abe387';
    const [events] = await connection.query(`SELECT direct_rating_config_json FROM es_events WHERE id=?`, [eventId]);
    if (events.length > 0 && events[0].direct_rating_config_json) {
        let jsonStr = events[0].direct_rating_config_json;
        // Fix the json string if it has the old max scores
        const oldJsonRegex = /"interviewComm":(\d+),"interviewPers":(\d+),"interviewInterest":(\d+),"interviewSpecial":(\d+)/g;
        jsonStr = jsonStr.replace(oldJsonRegex, `"interviewContent":40,"interviewComm":20,"interviewPers":20,"interviewInterest":10,"interviewSpecial":10`);
        const oldScoreWeightsRegex = /"scoreWeights":\{"aveGpa":40,"noat":40,"interviewComm":4,"interviewPers":4,"interviewInterest":8,"interviewSpecial":4\}/g;
        jsonStr = jsonStr.replace(oldScoreWeightsRegex, `"scoreWeights":{"aveGpa":40,"noat":40,"interviewContent":8,"interviewComm":4,"interviewPers":4,"interviewInterest":2,"interviewSpecial":2}`);
        
        await connection.execute(`UPDATE es_events SET direct_rating_config_json=? WHERE id=?`, [jsonStr, eventId]);
        console.log('Patched direct_rating_config_json on es_events.');
    }

    await connection.end();
}

patch().catch(console.error);
