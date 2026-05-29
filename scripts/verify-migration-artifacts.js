const mysql = require('mysql2/promise')

// These IDs came from the migrate-interview.js script execution
const NOAT_ID = '4d5f8dfe-d451-4791-bdf6-98e923b5dd33'
const AVE_ID = '63cec823-ae69-4169-80cc-b14eb376c027'
const CONTENT_ID = '723295b9-e7e0-4e16-ab71-4a1faa81116a'
const COMM_ID = '2baea322-2918-490f-8f5b-212bc5ff02cf'
const PERS_ID = '55c4e235-367b-4382-a2b7-2e86c9c36de7'
const INTEREST_ID = '27349fe1-23a7-423a-8041-a78146dcc985'
const SPECIAL_ID = '713a0704-e957-4074-b67e-e16f2da13479'
const SUBMISSION_ID = 85

// Max scores
const MAX_CONTENT = 40
const MAX_COMM = 20
const MAX_PERS = 20
const MAX_INTEREST = 10
const MAX_SPECIAL = 10

async function main() {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' })

  // Get all scores for submission 85 for the 52 scored contestants
  const [allScores] = await c.query(`
    SELECT c.id, c.name,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as ave,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as noat,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as content,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as comm,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as pers,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as interest,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as special
    FROM es_submission_scores s
    JOIN es_contestants c ON s.contestant_id = c.id
    WHERE s.submission_id=?
    GROUP BY c.id, c.name
    HAVING MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) > 0
    ORDER BY c.name
  `, [AVE_ID, NOAT_ID, CONTENT_ID, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID, SUBMISSION_ID, AVE_ID])

  // The migration script split old interview scores proportionally:
  // content = oldInterview * 8/20
  // comm = oldInterview * 4/20
  // pers = oldInterview * 4/20
  // interest = oldInterview * 2/20
  // special = oldInterview - (content + comm + pers + interest)
  //
  // The ratio: comm/content should be (4/20)/(8/20) = 0.5 for pure migration data
  // BUT we see comm/content = 0.0389 for the 10 "bad" contestants
  //
  // Theory: Content was ENTERED BY JUDGE (overwriting migration's content split value)
  // while Comm/Pers/Interest/Special are still the OLD MIGRATION VALUES
  //
  // To verify: if old interview score = X, then:
  // migration_comm = X * 4/20
  // current_comm = migration_comm (unchanged)
  // current_content = judge_entered_content (different from migration_content)
  //
  // Reverse-engineer old interview score from comm:
  // old_interview = comm * 20/4 = comm * 5
  // If comm=0.793 -> old_interview = 0.793 * 5 = 3.965 out of 20
  // migration_content = 3.965 * 8/20 = 1.586
  // But current content = 20.4 (judge entered this, NOT the migrated value)

  console.log('=== MIGRATION ARTIFACT ANALYSIS ===')
  console.log('Checking if the 10 low-comm contestants have migration artifacts...\n')

  const lowComm = allScores.filter(r => Number(r.comm) < 1.0 && r.comm !== null)
  for (const r of lowComm) {
    const estimatedOldInterviewFromComm = Number(r.comm) * 20 / 4
    const expectedMigrationContent = estimatedOldInterviewFromComm * 8 / 20
    const judgeEnteredContent = Number(r.content)
    const isMigrationArtifact = Math.abs(judgeEnteredContent - expectedMigrationContent) > 1.0
    console.log(`${r.name}:`)
    console.log(`  Current: Content=${r.content} Comm=${r.comm} Pers=${r.pers} Interest=${r.interest} Special=${r.special}`)
    console.log(`  Est. old interview score: ${estimatedOldInterviewFromComm.toFixed(3)} out of 20`)
    console.log(`  Expected migration content: ${expectedMigrationContent.toFixed(3)}`)
    console.log(`  Actual content: ${judgeEnteredContent} -> IS MIGRATION ARTIFACT: ${isMigrationArtifact}`)
    if (isMigrationArtifact) {
      // The judge entered content directly but comm/pers/interest/special are from old migration
      // Action: We should CLEAR the old migration comm/pers/interest/special values
      // so the judge knows these need to be filled in again
      console.log(`  >> ACTION NEEDED: Comm/Pers/Interest/Special are stale migration values`)
    }
    console.log()
  }

  // For Ogoc, Mariel who is missing comm/pers/interest/special entirely (null)
  const ogoc = allScores.find(r => r.name === 'Ogoc, Mariel')
  if (ogoc) {
    console.log('Ogoc, Mariel special case: Has Content but NULL comm/pers/interest/special')
    console.log('Content=', ogoc.content, '-> Judge entered this, rest needs to be re-entered')
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===')
  console.log('10 contestants have STALE MIGRATION COMM/PERS/INTEREST/SPECIAL values')
  console.log('Their content + AVE were re-entered by judge but old interview subcriteria remain')
  console.log('These need to be flagged for re-entry')

  await c.end()
}

main().catch(console.error)
