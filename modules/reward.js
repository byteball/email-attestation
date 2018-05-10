/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf');
const db = require('byteballcore/db');
const notifications = require('./notifications');
const emailAttestation = require('./email_attestation');

exports.distributionAddress = null;

function sendReward(user_address, reward, device_address, onDone) {
	let headlessWallet = require('headless-byteball');
	headlessWallet.sendMultiPayment({
		asset: null,
		amount: reward,
		to_address: user_address,
		paying_addresses: [exports.distributionAddress],
		change_address: exports.distributionAddress,
		recipient_device_address: device_address
	}, (err, unit) => {
		if (err) {
			console.error("failed to send reward: ", err);
			let balances = require('byteballcore/balances');
			balances.readBalance(exports.distributionAddress, (balance) => {
				console.error(balance);
				notifications.notifyAdmin('failed to send reward', err + ", balance: " + JSON.stringify(balance));
			});
		} else {
			console.log("sent reward, unit " + unit);
		}
		onDone(err, unit);
	});
}

function sendAndWriteReward(reward_type, transaction_id) {
	const mutex = require('byteballcore/mutex.js');
	const tableName = (reward_type === 'referral') ? 'referral_reward_units' : 'reward_units';
	mutex.lock(['tx-'+transaction_id], (unlock) => {
		db.query(
			`SELECT
				device_address, reward_date, reward, ${tableName}.user_address
			FROM ${tableName}
			JOIN transactions USING(transaction_id)
			JOIN receiving_addresses USING(receiving_address)
			WHERE transaction_id=?`,
			[transaction_id],
			(rows) => {
				if (rows.length === 0) {
					throw Error(`no record in ${tableName} for tx ${transaction_id}`);
				}

				let row = rows[0];
				if (row.reward_date) // already sent
					return unlock();

				sendReward(row.user_address, row.reward, row.device_address, (err, unit) => {
					if (err)
						return unlock();

					db.query(
						`UPDATE ${tableName} SET reward_unit=?, reward_date=${db.getNow()} WHERE transaction_id=?`,
						[unit, transaction_id],
						() => {
							let device = require('byteballcore/device.js');
							//device.sendMessageToDevice(row.device_address, 'text', `Sent the ${reward_type} reward`);
							unlock();
						}
					);
				});
			}
		);
	});
}

function retrySendingRewardsOfType(reward_type) {
	const tableName = (reward_type === 'referral') ? 'referral_reward_units' : 'reward_units';
	db.query(
		`SELECT transaction_id
		FROM ${tableName}
		WHERE reward_unit IS NULL`,
		(rows) => {
			rows.forEach((row) => {
				sendAndWriteReward(reward_type, row.transaction_id);
			});
		}
	);
}

function retrySendingRewards() {
	retrySendingRewardsOfType('attestation');
	retrySendingRewardsOfType('referral');
}

function findReferrer(payment_unit, user_address, handleReferrer) {
	let assocMcisByAddress = {};
	let depth = 0;

	function goBack(arrUnits) {
		depth++;
		// console.error('goBack', depth, arrUnits);
		if (!arrUnits || !arrUnits.length) return handleReferrer();
		db.query(
			`SELECT
				address, src_unit, main_chain_index
			FROM inputs
			JOIN units ON src_unit=units.unit
			WHERE inputs.unit IN(?)
				AND type='transfer'
				AND asset IS NULL`,
			[arrUnits],
			(rows) => {
				rows.forEach((row) => {
					if (row.address === user_address) // no self-refferrers
						return;
					if (!assocMcisByAddress[row.address] || assocMcisByAddress[row.address] < row.main_chain_index)
						assocMcisByAddress[row.address] = row.main_chain_index;
				});
				let arrSrcUnits = rows.map((row) => row.src_unit);
				(depth < conf.MAX_REFERRAL_DEPTH) ? goBack(arrSrcUnits) : selectReferrer();
			}
		);
	}

	// the referrer doesn't have to have a whitelisted email
	function selectReferrer() {
		let arrAddresses = Object.keys(assocMcisByAddress);
		if (arrAddresses.length === 0)
			return handleReferrer();
		console.log('ancestor addresses: '+arrAddresses.join(', '));
		db.query(
			`SELECT
				address, user_address, device_address, payload, app
			FROM attestations
			JOIN messages USING(unit, message_index)
			JOIN attestation_units ON unit=attestation_unit
			JOIN transactions USING(transaction_id)
			JOIN receiving_addresses USING(receiving_address)
			WHERE address IN(${arrAddresses.map(db.escape).join(', ')})
				AND +attestor_address=?
				AND transactions.payment_unit!=?`,
			[emailAttestation.emailAttestorAddress, payment_unit],
			(rows) => {
				if (rows.length === 0){
					console.log("no referrers for payment unit "+payment_unit);
					return handleReferrer();
				}

				let max_mci = 0;
				let best_user_id, best_row;
				rows.forEach((row) => {
					if (row.app !== 'attestation') {
						throw Error(`unexpected app ${row.app} for payment ${payment_unit}`);
					}
					if (row.address !== row.user_address) {
						throw Error(`different addresses: address ${row.address}, user_address ${row.user_address} for payment ${payment_unit}`);
					}

					let payload = JSON.parse(row.payload);
					if (payload.address !== row.address) {
						throw Error(`different addresses: address ${row.address}, payload ${row.user_address} for payment ${payment_unit}`);
					}

					let user_id = payload.profile.user_id;
					if (!user_id) {
						throw Error("no user_id for payment " + payment_unit);
					}

					let mci = assocMcisByAddress[row.address];
					if (mci > max_mci) {
						max_mci = mci;
						best_row = row;
						best_user_id = user_id;
					}
				});
				if (!best_row || !best_user_id) {
					throw Error("no best for payment " + payment_unit);
				}

				handleReferrer(best_user_id, best_row.user_address, best_row.device_address);
			}
		);
	}

	goBack([payment_unit]);
}


exports.sendAndWriteReward = sendAndWriteReward;
exports.retrySendingRewards = retrySendingRewards;
exports.findReferrer = findReferrer;