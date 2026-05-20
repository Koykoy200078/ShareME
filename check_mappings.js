const mysql = require('mysql2/promise');
require('dotenv').config();

const mappings = [
    { alias: 'Ariel', canonical: 'Ariel Bensing' },
    { alias: 'Gab', canonical: 'Gabrielle Saranillo' },
    { alias: 'Chan', canonical: 'Christian Carvajal' },
    { alias: 'Jasper', canonical: 'Jasper Bardo' },
    { alias: 'Rosette', canonical: 'Rosette C. Cagang' },
    { alias: 'Diana', canonical: 'Diana Nazareth' },
    { alias: 'Chester Cofino', canonical: 'Dr. Chester L. Cofino' }
];

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.EVENTSCORER_DB_HOST,
        user: process.env.EVENTSCORER_DB_USER,
        password: process.env.EVENTSCORER_DB_PASSWORD,
        database: process.env.EVENTSCORER_DB_NAME,
        port: process.env.EVENTSCORER_DB_PORT
    });

    try {
        const [events] = await connection.execute('SELECT id, title FROM es_events');
        const [judges] = await connection.execute('SELECT event_id, name FROM es_judges');

        const results = [];

        for (const event of events) {
            const eventJudges = judges.filter(j => j.event_id === event.id).map(j => j.name);
            const eventResults = {
                event_title: event.title,
                event_id: event.id,
                mappings: [],
                count: 0
            };

            for (const map of mappings) {
                const hasAlias = eventJudges.includes(map.alias);
                const hasCanonical = eventJudges.includes(map.canonical);

                if (hasAlias && hasCanonical) {
                    eventResults.mappings.push(`${map.alias} -> ${map.canonical}`);
                    eventResults.count++;
                }
            }

            if (eventResults.count > 0) {
                results.push(eventResults);
            }
        }

        console.log(JSON.stringify(results, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

main();
