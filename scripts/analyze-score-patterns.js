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

  // Get full scores for the 52 with data
  const [allScores] = await c.query(`
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
    ORDER BY c.name
  `, [AVE_ID, NOAT_ID, CONTENT_ID, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID, SUBMISSION_ID, AVE_ID])

  // Classify by pattern: 
  // "Low" = comm < 1 (these were entered as % fractions not absolute points, or migration artifacts)
  // "Normal" = comm >= 1
  const lowComm = allScores.filter(r => Number(r.comm) < 1.0)
  const normalComm = allScores.filter(r => Number(r.comm) >= 1.0)

  console.log('=== SCORING PATTERN ANALYSIS ===')
  console.log('Total scored contestants:', allScores.length)
  console.log('With SUSPICIOUSLY LOW Comm/Pers (< 1.0):', lowComm.length)
  console.log('With NORMAL Comm/Pers scores (>= 1.0):', normalComm.length)

  console.log('\n--- Contestants with LOW comm scores (possible bad migration) ---')
  lowComm.forEach(r => {
    const interviewTotal = Number(r.content) + Number(r.comm) + Number(r.pers) + Number(r.interest) + Number(r.special)
    const avePct = (Number(r.ave) / 100) * 100
    const noatPct = (Number(r.noat) / 100) * 100
    const interviewPct = (interviewTotal / 100) * 100
    const finalRating = (avePct + noatPct + interviewPct) / 3
    console.log(`  ${r.name}:`)
    console.log(`    AVE=${r.ave} NOAT=${r.noat} Content=${r.content} Comm=${r.comm} Pers=${r.pers} Interest=${r.interest} Special=${r.special}`)
    console.log(`    Interview total=${interviewTotal.toFixed(3)}, Final=${finalRating.toFixed(2)}`)
  })

  console.log('\n--- Contestants with NORMAL scores (sample 5) ---')
  normalComm.slice(0, 5).forEach(r => {
    const interviewTotal = Number(r.content) + Number(r.comm) + Number(r.pers) + Number(r.interest) + Number(r.special)
    const avePct = (Number(r.ave) / 100) * 100
    const noatPct = (Number(r.noat) / 100) * 100
    const interviewPct = (interviewTotal / 100) * 100
    const finalRating = (avePct + noatPct + interviewPct) / 3
    console.log(`  ${r.name}:`)
    console.log(`    AVE=${r.ave} NOAT=${r.noat} Content=${r.content} Comm=${r.comm} Pers=${r.pers} Interest=${r.interest} Special=${r.special}`)
    console.log(`    Interview total=${interviewTotal.toFixed(3)}, Final=${finalRating.toFixed(2)}`)
  })

  // Check: Do the 'low comm' contestants have content scores that are reasonable?
  // If content=20.4 and comm=0.793, this looks like comm was stored as a fraction of old score
  // Let's see if this is a ratio: comm * (20/content)?
  console.log('\n--- Checking if low-comm is a migration artifact ---')
  lowComm.forEach(r => {
    const commToContentRatio = Number(r.content) > 0 ? (Number(r.comm) / Number(r.content)) : 0
    console.log(`  ${r.name}: comm/content ratio = ${commToContentRatio.toFixed(4)}, expected ~0.5 for comm=10out of 20 when content=20out of 40`)
  })

  await c.end()
}

main().catch(console.error)
