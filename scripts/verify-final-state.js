const mysql = require('mysql2/promise')

const NOAT_ID = '4d5f8dfe-d451-4791-bdf6-98e923b5dd33'
const AVE_ID = '63cec823-ae69-4169-80cc-b14eb376c027'
const CONTENT_ID = '723295b9-e7e0-4e16-ab71-4a1faa81116a'
const COMM_ID = '2baea322-2918-490f-8f5b-212bc5ff02cf'
const PERS_ID = '55c4e235-367b-4382-a2b7-2e86c9c36de7'
const INTEREST_ID = '27349fe1-23a7-423a-8041-a78146dcc985'
const SPECIAL_ID = '713a0704-e957-4074-b67e-e16f2da13479'
const SUBMISSION_ID = 85

async function main() {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' })

  // Final state verification
  const [saved] = await c.query('SELECT COUNT(*) as cnt FROM es_submission_saved_contestants WHERE submission_id=?', [SUBMISSION_ID])
  const [total] = await c.query('SELECT COUNT(*) as cnt FROM es_contestants WHERE event_id=?', ['46caee26-eb44-4d90-8583-06f961abe387'])

  console.log('=== FINAL STATE ===')
  console.log('Total contestants:', total[0].cnt)
  console.log('Fully scored (savedContestantIds):', saved[0].cnt)
  console.log('Need re-entry:', total[0].cnt - saved[0].cnt)

  // Show top 10 fully scored contestants
  const [topScored] = await c.query(`
    SELECT c.name,
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
      AND MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) > 0
    ORDER BY c.name
  `, [AVE_ID, NOAT_ID, CONTENT_ID, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID, SUBMISSION_ID, AVE_ID, COMM_ID])

  console.log('\nFully scored with ALL interview fields (' + topScored.length + '):')
  topScored.forEach(r => {
    const interviewTotal = (Number(r.content)||0) + (Number(r.comm)||0) + (Number(r.pers)||0) + (Number(r.interest)||0) + (Number(r.special)||0)
    const finalRating = ((Number(r.ave)/100)*100 + (Number(r.noat)/100)*100 + (interviewTotal/100)*100) / 3
    console.log(`  ${r.name}: AVE=${r.ave} NOAT=${r.noat} Interview=${interviewTotal.toFixed(2)} => Final=${finalRating.toFixed(2)}`)
  })

  // Verify no more migration artifacts remain
  const [artifacts] = await c.query(`
    SELECT COUNT(*) as cnt FROM es_submission_scores 
    WHERE submission_id=? AND subcriterion_id=? AND score < 1.0 AND score > 0
  `, [SUBMISSION_ID, COMM_ID])
  console.log('\nRemaining migration artifact Comm scores (< 1.0):', artifacts[0].cnt, '(should be 0)')

  await c.end()
}

main().catch(console.error)
