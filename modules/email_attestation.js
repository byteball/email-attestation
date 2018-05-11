/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf');
const objectHash = require('byteballcore/object_hash.js');
const db = require('byteballcore/db');
const notifications = require('./notifications');
const i18nModule = require("i18n");
const arrWhitelistEmails = Object.keys(conf.objRewardWhiteListEmails);

var arrLanguages = [];
if (conf.isMultiLingual) {
	for (var index in conf.languagesAvailable) {
		arrLanguages.push(conf.languagesAvailable[index].file);
	}
}

i18nModule.configure({
	locales: arrLanguages,
	directory: __dirname + '/../locales'
});

var i18n = {};
i18nModule.init(i18n);

function retryPostingAttestations() {
	db.query(
		`SELECT
			transaction_id,
			user_address, user_email, post_publicly
		FROM attestation_units
		JOIN transactions USING(transaction_id)
		JOIN receiving_addresses USING(receiving_address)
		WHERE attestation_unit IS NULL AND post_publicly=0`,
		(rows) => {
			rows.forEach((row) => {
				let	[attestation, src_profile] = getAttestationPayloadAndSrcProfile(
					row.user_address,
					row.user_email,
					row.post_publicly
				);
				// console.error('retryPostingAttestations: ' + row.transaction_id + ' ' + row.post_publicly);
				// console.error(attestation);
				// console.error(src_profile);
				postAndWriteAttestation(row.transaction_id, exports.emailAttestorAddress, attestation, src_profile);
			});
		}
	);
}

function postAndWriteAttestation(transaction_id, attestor_address, attestation_payload, src_profile, callback) {
	if (!callback) callback = function () {};
	const mutex = require('byteballcore/mutex.js');
	mutex.lock(['tx-'+transaction_id], (unlock) => {
		db.query(
			`SELECT device_address, attestation_date
			FROM attestation_units
			JOIN transactions USING(transaction_id)
			JOIN receiving_addresses USING(receiving_address)
			WHERE transaction_id=?`,
			[transaction_id],
			(rows) => {
				let row = rows[0];
				if (row.attestation_date) { // already posted
					callback(null, null);
					return unlock();
				}

				postAttestation(attestor_address, attestation_payload, (err, unit) => {
					if (err) {
						callback(err);
						return unlock();
					}

					db.query(
						`UPDATE attestation_units
						SET attestation_unit=?, attestation_date=${db.getNow()}
						WHERE transaction_id=?`,
						[unit, transaction_id],
						() => {
							db.query(
								`SELECT lang FROM attestation_units JOIN attestations ON attestations.unit = attestation_units.attestation_unit JOIN users ON attestations.address = users.user_address WHERE transaction_id = ? LIMIT 1`,
								[transaction_id],
								(users) => {
									let device = require('byteballcore/device.js');
									let user = users[0];
									let explorer = (conf.hub == 'byteball.org/bb-test' ? 'https://testnetexplorer.byteball.org/#' : 'https://explorer.byteball.org/#');

									if (user.lang != 'unknown') {
										i18nModule.setLocale(i18n, conf.languagesAvailable[user.lang].file);
									}
									let text = i18n.__('seeAttestationUnit', {explorer:explorer + unit});

									if (src_profile) {
										let private_profile = {
											unit: unit,
											payload_hash: objectHash.getBase64Hash(attestation_payload),
											src_profile: src_profile
										};
										let base64PrivateProfile = Buffer.from(JSON.stringify(private_profile)).toString('base64');
										text += "\n\n" + i18n.__('savePrivateProfile', {privateProfile:'[private profile](profile:'+base64PrivateProfile+')'});
									}

									if (arrWhitelistEmails.length && conf.referralRewardInUSD) {
										text += "\n\n" + i18n.__('weHaveReferralProgram', {arrWhitelistEmails:arrWhitelistEmails.join(',\n'), referralRewardInUSD:conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2})});
									}
									device.sendMessageToDevice(row.device_address, 'text', text);
									callback(null, unit);
									unlock();
								}
							);
						}
					);
				});
			}
		);
	});
}

function postAttestation(attestor_address, payload, onDone) {
	function onError(err) {
		console.error("attestation failed: " + err);
		let balances = require('byteballcore/balances');
		balances.readBalance(attestor_address, (balance) => {
			console.error('balance', balance);
			notifications.notifyAdmin('attestation failed', err + ", balance: " + JSON.stringify(balance));
		});
		onDone(err);
	}

	let network = require('byteballcore/network.js');
	let composer = require('byteballcore/composer.js');
	let headlessWallet = require('headless-byteball');
	let objMessage = {
		app: "attestation",
		payload_location: "inline",
		payload_hash: objectHash.getBase64Hash(payload),
		payload: payload
	};

	let params = {
		paying_addresses: [attestor_address],
		outputs: [{address: attestor_address, amount: 0}],
		messages: [objMessage],
		signer: headlessWallet.signer,
		callbacks: composer.getSavingCallbacks({
			ifNotEnoughFunds: onError,
			ifError: onError,
			ifOk: (objJoint) => {
				// console.error('ifOk');
				// console.error(objJoint);
				network.broadcastJoint(objJoint);
				onDone(null, objJoint.unit.unit);
			}
		})
	};
	if (conf.bPostTimestamp && attestor_address === exports.emailAttestorAddress) {
		let timestamp = Date.now();
		let dataFeed = {timestamp};
		let objTimestampMessage = {
			app: "data_feed",
			payload_location: "inline",
			payload_hash: objectHash.getBase64Hash(dataFeed),
			payload: dataFeed
		};
		params.messages.push(objTimestampMessage);
	}
	composer.composeJoint(params);
}

function getUserId(profile){
	return objectHash.getBase64Hash([profile, conf.salt]);
}

function getAttestationPayloadAndSrcProfile(user_address, email, bPublic) {
	let profile = {
		email: email
	};
	if (bPublic) {
		profile.user_id = getUserId(profile);
		let attestation = {
			address: user_address,
			profile: profile
		};
		return [attestation, null];
	}  else {
		let [public_profile, src_profile] = hideProfile(profile);
		let attestation = {
			address: user_address,
			profile: public_profile
		};
		return [attestation, src_profile];
	}
}

function hideProfile(profile) {
	let composer = require('byteballcore/composer.js');
	let hidden_profile = {};
	let src_profile = {};

	for (let field in profile) {
		if (!profile.hasOwnProperty(field)) continue;
		let value = profile[field];
		let blinding = composer.generateBlinding();
		// console.error(`hideProfile: ${field}, ${value}, ${blinding}`);
		let hidden_value = objectHash.getBase64Hash([value, blinding]);
		hidden_profile[field] = hidden_value;
		src_profile[field] = [value, blinding];
	}
	let profile_hash = objectHash.getBase64Hash(hidden_profile);
	let user_id = getUserId(profile);
	let public_profile = {
		profile_hash: profile_hash,
		user_id: user_id
	};
	return [public_profile, src_profile];
}

exports.emailAttestorAddress = null;
exports.getAttestationPayloadAndSrcProfile = getAttestationPayloadAndSrcProfile;
exports.postAndWriteAttestation = postAndWriteAttestation;
exports.retryPostingAttestations = retryPostingAttestations;