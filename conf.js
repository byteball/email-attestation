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

// smtp https://github.com/byteball/byteballcore/blob/master/mail.js
exports.smtpTransport = 'local'; // use 'local' for Unix Sendmail
exports.smtpRelay = '';
exports.smtpUser = '';
exports.smtpPassword = '';
exports.smtpSsl = null;
exports.smtpPort = null;

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
//	'@usb.ve': /^[\w.-]+@usb\.ve$/i
};

exports.MAX_REFERRAL_DEPTH = 5;
exports.MAX_ATTEMPTS = 5;

exports.isMultiLingual = true;

exports.languagesAvailable = {
	en: {name: "English", file: "en"},
	da: {name: "Dansk", file: "email-attestation_da-DK"},
	de: {name: "Deutsch", file: "email-attestation_de-DE"},
	es: {name: "Español", file: "email-attestation_es-ES"},
	et: {name: "Eesti", file: "email-attestation_et-EE"},
	it: {name: "Italiano", file: "email-attestation_it-IT"},
	ja: {name: "日本語", file: "email-attestation_ja-JP"},
	nl: {name: "Nederlands", file: "email-attestation_nl-NL"},
	uk: {name: "Українська", file: "email-attestation_uk-UA"},
	zh: {name: "中文", file: "email-attestation_zh-CN"}
};