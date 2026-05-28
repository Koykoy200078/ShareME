const mysql = require('mysql2/promise');

async function reindex() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Carvs@10072000',
        database: 'shareme_db'
    });

    console.log("Connected. Disabling FK checks...");
    await connection.execute("SET FOREIGN_KEY_CHECKS = 0");

    try {
        console.log("Reindexing es_contestant_participants...");
        const [participants] = await connection.execute("SELECT id FROM es_contestant_participants ORDER BY id ASC");
        for (let i = 0; i < participants.length; i++) {
            const newId = i + 1;
            const oldId = participants[i].id;
            if (newId !== oldId) {
                await connection.execute("UPDATE es_contestant_participants SET id = ? WHERE id = ?", [newId, oldId]);
            }
        }
        await connection.execute("ALTER TABLE es_contestant_participants AUTO_INCREMENT = 1");

        console.log("Reindexing es_submissions...");
        const [submissions] = await connection.execute("SELECT id FROM es_submissions ORDER BY id ASC");
        for (let i = 0; i < submissions.length; i++) {
            const newId = i + 1;
            const oldId = submissions[i].id;
            
            if (newId !== oldId) {
                await connection.execute("UPDATE es_submissions SET id = ? WHERE id = ?", [newId, oldId]);
                await connection.execute("UPDATE es_submission_scores SET submission_id = ? WHERE submission_id = ?", [newId, oldId]);
                await connection.execute("UPDATE es_submission_saved_contestants SET submission_id = ? WHERE submission_id = ?", [newId, oldId]);
                await connection.execute("UPDATE es_submission_contestant_details SET submission_id = ? WHERE submission_id = ?", [newId, oldId]);
            }
        }
        await connection.execute("ALTER TABLE es_submissions AUTO_INCREMENT = 1");

        console.log("Reindexing complete.");
    } catch (e) {
        console.error(e);
    } finally {
        await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
        await connection.end();
    }
}

reindex().catch(console.error);
