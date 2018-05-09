/*jslint node: true */
'use strict';
const fs = require('fs');
const db = require('byteballcore/db.js');

let db_sql = fs.readFileSync('db.sql', 'utf8');
db_sql.split('-- query separator').forEach(function(sql) {
	if (sql) {
		db.query(sql, [], (rows) => {
			console.log(sql);
		});
	}
})

// check if tables exist
let arrTableNames = [
	'users','receiving_addresses','transactions','verification_emails','attestation_units','rejected_payments',
	'reward_units','referral_reward_units'
];
db.query("SELECT name FROM sqlite_master WHERE type='table' AND NAME IN (?)", [arrTableNames], (rows) => {
	console.log(rows);
});