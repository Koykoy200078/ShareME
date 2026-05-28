const mysql = require('mysql2/promise');

async function reorder() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: 'Carvs@10072000',
        database: 'shareme_db'
    });

    console.log("Connected. Reordering es_contestants...");
    const [events] = await connection.execute("SELECT id FROM es_events");

    for (const event of events) {
        // es_contestants
        const [contestants] = await connection.execute("SELECT id FROM es_contestants WHERE event_id = ? ORDER BY sort_order ASC", [event.id]);
        for (let i = 0; i < contestants.length; i++) {
            await connection.execute("UPDATE es_contestants SET sort_order = ? WHERE id = ?", [i + 1, contestants[i].id]);
        }

        // es_presentation_slots
        const [slots] = await connection.execute("SELECT id FROM es_presentation_slots WHERE event_id = ? ORDER BY sort_order ASC", [event.id]);
        for (let i = 0; i < slots.length; i++) {
            await connection.execute("UPDATE es_presentation_slots SET sort_order = ? WHERE id = ?", [i + 1, slots[i].id]);
        }

        // es_criteria
        const [criteria] = await connection.execute("SELECT id FROM es_criteria WHERE event_id = ? ORDER BY sort_order ASC", [event.id]);
        for (let i = 0; i < criteria.length; i++) {
            await connection.execute("UPDATE es_criteria SET sort_order = ? WHERE id = ?", [i + 1, criteria[i].id]);
            
            // es_subcriteria
            const [subcriteria] = await connection.execute("SELECT id FROM es_subcriteria WHERE criterion_id = ? ORDER BY sort_order ASC", [criteria[i].id]);
            for (let j = 0; j < subcriteria.length; j++) {
                await connection.execute("UPDATE es_subcriteria SET sort_order = ? WHERE id = ?", [j + 1, subcriteria[j].id]);
            }
        }
    }

    console.log("Reordering complete.");
    await connection.end();
}

reorder().catch(console.error);
