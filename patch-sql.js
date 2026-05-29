const fs = require('fs');
const crypto = require('crypto');
const path = 'c:\\Projects\\ShareME\\scripts\\sql\\final_use_to_import_this.sql';

let sql = fs.readFileSync(path, 'utf8');

// 1. Update direct_rating_config_json in es_events
const oldJsonRegex = /"interviewComm":(\d+),"interviewPers":(\d+),"interviewInterest":(\d+),"interviewSpecial":(\d+)/g;
sql = sql.replace(oldJsonRegex, (match, comm, pers, interest, special) => {
    // If the old one was the 40/20/20 default
    if (comm === '20' && pers === '20' && interest === '40' && special === '20') {
        return `"interviewContent":40,"interviewComm":20,"interviewPers":20,"interviewInterest":10,"interviewSpecial":10`;
    }
    // Otherwise calculate dynamically if someone customized it?
    // Actually just default the 40/20/20/10/10 if we see it
    return `"interviewContent":40,"interviewComm":20,"interviewPers":20,"interviewInterest":10,"interviewSpecial":10`;
});

// Also replace the old DEFAULT_DIRECT_RATING_CONFIG string if it's stored exactly as object
const oldScoreWeightsRegex = /"scoreWeights":\{"aveGpa":40,"noat":40,"interviewComm":4,"interviewPers":4,"interviewInterest":8,"interviewSpecial":4\}/g;
sql = sql.replace(oldScoreWeightsRegex, `"scoreWeights":{"aveGpa":40,"noat":40,"interviewContent":8,"interviewComm":4,"interviewPers":4,"interviewInterest":2,"interviewSpecial":2}`);

// 2. Update INSERT INTO es_subcriteria
// A typical insert looks like:
// INSERT INTO `es_subcriteria` VALUES ('uuid','criterion_id','Communication Skills',20.000,2,NULL,NULL), ('uuid','criterion_id','Personality (Bearing)',20.000,3,NULL,NULL), ('uuid','criterion_id','Interest in the Program',40.000,4,NULL,NULL), ('uuid','criterion_id','Special Skills',20.000,5,NULL,NULL);
// We want to insert 'CONTENT' and update the max scores and sort orders.
// Because parsing SQL INSERTS perfectly with regex is hard, we can do a simpler replace.
sql = sql.replace(/('([^']+)','([^']+)','Communication Skills',)([^,]+),2,/g, (match, p1, commId, critId, maxScore) => {
    const newContentId = crypto.randomUUID();
    // Inject CONTENT before Communication Skills
    // The Communication skills sort_order becomes 3, etc.
    return `('${newContentId}','${critId}','CONTENT (Course Program Related)',40.000,2,NULL,NULL), ` +
           `('${commId}','${critId}','Communication Skills',20.000,3,`;
});

// Update Personality sort order from 3 -> 4
sql = sql.replace(/('([^']+)','([^']+)','Personality \(Bearing\)',)([^,]+),3,/g, "$120.000,4,");
// Update Interest sort order from 4 -> 5 and score to 10
sql = sql.replace(/('([^']+)','([^']+)','Interest in the Program',)([^,]+),4,/g, "$110.000,5,");
// Update Special Skills sort order from 5 -> 6 and score to 10
sql = sql.replace(/('([^']+)','([^']+)','Special Skills',)([^,]+),5,/g, "$110.000,6,");

// Update es_event_direct_rating_config table (if it exists)
// It had interview_max_score and interview_weight. That's fine, it's just the total. 

fs.writeFileSync(path, sql, 'utf8');
console.log('Successfully patched final_use_to_import_this.sql');
