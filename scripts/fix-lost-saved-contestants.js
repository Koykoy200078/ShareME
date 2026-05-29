const mysql = require('mysql2/promise')

const NOAT_ID = '4d5f8dfe-d451-4791-bdf6-98e923b5dd33'
const AVE_ID = '63cec823-ae69-4169-80cc-b14eb376c027'
const CONTENT_ID = '723295b9-e7e0-4e16-ab71-4a1faa81116a'
const SUBMISSION_ID = 85
const EVENT_ID = '46caee26-eb44-4d90-8583-06f961abe387'

async function main() {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' })

  // Get all saved contestant IDs
  const [savedRows] = await c.query(
    'SELECT contestant_id FROM es_submission_saved_contestants WHERE submission_id=?',
    [SUBMISSION_ID]
  )
  const savedIds = savedRows.map(r => r.contestant_id)

  // Identify which saved contestants are MISSING AVE/GPA (only have NOAT)
  const lostIds = []
  for (const id of savedIds) {
    const [aveRows] = await c.query(
      'SELECT score FROM es_submission_scores WHERE submission_id=? AND contestant_id=? AND subcriterion_id=? AND score > 0',
      [SUBMISSION_ID, id, AVE_ID]
    )
    if (aveRows.length === 0) {
      lostIds.push(id)
    }
  }

  console.log('Total saved contestants:', savedIds.length)
  console.log('Contestants with lost data (no AVE/GPA):', lostIds.length)
  console.log('Contestants with intact data:', savedIds.length - lostIds.length)

  // IMPORTANT: The judge count of "1" comes from es_submission_saved_contestants
  // These 86 contestants ARE in there but have no AVE/GPA or Interview scores
  // The scoring system shows judgeCount=1 because they're in savedContestants
  // We need to REMOVE them from savedContestants so judgeCount becomes 0
  // and the judge can re-enter their scores properly

  if (lostIds.length > 0) {
    console.log('\nRemoving', lostIds.length, 'contestants from savedContestants (they will show as un-submitted)...')
    
    for (const id of lostIds) {
      await c.execute(
        'DELETE FROM es_submission_saved_contestants WHERE submission_id=? AND contestant_id=?',
        [SUBMISSION_ID, id]
      )
    }
    
    // Verify
    const [remaining] = await c.query(
      'SELECT COUNT(*) as cnt FROM es_submission_saved_contestants WHERE submission_id=?',
      [SUBMISSION_ID]
    )
    console.log('Remaining saved contestants after cleanup:', remaining[0].cnt)
    console.log('\nDone! The 86 contestants now show as "not yet submitted" (judgeCount=0)')
    console.log('The judge can now re-enter AVE/GPA and Interview scores for these contestants.')
    console.log('Their NOAT scores are still pre-filled from the bulk import.')
  }

  await c.end()
}

main().catch(console.error)
