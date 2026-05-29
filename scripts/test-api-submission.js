const http = require('http');

const token = '02fe08ca5798a6e433a7779288c327752935fe6e03b90bad';
const contestantId = 'a0ff6231-fad8-4499-85a6-f671cd046d97'; // Abejero, John Fredrich

// Mock what the frontend sends (the ENTIRE payload matrix)
const payload = {
  scores: {
    // This contestant is being saved
    [contestantId]: {
      "63cec823-ae69-4169-80cc-b14eb376c027": 95, // AVE/GPA
      "4d5f8dfe-d451-4791-bdf6-98e923b5dd33": 85, // NOAT
      "723295b9-e7e0-4e16-ab71-4a1faa81116a": 38, // CONTENT
      "2baea322-2918-490f-8f5b-212bc5ff02cf": 18, // Comm
      "55c4e235-367b-4382-a2b7-2e86c9c36de7": 19, // Pers
      "27349fe1-23a7-423a-8041-a78146dcc985": 9,  // Interest
      "713a0704-e957-4074-b67e-e16f2da13479": 8   // Special
    },
    // Another random contestant in the matrix (with 0 scores)
    'dummy-contestant-id-that-should-not-override': {
      "63cec823-ae69-4169-80cc-b14eb376c027": 0,
      "4d5f8dfe-d451-4791-bdf6-98e923b5dd33": 0
    }
  },
  contestantId: contestantId,
  contestantDetails: {
    [contestantId]: {
      strand: 'Science, Technology, Engineering, and Mathematics (STEM)',
      remark: 'Great presentation',
      additionalInfo: 'Laptop YES'
    }
  }
};

const options = {
  hostname: 'localhost',
  port: 3001,
  path: `/api/eventscorer/judge/${token}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify(payload))
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', async () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`BODY: ${data}`);
    
    // Now verify the database
    const mysql = require('mysql2/promise');
    const c = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: 'Carvs@10072000', database: 'shareme_db' });
    
    // Verify scores
    const [scores] = await c.query('SELECT subcriterion_id, score FROM es_submission_scores WHERE contestant_id=?', [contestantId]);
    console.log('\nScores saved in DB for contestant:');
    console.log(scores);
    
    // Verify details
    const [details] = await c.query('SELECT strand, remark, additional_info FROM es_submission_contestant_details WHERE contestant_id=?', [contestantId]);
    console.log('\nDetails saved in DB for contestant:');
    console.log(details);
    
    await c.end();
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify(payload));
req.end();
