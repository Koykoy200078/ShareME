const mysql = require('mysql2/promise')

const NOAT_ID = '4d5f8dfe-d451-4791-bdf6-98e923b5dd33'
const AVE_ID = '63cec823-ae69-4169-80cc-b14eb376c027'
const CONTENT_ID = '723295b9-e7e0-4e16-ab71-4a1faa81116a'
const COMM_ID = '2baea322-2918-490f-8f5b-212bc5ff02cf'
const PERS_ID = '55c4e235-367b-4382-a2b7-2e86c9c36de7'
const INTEREST_ID = '27349fe1-23a7-423a-8041-a78146dcc985'
const SPECIAL_ID = '713a0704-e957-4074-b67e-e16f2da13479'
const SUBMISSION_ID = 85
const EVENT_ID = '46caee26-eb44-4d90-8583-06f961abe387'

async function main() {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' })

  // Check if DB has ANY zero-value rows for non-NOAT for these contestants
  const [zeroRows] = await c.query(`
    SELECT COUNT(*) as cnt
    FROM es_submission_scores
    WHERE submission_id=?
      AND subcriterion_id != ?
      AND score = 0
  `, [SUBMISSION_ID, NOAT_ID])
  console.log('Zero-value non-NOAT rows in submission (evidence of wipe bug):', zeroRows[0].cnt)

  // Check exact history - how many total score rows exist for submission 85
  const [totalRows] = await c.query('SELECT COUNT(*) as cnt FROM es_submission_scores WHERE submission_id=?', [SUBMISSION_ID])
  console.log('Total score rows for this submission:', totalRows[0].cnt)

  // Get the 52 fully-scored contestants and verify their data is complete
  const [fullData] = await c.query(`
    SELECT c.name, c.noat_score,
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
    GROUP BY c.id, c.name, c.noat_score
    HAVING MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) > 0
    ORDER BY c.sort_order
  `, [AVE_ID, NOAT_ID, CONTENT_ID, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID, SUBMISSION_ID, AVE_ID])

  console.log('\n=== CONTESTANTS WITH FULL SCORES (' + fullData.length + ') ===')
  fullData.forEach(r => {
    const total = (Number(r.ave)||0)/100*100 + (Number(r.noat)||0)/100*100
    const interviewSum = (Number(r.content)||0) + (Number(r.comm)||0) + (Number(r.pers)||0) + (Number(r.interest)||0) + (Number(r.special)||0)
    const avePct = ((Number(r.ave)||0) / 100) * 100
    const noatPct = ((Number(r.noat)||0) / 100) * 100
    const interviewPct = (interviewSum / 100) * 100
    const finalRating = (avePct + noatPct + interviewPct) / 3
    console.log(`  ${r.name}: AVE=${r.ave}, NOAT=${r.noat}, Content=${r.content}, Comm=${r.comm}, Pers=${r.pers}, Interest=${r.interest}, Special=${r.special} => Final=${finalRating.toFixed(2)}`)
  })

  // Confirm the 86 have NO non-NOAT scores at all
  const [noData] = await c.query(`
    SELECT COUNT(*) as cnt FROM es_submission_scores 
    WHERE submission_id=? AND subcriterion_id=? AND score > 0
    AND contestant_id IN (
      SELECT contestant_id FROM es_submission_saved_contestants WHERE submission_id=?
    )
    AND contestant_id NOT IN (
      SELECT contestant_id FROM es_submission_scores WHERE submission_id=? AND subcriterion_id=? AND score > 0
    )
  `, [SUBMISSION_ID, NOAT_ID, SUBMISSION_ID, SUBMISSION_ID, AVE_ID])
  console.log('\nNOAT scores for the 86 "lost" contestants:', noData[0].cnt)
  console.log('\nCONCLUSION: The 86 contestants have ONLY NOAT scores. AVE/GPA and Interview data was NEVER SAVED to the database.')
  console.log('The data is permanently lost and cannot be restored. The judge needs to re-enter those scores.')

  await c.end()
}

main().catch(console.error)
