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

  // Get all contestants in savedContestants
  const [savedContestants] = await c.query(
    'SELECT contestant_id FROM es_submission_saved_contestants WHERE submission_id=?',
    [SUBMISSION_ID]
  )
  const savedIds = savedContestants.map(r => r.contestant_id)
  console.log('Total saved contestant IDs:', savedIds.length)

  // For each saved contestant, check what scores exist
  const [allScores] = await c.query(
    'SELECT contestant_id, subcriterion_id, score FROM es_submission_scores WHERE submission_id=?',
    [SUBMISSION_ID]
  )

  // Group by contestant
  const scoresByContestant = {}
  for (const row of allScores) {
    if (!scoresByContestant[row.contestant_id]) scoresByContestant[row.contestant_id] = {}
    scoresByContestant[row.contestant_id][row.subcriterion_id] = Number(row.score)
  }

  // Find contestants with only NOAT (missing AVE/GPA)
  const onlyNoat = savedIds.filter(id => {
    const scores = scoresByContestant[id] || {}
    const aveScore = scores[AVE_ID] || 0
    const contentScore = scores[CONTENT_ID] || 0
    return aveScore === 0 && contentScore === 0
  })

  // Find contestants that have full scores
  const fullScored = savedIds.filter(id => {
    const scores = scoresByContestant[id] || {}
    return (scores[AVE_ID] || 0) > 0
  })

  console.log('Contestants fully scored (have AVE/GPA):', fullScored.length)
  console.log('Contestants with ONLY NOAT (missing AVE/GPA + Interview):', onlyNoat.length)

  // Get names for onlyNoat
  if (onlyNoat.length > 0) {
    const placeholders = onlyNoat.map(() => '?').join(',')
    const [names] = await c.query(
      `SELECT id, name, noat_score, sort_order FROM es_contestants WHERE id IN (${placeholders}) ORDER BY sort_order`,
      onlyNoat
    )
    console.log('\nContestants in savedContestants with ONLY NOAT scores (LOST DATA):')
    names.forEach(n => {
      console.log(`  Sort#${n.sort_order} ${n.name} - NOAT: ${n.noat_score}`)
    })
    console.log('\nTotal lost:', names.length)
  }

  await c.end()
}

main().catch(console.error)
