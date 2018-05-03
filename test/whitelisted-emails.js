/*jslint node: true */
'use strict';
const conf = require('../conf.js');
const assert = require('assert');

function checkIsEmailQualifiedForReward(email, domain, valid) {
	let objRewardWhiteListEmails = conf.objRewardWhiteListEmails;
	if (!objRewardWhiteListEmails.hasOwnProperty(domain)) throw new Error('not listed as whitelisted domain');

	try {
		assert.strictEqual(objRewardWhiteListEmails[domain].test(email), valid);
		console.log('\x1b[32;49mPASS\x1b[39;49m:', email, (valid ? 'is whitelisted' : 'is not whitelisted'), domain, 'email.');
	}
	catch (error) {
		console.error('\x1b[31;49mFAIL\x1b[39;49m:', email, (valid ? 'SHOULD be whitelisted' : 'SHOULD NOT be whitelisted'), domain, 'email.');
	}
}

// @harvard.edu tests
checkIsEmailQualifiedForReward('test@harvard.edu', '@harvard.edu', true); // valid Harvard email
checkIsEmailQualifiedForReward('te-st.te_st@harvard.edu', '@harvard.edu', true); // valid Harvard email
checkIsEmailQualifiedForReward('Test.test@Harvard.edu', '@harvard.edu', true); // regex should be case insensitive
checkIsEmailQualifiedForReward('@harvard.edu', '@harvard.edu', false); // invalid Harvard email
checkIsEmailQualifiedForReward('test@harvard.edu.it', '@harvard.edu', false); // invalid Harvard email
checkIsEmailQualifiedForReward('test@gmail.com', '@harvard.edu', false); // gmail addresses not valid for harvard

// @eesti.ee tests
checkIsEmailQualifiedForReward('mikk.tamm@eesti.ee', '@eesti.ee', true); // valid @eesti.ee email
checkIsEmailQualifiedForReward('Mikk.Tamm@Eesti.ee', '@eesti.ee', true); // regex should be case insensitive
checkIsEmailQualifiedForReward('@eesti.ee', '@eesti.ee', false); // invalid @eesti.ee email
checkIsEmailQualifiedForReward('mikk.tamm@eesti.ee.it', '@eesti.ee', false); // invalid @eesti.ee email
checkIsEmailQualifiedForReward('mikk.tamm@gmail.com', '@eesti.ee', false); // invalid @eesti.ee email
checkIsEmailQualifiedForReward('mikk.martin.tamm@eesti.ee', '@eesti.ee', true); // people with middle name
checkIsEmailQualifiedForReward('mikk-martin.tamm@eesti.ee', '@eesti.ee', true); // firstname with the dash
checkIsEmailQualifiedForReward('mikk.martin.juku.tamm@eesti.ee', '@eesti.ee', true); // multiple firstnames
checkIsEmailQualifiedForReward('mikk.tamm-kaasik@eesti.ee', '@eesti.ee', true); // lastname with the dash
checkIsEmailQualifiedForReward('mikk.tamm.2@eesti.ee', '@eesti.ee', true); // when namesake got the address first
checkIsEmailQualifiedForReward('mi_kk.ta_mm@eesti.ee', '@eesti.ee', false); // there shouldn't be underscores in names
checkIsEmailQualifiedForReward('mikk.tamm_0001@eesti.ee', '@eesti.ee', false); // extra alternative address for those who have namesake
checkIsEmailQualifiedForReward('tamm@eesti.ee', '@eesti.ee', false); // should have both firstname and lastname
checkIsEmailQualifiedForReward('123567890@eesti.ee', '@eesti.ee', false); // government and muncipalities can send to these extra alternative adresses