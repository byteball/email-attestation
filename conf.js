/*jslint node: true */
"use strict";
exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.storage = 'sqlite';

// TOR is recommended. If you don't run TOR, please comment the next two lines
exports.socksHost = '127.0.0.1';
exports.socksPort = 9050;

exports.hub = 'byteball.org/bb';
exports.deviceName = 'Email attestation bot';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [''];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.bIgnoreUnpairRequests = true;
exports.bSingleAddress = false;
exports.bStaticChangeAddress = true;
exports.KEYS_FILENAME = 'keys.json';

// smtp
exports.bUseSmtp = false;

// emails
exports.admin_email = '';
exports.from_email = '';
exports.from_email_name = 'Byteball email attestation bot';

// witnessing
exports.bRunWitness = false;
exports.THRESHOLD_DISTANCE = 20;
exports.MIN_AVAILABLE_WITNESSINGS = 100;

exports.priceInBytes = 500000;
exports.rewardInUSD = 10;
exports.referralRewardInUSD = 10;

exports.objRewardWhiteListEmails = {
	'@harvard.edu': /^[a-z\d-_.]+@harvard\.edu$/i,
	'@eesti.ee': /^(\.?[a-z-]+)+(\.[a-z-]+)+[_.]?\d*@eesti\.ee$/i,
};

exports.MAX_REFERRAL_DEPTH = 5;
exports.MAX_ATTEMPTS = 5;