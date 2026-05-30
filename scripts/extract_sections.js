const fs = require('fs');

const sqlFiles = fs.readdirSync('C:/Projects/ShareME/scripts/sql').filter(f => f.endsWith('.sql'));
for (const file of sqlFiles) {
    const content = fs.readFileSync(`C:/Projects/ShareME/scripts/sql/${file}`, 'utf8');
    const hasContestants = content.includes('es_contestants');
    if (hasContestants) {
        console.log(`Found es_contestants in ${file}`);
        
        // Find insert statements for es_contestants
        const inserts = content.match(/INSERT INTO `es_contestants`.*?VALUES\s*(.*?);/gis);
        if (inserts) {
            console.log(`  Found ${inserts.length} insert blocks.`);
            const text = inserts[0];
            // Just print a snippet of the insert to see schema
            console.log(text.substring(0, 300));
        } else {
            console.log('  No insert blocks found.');
        }
    }
}
