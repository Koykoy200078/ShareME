/**
 * FIX SCRIPT: Clean stale migration artifacts and reset affected contestants
 * 
 * WHAT THIS DOES:
 * 1. For the 9 contestants with stale Comm/Pers/Interest/Special migration values:
 *    - REMOVES their stale Comm/Pers/Interest/Special scores (artifacts from old migration)
 *    - REMOVES them from savedContestantIds (so they show as "not yet submitted")
 *    - KEEPS their judge-entered Content and AVE/GPA scores intact
 * 2. For Ogoc, Mariel who has Content but no Comm/Pers/Interest/Special:
 *    - REMOVES from savedContestantIds so she shows as "not yet submitted"
 *    - KEEPS her Content=35 and AVE/GPA=94.5 scores intact
 * 3. The 86 contestants whose scores were completely lost (only NOAT remains):
 *    - Already removed from savedContestantIds in previous step
 *    - Show as "not yet submitted" -> judge can re-enter from scratch
 */
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

  // Get all scores for the 52 fully-scored contestants
  const [allScores] = await c.query(`
    SELECT c.id, c.name,
      MAX(CASE WHEN s.subcriterion_id=? THEN s.score END) as ave,
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
  `, [AVE_ID, CONTENT_ID, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID, SUBMISSION_ID, AVE_ID])

  // Identify contestants with stale migration artifacts:
  // Low comm (< 1.0) but judge-entered content (> migration content)
  const artifactContestants = []
  const incompleteContestants = []

  for (const r of allScores) {
    const commVal = Number(r.comm)
    const contentVal = Number(r.content)
    const estimatedOldInterview = commVal * 5 // comm = old * 4/20 -> old = comm * 5
    const expectedMigrationContent = estimatedOldInterview * 8 / 20
    const isMigrationArtifact = commVal > 0 && commVal < 1.0 && Math.abs(contentVal - expectedMigrationContent) > 1.0

    if (isMigrationArtifact) {
      artifactContestants.push(r)
    } else if (!r.comm || Number(r.comm) === 0) {
      // Has content but missing comm/pers/interest/special
      incompleteContestants.push(r)
    }
  }

  console.log('Contestants with migration artifact comm/pers scores:', artifactContestants.length)
  console.log('Contestants with incomplete interview (content only, no comm):', incompleteContestants.length)

  let fixedCount = 0

  // Fix 1: Remove stale comm/pers/interest/special for artifact contestants
  // Also remove from savedContestantIds so they must re-submit
  for (const r of artifactContestants) {
    console.log(`\nFixing ${r.name}: removing stale migration Comm/Pers/Interest/Special`)
    console.log(`  Keeping: AVE=${r.ave}, Content=${r.content}`)
    console.log(`  Removing: Comm=${r.comm}, Pers=${r.pers}, Interest=${r.interest}, Special=${r.special}`)
    
    // Delete stale comm/pers/interest/special scores
    await c.execute(`
      DELETE FROM es_submission_scores 
      WHERE submission_id=? AND contestant_id=? 
        AND subcriterion_id IN (?, ?, ?, ?)
    `, [SUBMISSION_ID, r.id, COMM_ID, PERS_ID, INTEREST_ID, SPECIAL_ID])

    // Remove from savedContestantIds (so they show as "not yet submitted" to the judge)
    await c.execute(`
      DELETE FROM es_submission_saved_contestants 
      WHERE submission_id=? AND contestant_id=?
    `, [SUBMISSION_ID, r.id])

    fixedCount++
  }

  // Fix 2: Remove incomplete contestants (only content, no comm) from savedContestantIds
  for (const r of incompleteContestants) {
    console.log(`\nFixing ${r.name}: has Content but missing Comm/Pers/Interest/Special`)
    console.log(`  Keeping: AVE=${r.ave}, Content=${r.content}`)
    console.log(`  Removing from savedContestants so judge can complete the scoring`)
    
    // Remove from savedContestantIds 
    await c.execute(`
      DELETE FROM es_submission_saved_contestants 
      WHERE submission_id=? AND contestant_id=?
    `, [SUBMISSION_ID, r.id])

    fixedCount++
  }

  // Final verification
  const [remaining] = await c.query(
    'SELECT COUNT(*) as cnt FROM es_submission_saved_contestants WHERE submission_id=?',
    [SUBMISSION_ID]
  )
  
  const [totalContestants] = await c.query(
    'SELECT COUNT(*) as cnt FROM es_contestants WHERE event_id=?',
    ['46caee26-eb44-4d90-8583-06f961abe387']
  )

  console.log('\n=== FIX COMPLETE ===')
  console.log(`Fixed ${fixedCount} contestants (removed from savedContestants)`)
  console.log(`Remaining in savedContestants (fully scored): ${remaining[0].cnt}`)
  console.log(`Total contestants: ${totalContestants[0].cnt}`)
  console.log(`\nJudge needs to re-enter ${totalContestants[0].cnt - remaining[0].cnt} contestants`)
  console.log('Their NOAT scores are pre-filled. AVE/GPA & partial Interview values are preserved where applicable.')

  await c.end()
}

main().catch(console.error)
