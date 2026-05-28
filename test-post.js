const http = require('http');

const payload = {
	title: 'Test Event',
	eventScoringType: 'standard',
	rubricLegend: 'Legend',
	directRatingConfig: {
		maxNOAT: 40,
		maxInterview: 60,
		strandBonus: { singleAlignedStrands: [], multiAlignedStrands: [], singleAlignedBonusPoints: 0, multiAlignedBonusPoints: 0 }
	},
	contestants: [
		{ name: 'Alice', entryType: 'individual', academicTrack: 'STEM', laptopAvailable: 'Yes', programTag: null },
		{ name: 'Bob', entryType: 'individual', academicTrack: 'HUMSS', laptopAvailable: 'No', programTag: null }
	],
	judges: [
		{ name: 'Judge 1', email: 'j1@test.com' }
	],
	criteria: [
		{
			name: 'Direct Rating',
			subCriteria: [
				{ name: 'AVE/GPA', maxScore: 100 },
				{ name: 'NOAT', maxScore: 40 },
				{ name: 'Interview', maxScore: 60 }
			]
		}
	]
};

const req = http.request({
	hostname: '127.0.0.1',
	port: 3007,
	path: '/api/eventscorer/events',
	method: 'POST',
	headers: {
		'Content-Type': 'application/json'
	}
}, (res) => {
	let data = '';
	res.on('data', chunk => data += chunk);
	res.on('end', () => {
		console.log(`Status: ${res.statusCode}`);
		console.log(`Body: ${data}`);
	});
});

req.on('error', (e) => {
	console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify(payload));
req.end();
