const mysql = require('mysql2/promise')

async function main() {
  const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' })
  const eventId = '46caee26-eb44-4d90-8583-06f961abe387'
  const submissionId = 85

  // Get all subcriteria IDs for this event
  const [subcriteria] = await c.query(
    'SELECT s.id, s.name FROM es_subcriteria s JOIN es_criteria cr ON s.criterion_id = cr.id WHERE cr.event_id = ? ORDER BY s.sort_order',
    [eventId]
  )
  console.log('Subcriteria:', subcriteria.map(s => `${s.name} (${s.id})`).join('\n  '))

  // Get the AVE/GPA and CONTENT subcriteria IDs
  const aveSubcriterion = subcriteria.find(s => s.name === 'AVE/GPA')
  const contentSubcriterion = subcriteria.find(s => s.name === 'CONTENT (Course Program Related)')
  const noatSubcriterion = subcriteria.find(s => s.name === 'NOAT')

  console.log('\nAVE/GPA subcriterion_id:', aveSubcriterion?.id)
  console.log('CONTENT subcriterion_id:', contentSubcriterion?.id)
  console.log('NOAT subcriterion_id:', noatSubcriterion?.id)

  // Count contestants: in savedContestants, have NOAT but no AVE/GPA
  const [missingAve] = await c.query(`
    SELECT c.id, c.name, c.noat_score,
           (SELECT score FROM es_submission_scores WHERE submission_id=? AND contestant_id=c.id AND subcriterion_id=?) as ave_gpa,
           (SELECT score FROM es_submission_scores WHERE submission_id=? AND contestant_id=c.id AND subcriterion_id=?) as content_score,
           (SELECT score FROM es_submission_scores WHERE submission_id=? AND contestant_id=c.id AND subcriterion_id=?) as noat_score_in_sub
    FROM es_submission_saved_contestants sc
    JOIN es_contestants c ON c.id = sc.contestant_id
    WHERE sc.submission_id=?
    ORDER BY c.sort_order
  `, [submissionId, aveSubcriterion.id, submissionId, contentSubcriterion.id, submissionId, noatSubcriterion.id, submissionId])

  const havingAve = missingAve.filter(r => r.ave_gpa && Number(r.ave_gpa) > 0)
  const missingAveList = missingAve.filter(r => !r.ave_gpa || Number(r.ave_gpa) === 0)
  const havingContent = missingAve.filter(r => r.content_score && Number(r.content_score) > 0)
  const missingContentList = missingAve.filter(r => !r.content_score || Number(r.content_score) === 0)

  console.log('\n=== SUBMISSION ANALYSIS ===')
  console.log('Total saved contestant IDs:', missingAve.length)
  console.log('Contestants WITH AVE/GPA score:', havingAve.length)
  console.log('Contestants MISSING AVE/GPA score:', missingAveList.length)
  console.log('Contestants WITH Content score:', havingContent.length)
  console.log('Contestants MISSING Content score:', missingContentList.length)
  
  console.log('\nSample of contestants WITH AVE/GPA:')
  havingAve.slice(0, 5).forEach(r => {
    console.log(`  ${r.name}: AVE=${r.ave_gpa}, Content=${r.content_score}, NOAT=${r.noat_score}`)
  })

  console.log('\nSample of contestants MISSING AVE/GPA:')
  missingAveList.slice(0, 10).forEach(r => {
    console.log(`  ${r.name}: AVE=${r.ave_gpa}, Content=${r.content_score}, NOAT_in_table=${r.noat_score_in_sub}, NOAT_in_contestants=${r.noat_score}`)
  })

  await c.end()
}

main().catch(console.error)
