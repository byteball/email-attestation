/*jslint node: true */
'use strict';
const constants = require('ocore/constants.js');
const conf = require('ocore/conf');
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const mail = require('ocore/mail');
const texts = require('./modules/texts');
const reward = require('./modules/reward');
const conversion = require('./modules/conversion');
const emailAttestation = require('./modules/email_attestation');
const notifications = require('./modules/notifications');
const randomCryptoString = require('./modules/random-crypto-string');
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
	directory: __dirname + '/locales'
});
var i18n = {};
i18nModule.init(i18n);

/**
 * user pairs his device with bot
 */
eventBus.on('paired', (from_address) => {
	respond(from_address, '');
});

/**
 * user sends message to the bot
 */
eventBus.once('headless_and_rates_ready', () => {  // we need rates to handle some messages
	const headlessWallet = require('headless-obyte');
	eventBus.on('text', (from_address, text) => {
		respond(from_address, text.trim());
	});
	if (conf.bRunWitness) {
		require('obyte-witness');
		eventBus.emit('headless_wallet_ready');
	} else {
		headlessWallet.setupChatEventHandlers();
	}
});

/**
 * user pays to the bot
 */
eventBus.on('new_my_transactions', handleNewTransactions);

/**
 * payment is confirmed
 */
eventBus.on('my_transactions_became_stable', handleTransactionsBecameStable);

/**
 * ready headless wallet
 */
eventBus.once('headless_wallet_ready', handleWalletReady);

function handleWalletReady() {
	let error = '';

	/**
	 * check if database tables is created
	 */
	let arrTableNames = [
		'users','receiving_addresses','transactions','verification_emails','attestation_units','rejected_payments',
		'reward_units','referral_reward_units'
	];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND NAME IN (?)", [arrTableNames], (rows) => {
		if (rows.length !== arrTableNames.length) {
			error += texts.errorInitSql();
		}

		/**
		 * check if config is filled correct
		 */
		if (conf.bUseSmtp && (!conf.smtpHost || !conf.smtpUser || !conf.smtpPassword)) {
			error += texts.errorConfigSmtp();
		}
		if (!conf.admin_email || !conf.from_email || !conf.attestation_from_email) {
			error += texts.errorConfigEmail();
		}
		if (!conf.salt) {
			error += texts.errorConfigSalt();
		}

		if (error) {
			throw new Error(error);
		}

		const headlessWallet = require('headless-obyte');
		headlessWallet.issueOrSelectAddressByIndex(0, 0, (address1) => {
			console.log('== email attestation address: ' + address1);
			emailAttestation.emailAttestorAddress = address1;

			headlessWallet.issueOrSelectAddressByIndex(0, 1, (address2) => {
				console.log('== distribution address: ' + address2);
				reward.distributionAddress = address2;

				setInterval(emailAttestation.retryPostingAttestations, 60*1000);
				setInterval(reward.retrySendingRewards, 60*1000);
				setInterval(retrySendingEmails, 60*1000);
				setInterval(moveFundsToAttestorAddresses, 60*1000);
			});
		});
	});
}

function moveFundsToAttestorAddresses() {
	let network = require('ocore/network.js');
	const mutex = require('ocore/mutex.js');
	if (network.isCatchingUp())
		return;

	mutex.lock(['moveFundsToAttestorAddresses'], unlock => {
		console.log('moveFundsToAttestorAddresses');
		db.query(
			`SELECT * FROM (
				SELECT DISTINCT receiving_address
				FROM receiving_addresses 
				CROSS JOIN outputs ON receiving_address = address 
				JOIN units USING(unit)
				WHERE is_stable=1 AND is_spent=0 AND asset IS NULL
			) AS t
			WHERE NOT EXISTS (
				SELECT * FROM units CROSS JOIN unit_authors USING(unit)
				WHERE is_stable=0 AND unit_authors.address=t.receiving_address AND definition_chash IS NOT NULL
			)
			LIMIT ?`,
			[constants.MAX_AUTHORS_PER_UNIT],
			(rows) => {
				// console.error('moveFundsToAttestorAddresses', rows);
				if (rows.length === 0) {
					console.log("nothing to move");
					return unlock();
				}

				let arrAddresses = rows.map(row => row.receiving_address);
				// console.error(arrAddresses, emailAttestation.emailAttestorAddress);
				let headlessWallet = require('headless-obyte');
				headlessWallet.sendMultiPayment({
					asset: null,
					to_address: emailAttestation.emailAttestorAddress,
					send_all: true,
					paying_addresses: arrAddresses
				}, (err, unit) => {
					if (err) {
						console.error("failed to move funds: " + err);
						let balances = require('ocore/balances');
						balances.readBalance(arrAddresses[0], (balance) => {
							console.error('balance', balance);
							notifications.notifyAdmin('failed to move funds', err + ", balance: " + JSON.stringify(balance));
							unlock();
						});
					}
					else{
						console.log("moved funds, unit " + unit);
						unlock();
					}
				});
			}
		);
	});
}

function retrySendingEmails() {
	db.query(
		`SELECT
			code, user_email, transaction_id,
			device_address
		FROM verification_emails
		JOIN transactions USING(transaction_id)
		JOIN receiving_addresses USING(receiving_address, user_email)
		WHERE is_sent = 0 AND result IS NULL
		ORDER BY verification_emails.creation_date ASC`,
		(rows) => {
			rows.forEach((row) => {
				sendVerificationCodeToEmailAndMarkIsSent(row.user_email, row.code, row.transaction_id, row.device_address);
			});
		}
	);
}

function handleNewTransactions(arrUnits) {
	let device = require('ocore/device.js');
	db.query(
		`SELECT
			amount, asset, unit,
			receiving_address, device_address, user_address, user_email, price,
			${db.getUnixTimestamp('last_price_date')} AS price_ts
		FROM outputs
		CROSS JOIN receiving_addresses ON receiving_addresses.receiving_address = outputs.address
		WHERE unit IN(?)
			AND NOT EXISTS (
				SELECT 1
				FROM unit_authors
				CROSS JOIN my_addresses USING(address)
				WHERE unit_authors.unit = outputs.unit
			)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {
				db.query(
					`SELECT lang FROM users WHERE device_address = ? LIMIT 1`,
					[row.device_address],
					(users) => {
						let user = users[0];

						if (user.lang != 'unknown') {
							i18nModule.setLocale(i18n, conf.languagesAvailable[user.lang].file);
						}

						checkPayment(row, (error) => {
							if (error) {
								return db.query(
									`INSERT ${db.getIgnore()} INTO rejected_payments
									(receiving_address, price, received_amount, payment_unit, error)
									VALUES (?,?,?,?,?)`,
									[row.receiving_address, row.price, row.amount, row.unit, error],
									() => {
										device.sendMessageToDevice(row.device_address, 'text', error);
									}
								);
							}

							db.query(
								`INSERT INTO transactions
								(receiving_address, price, received_amount, payment_unit)
								VALUES (?,?,?,?)`,
								[row.receiving_address, row.price, row.amount, row.unit],
								() => {
									device.sendMessageToDevice(row.device_address, 'text', i18n.__('receivedYourPayment', {receivedInGBytes:row.amount/1e9}));
								}
							);

						}); // checkPayment
					}
				);

			});
		}
	);
}

function checkPayment(row, onDone) {
	if (row.asset !== null) {
		return onDone("Received payment in wrong asset");
	}

	if (row.amount < conf.priceInBytes) {
		let text = i18n.__('receivedLessThanExpected', {receivedInBytes:row.amount, priceInBytes:conf.priceInBytes});
		return onDone(text + '\n\n' + i18n.__('pleasePay', {payButton:getObytePayButton('attestation payment', row.receiving_address, conf.priceInBytes, row.user_address)}));
	}

	function resetUserAddress(){
		db.query("UPDATE users SET user_address=NULL WHERE device_address=?", [row.device_address]);
	}

	db.query("SELECT address FROM unit_authors WHERE unit=?", [row.unit], (author_rows) => {
		if (author_rows.length !== 1){
			resetUserAddress();
			return onDone(i18n.__('receivedPaymentFromMultipleAddresses') +"\n"+ i18n.__('switchToSingleAddress'));
		}
		if (author_rows[0].address !== row.user_address){
			resetUserAddress();
			return onDone(i18n.__('receivedPaymentNotFromExpectedAddress', {address:row.user_address}) +"\n"+ i18n.__('switchToSingleAddress'));
		}
		onDone();
	});
}

function handleTransactionsBecameStable(arrUnits) {
	let device = require('ocore/device.js');
	db.query(
		`SELECT
			transaction_id,
			device_address, user_address, user_email
		FROM transactions
		JOIN receiving_addresses USING(receiving_address)
		WHERE payment_unit IN(?)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {
				db.query(
					`UPDATE transactions
					SET confirmation_date=${db.getNow()}, is_confirmed=1
					WHERE transaction_id=?`,
					[row.transaction_id],
					() => {
						device.sendMessageToDevice(row.device_address, 'text', i18n.__('paymentIsConfirmed'));

						/**
						 * create and send verification code to attestation email
						 */
						const verificationCode = randomCryptoString.generateByLengthSync(10);

						db.query(
							`INSERT INTO verification_emails
							(transaction_id, user_email, code)
							VALUES(?,?,?)`,
							[row.transaction_id, row.user_email, verificationCode],
							() => {
								sendVerificationCodeToEmailAndMarkIsSent(row.user_email, verificationCode, row.transaction_id, row.device_address);
							}
						);

					}
				);
			});
		}
	);
}

function sendVerificationCodeToEmailAndMarkIsSent(user_email, code, transaction_id, device_address) {
	let device = require('ocore/device.js');

	db.query(
		`SELECT lang FROM users WHERE device_address = ? LIMIT 1`,
		[device_address],
		(users) => {
			let user = users[0];
			if (user.lang != 'unknown') {
				i18nModule.setLocale(i18n, conf.languagesAvailable[user.lang].file);
			}

			mail.sendmail({
				from: `${conf.attestation_from_name ? conf.attestation_from_name + ' ' : ''}<${conf.attestation_from_email}>`,
				to: user_email,
				subject: i18n.__('verificationEmailSubject'),
				body: i18n.__('verificationEmailText', {verificationCode:code, deviceName:conf.deviceName}),
				htmlBody: i18n.__('verificationEmailHtml', {verificationCode:code, deviceName:conf.deviceName})
			}, (err) => {
				if (err) {
					console.error(err);
					notifications.notifyAdmin('failed to send mail', `failed to send mail to ${user_email}: ${err}`);
				}

				db.query(
					`UPDATE verification_emails
					SET is_sent=?
					WHERE transaction_id=? AND user_email=?`,
					[1, transaction_id, user_email],
					() => {
						device.sendMessageToDevice(device_address, 'text', i18n.__('emailWasSent', {emailAddress:user_email, sendEmailAgain:getTxtCommandButton(i18n.__('sendEmailAgainButton'), "send email again")}));
					}
				);
			});
		}
	);
}

/**
 * scenario for responding to user requests
 * @param from_address
 * @param text
 * @param response
 */
function respond (from_address, text, response = '') {
	let device = require('ocore/device.js');
	const mutex = require('ocore/mutex.js');

	readUserInfo(from_address, (userInfo) => {
		if (userInfo.lang != 'unknown') {
			i18nModule.setLocale(i18n, conf.languagesAvailable[userInfo.lang].file);
		}

		function checkUserAddress(onDone) {
			if (validationUtils.isValidAddress(text)) {
				userInfo.user_address = text;
				response += i18n.__('goingToAttestAddress', {address:userInfo.user_address});
				return db.query(
					'UPDATE users SET user_address=? WHERE device_address=?',
					[userInfo.user_address, from_address],
					() => {
						onDone();
					}
				);
			}
			if (userInfo.user_address) return onDone();
			onDone(i18n.__('insertMyAddress'));
		}

		function checkUserEmail(onDone) {
			if (validationUtils.isValidEmail(text)) {
				userInfo.user_email = text.toLowerCase();
				response += i18n.__('goingToAttestEmail', {email:userInfo.user_email});
				if (conf.rewardInUSD) {
					response += " " + (checkIsEmailQualifiedForReward(userInfo.user_email) ? i18n.__('whitelistedAddressForReward') : i18n.__('notWhitelistedAddressForReward'));
				}
				return db.query(
					'UPDATE users SET user_email=? WHERE device_address=? AND user_address=?',
					[userInfo.user_email, from_address, userInfo.user_address],
					() => {
						onDone();
					}
				);
			}
			if (userInfo.user_email) return onDone();
			onDone(i18n.__('insertMyEmail'));
		}

		checkUserAddress((userAddressResponse) => {
			/*
			 * user selected a new language
			 */
			if (text.indexOf('select language ') == 0 && conf.isMultiLingual) {

				let lang = text.replace('select language ', '');
				if (lang && conf.languagesAvailable[lang]) {
					userInfo.lang = lang;
					db.query("UPDATE users SET lang=? WHERE device_address == ? ", [userInfo.lang, from_address]);
					i18nModule.setLocale(i18n, conf.languagesAvailable[lang].file);
					if (userAddressResponse) {
						userAddressResponse = i18n.__('insertMyAddress');
					}
					device.sendMessageToDevice(from_address, 'text', "➡ " + getTxtCommandButton("Go back to language selection", "select language") + '\n\n' + i18n.__('greeting', {priceInGBytes:conf.priceInBytes/1e9}) + (arrWhitelistEmails.length && conf.rewardInUSD ? '\n\n' + i18n.__('whiteListedReward', {arrWhitelistEmails:arrWhitelistEmails.join(',\n'), rewardInUSD:conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})}) : ''));
				}

			}

			if ((userInfo.lang === 'unknown' || text === "select language") && conf.isMultiLingual) {
				// If unknown language and multi-language turned on then we propose to select one
				return device.sendMessageToDevice(from_address, 'text', getLanguagesSelection());
			}
			else if (text === '') {
				// else if paring then we start with greeting text
				device.sendMessageToDevice(from_address, 'text', i18n.__('greeting', {priceInGBytes:conf.priceInBytes/1e9}) + (arrWhitelistEmails.length && conf.rewardInUSD ? '\n\n' + i18n.__('whiteListedReward', {arrWhitelistEmails:arrWhitelistEmails.join(',\n'), rewardInUSD:conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})}) : ''));
			}

			if (userAddressResponse) {
				return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + userAddressResponse);
			}

			checkUserEmail((userEmailResponse) => {
				if (userEmailResponse) {
					return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + userEmailResponse);
				}

				readOrAssignReceivingAddress(from_address, userInfo, (receiving_address, post_publicly) => {
					let price = conf.priceInBytes;

					if (text === 'private' || text === 'public') {
						post_publicly = (text === 'public') ? 1 : 0;
						db.query(
							`UPDATE receiving_addresses
							SET post_publicly=?
							WHERE device_address=? AND user_address=? AND user_email=?`,
							[post_publicly, from_address, userInfo.user_address, userInfo.user_email]
						);
						response += (text === "private") ? i18n.__('privateChosen', {publicButton:getTxtCommandButton(i18n.__('publicButton'), 'public')}) : i18n.__('publicChosen', {email:userInfo.user_email, privateButton:getTxtCommandButton(i18n.__('privateButton'), 'private')});
					}

					if (post_publicly === null) {
						return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + i18n.__('privateOrPublic', {buttons:getTxtCommandButton(i18n.__('privateButton'), 'private') +'\t'+ getTxtCommandButton(i18n.__('publicButton'), 'public')}));
					}

					if (text === 'again') {
						return device.sendMessageToDevice(
							from_address,
							'text',
							(response ? response + '\n\n' : '') + i18n.__('pleasePay', {payButton:getObytePayButton('attestation payment',receiving_address, price, userInfo.user_address)}) + '\n\n' +
							((post_publicly === 0) ? i18n.__('privateChosen', {publicButton:getTxtCommandButton(i18n.__('publicButton'), 'public')}) : i18n.__('publicChosen', {email:userInfo.user_email, privateButton:getTxtCommandButton(i18n.__('privateButton'), 'private')}))
						);
					}

					db.query(
						`SELECT
							transaction_id, is_confirmed, received_amount, user_address, user_email,
							code, result, attestation_date
						FROM transactions
						JOIN receiving_addresses USING(receiving_address)
						LEFT JOIN verification_emails USING(transaction_id, user_email)
						LEFT JOIN attestation_units USING(transaction_id)
						WHERE receiving_address=?
						ORDER BY transaction_id DESC
						LIMIT 1`,
						[receiving_address],
						(rows) => {
							/**
							 * if user didn't pay yet
							 */
							if (rows.length === 0) {
								return device.sendMessageToDevice(
									from_address,
									'text',
									(response ? response + '\n\n' : '') + ((post_publicly === null) ? (i18n.__('privateOrPublic', {buttons:getTxtCommandButton(i18n.__('privateButton'), 'private') +'\t'+ getTxtCommandButton(i18n.__('publicButton'), 'public')})) : (i18n.__('pleasePay', {payButton:getObytePayButton('attestation payment', receiving_address, price, userInfo.user_address)})))

								);
							}

							let row = rows[0];
							let transaction_id = row.transaction_id;

							/**
							 * if user paid, but transaction did not become stable
							 */
							if (row.is_confirmed === 0) {
								return device.sendMessageToDevice(
									from_address,
									'text',
									(response ? response + '\n\n' : '') + i18n.__('receivedYourPayment', {receivedInGBytes:row.received_amount/1e9})
								);
							}

							let email_verification_result = row.result;
							/**
							 * if user still did not enter correct verification code
							 */
							if (email_verification_result === null) {

								/**
								 * user wants to receive email again
								 */
								if (text === 'send email again') {
									return db.query(
										`UPDATE verification_emails
										SET is_sent=0
										WHERE transaction_id=?`,
										[transaction_id],
										() => {
											sendVerificationCodeToEmailAndMarkIsSent(row.user_email, row.code, transaction_id, from_address);
										}
									);
								} else if (text === 'private' || text === 'public') {

									return device.sendMessageToDevice(from_address, 'text', response);

								} else {

									return mutex.lock(['tx-'+transaction_id], (unlock) => {

										/**
										 * check again verification email result
										 */
										db.query(
											`SELECT
												payment_unit,
												post_publicly,
												code, result, number_of_attempts, user_email
											FROM transactions
											JOIN receiving_addresses USING(receiving_address)
											LEFT JOIN verification_emails USING(transaction_id, user_email)
											WHERE receiving_address=? AND transaction_id=?
											LIMIT 1`,
											[receiving_address, transaction_id],
											(rows) => {
												let row = rows[0];

												if (row.result !== null)
													return unlock(true);

												/**
												 * if user still did not enter correct verification code
												 */

												/**
												 * if user enters correct verification code
												 */
												if (text === row.code) {

													return db.query(
														`UPDATE verification_emails
														SET result=1, result_date=${db.getNow()}
														WHERE transaction_id=?`,
														[transaction_id],
														() => {
															unlock(false);

															device.sendMessageToDevice(
																from_address,
																'text',
																(response ? response + '\n\n' : '') + i18n.__('codeConfirmedEmailInAttestation', {email:row.user_email})
															);

															db.query(
																`INSERT ${db.getIgnore()} INTO attestation_units
																(transaction_id)
																VALUES (?)`,
																[transaction_id],
																() => {

																	let	[attestation, src_profile] = emailAttestation.getAttestationPayloadAndSrcProfile(
																		userInfo.user_address,
																		row.user_email,
																		row.post_publicly
																	);

																	emailAttestation.postAndWriteAttestation(
																		transaction_id,
																		emailAttestation.emailAttestorAddress,
																		attestation,
																		src_profile
																	);

																	if (checkIsEmailQualifiedForReward(row.user_email) && conf.rewardInUSD) {
																		let rewardInBytes = conversion.getPriceInBytes(conf.rewardInUSD);
																		db.query(
																			`INSERT ${db.getIgnore()} INTO reward_units
																			(transaction_id, device_address, user_address, user_email, user_id, reward)
																			VALUES (?, ?,?,?,?, ?)`,
																			[transaction_id, from_address, userInfo.user_address, row.user_email, attestation.profile.user_id, rewardInBytes],
																			(res) => {
																				console.error(`reward_units insertId: ${res.insertId}, affectedRows: ${res.affectedRows}`);
																				if (!res.affectedRows) {
																					return console.log(`duplicate user_address or user_id or device_address: ${userInfo.user_address}, ${attestation.profile.user_id}, ${from_address}`);
																				}

																				device.sendMessageToDevice(from_address, 'text', i18n.__('attestedSuccessFirstTimeBonus', {rewardInUSD:conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2}), rewardInGBytes:(rewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})}));
																				reward.sendAndWriteReward('attestation', transaction_id);

																				if (conf.referralRewardInUSD) {
																					let referralRewardInBytes = conversion.getPriceInBytes(conf.referralRewardInUSD);
																					reward.findReferrer(row.payment_unit, userInfo.user_address, (referring_user_id, referring_user_address, referring_user_device_address) => {
																						if (!referring_user_address) {
																							// console.error("no referring user for " + row.user_address);
																							return console.log("no referring user for " + userInfo.user_address);
																						}

																						db.query(
																							`INSERT ${db.getIgnore()} INTO referral_reward_units
																							(transaction_id, user_address, user_id, new_user_address, new_user_id, reward)
																							VALUES (?, ?,?, ?,?, ?)`,
																							[transaction_id,
																								referring_user_address, referring_user_id,
																								userInfo.user_address, attestation.profile.user_id,
																								referralRewardInBytes],
																							(res) => {
																								console.log(`referral_reward_units insertId: ${res.insertId}, affectedRows: ${res.affectedRows}`);
																								if (!res.affectedRows) {
																									return notifications.notifyAdmin(
																										"duplicate referral reward",
																										`referral reward for new user ${userInfo.user_address} ${attestation.profile.user_id} already written`
																									);
																								}

																								device.sendMessageToDevice(referring_user_device_address, 'text', i18n.__('referredUserBonus', {referralRewardInUSD:conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2}), referralRewardInGBytes:(referralRewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})}));
																								reward.sendAndWriteReward('referral', transaction_id);
																							}
																						);
																					});
																				} // if conf.referralRewardInUSD

																			}
																		);
																	} // if conf.rewardInBytes

																}
															);

														}
													);

												} else {
													/**
													 * if user enters wrong verification code
													 */
													let currNumberAttempts = Number(row.number_of_attempts);
													let leftNumberAttempts = conf.MAX_ATTEMPTS - currNumberAttempts;

													/**
													 * increase attempts only when something was sent, but not while re-pairing at this state
													 */
													if (text && text.indexOf('select language ') !== 0) {
														currNumberAttempts++;
														leftNumberAttempts = conf.MAX_ATTEMPTS - currNumberAttempts;
														if (leftNumberAttempts == 1) {
															response = (response ? response + '\n\n' : '') + i18n.__('wrongVerificationCodeLast');
														}
														else {
															response = (response ? response + '\n\n' : '') + i18n.__('wrongVerificationCode', {attemptsLeft:leftNumberAttempts});
														}
													}

													if (leftNumberAttempts > 0) {
														return db.query(
															`UPDATE verification_emails
															SET number_of_attempts=?
															WHERE transaction_id=?`,
															[currNumberAttempts, transaction_id],
															() => {
																unlock(false);

																device.sendMessageToDevice(
																	from_address,
																	'text',
																	(response ? response + '\n\n' : '') + i18n.__('emailWasSent', {emailAddress:row.user_email, sendEmailAgain:getTxtCommandButton(i18n.__('sendEmailAgainButton'), "send email again")})
																);

															}
														);
													} else {
														/**
														 * no more chance, attestation is failed
														 */
														return db.query(
															`UPDATE verification_emails
															SET number_of_attempts=?, result=0, result_date=${db.getNow()}
															WHERE transaction_id=?`,
															[currNumberAttempts, transaction_id],
															() => {
																unlock(false);

																device.sendMessageToDevice(
																	from_address,
																	'text',
																	(response ? response + '\n\n' : '') + i18n.__('currentAttestationFailed', {againButton:getTxtCommandButton(i18n.__('againButton'), 'again')})
																);

															}
														);
													} // no more chance, attestation is failed

												} // user enters wrong verification code

											});

									}, (bIsNeededNextCall) => {
										if (bIsNeededNextCall)
											callLastScenarioChecks();
									}); // mutex.lock userInfo.user_address

								}
							} // if email_verification_result === null

							callLastScenarioChecks();

							function callLastScenarioChecks() {
								/**
								 * previous attestation was failed
								 */
								if (email_verification_result === 0) {
									return device.sendMessageToDevice(
										from_address,
										'text',
										(response ? response + '\n\n' : '') + i18n.__('previousAttestationFailed', {againButton:getTxtCommandButton(i18n.__('againButton'), 'again')})
									);
								}

								/**
								 * email is in attestation
								 */
								if (!row.attestation_date) {
									return device.sendMessageToDevice(
										from_address,
										'text',
										(response ? response + '\n\n' : '') + i18n.__('codeConfirmedEmailInAttestation', {email:row.user_email})
									);
								}

								/**
								 * no more available commands, user email is attested
								 */
								return device.sendMessageToDevice(
									from_address,
									'text',
									(response ? response + '\n\n' : '') + i18n.__('alreadyAttested', {attestationDate:row.attestation_date, againButton:getTxtCommandButton(i18n.__('againButton'), 'again')})
								);
							}

						}
					);
				});
			});
		});
	});
}

function getLanguagesSelection() {

	var returnedTxt = "Please select your language: ";
	for (var index in conf.languagesAvailable) {
		returnedTxt += "\n➡ " + getTxtCommandButton(conf.languagesAvailable[index].name, "select language " + index);
	}

	return returnedTxt;
}

function getTxtCommandButton(label, command) {
	var text = "";
	var _command = command ? command : label;
	text += "[" + label + "]" + "(command:" + _command + ")";
	return text;
}

function getObytePayButton(label, address, price, user_address) {
	var text = "";
	text += `[${label}](byteball:${address}?amount=${price}&single_address=single${user_address})`;
	return text;
}

function checkIsEmailQualifiedForReward(email) {
	let objRewardWhiteListEmails = conf.objRewardWhiteListEmails;
	for (let key in objRewardWhiteListEmails) {
		if (!objRewardWhiteListEmails.hasOwnProperty(key)) continue;
	//	console.error('checkIsEmailQualifiedForReward', objRewardWhiteListEmails[key].test(email), email, objRewardWhiteListEmails[key]);
		if (objRewardWhiteListEmails[key].test(email)) {
			return true;
		}
	}
	return false;
}

/**
 * get user's information by device address
 * or create new user, if it's new device address
 * @param device_address
 * @param callback
 */
function readUserInfo (device_address, callback) {
	db.query('SELECT user_address, user_email, lang FROM users WHERE device_address = ?', [device_address], (rows) => {
		if (rows.length) {
			callback(rows[0]);
		} else {
			db.query(`INSERT ${db.getIgnore()} INTO users (device_address) VALUES(?)`, [device_address], () => {
				callback({ device_address, user_address: null, lang: 'unknown' });
			});
		}
	});
}

/**
 * read or assign receiving address
 * @param device_address
 * @param userInfo
 * @param callback
 */
function readOrAssignReceivingAddress(device_address, userInfo, callback) {
	const mutex = require('ocore/mutex.js');
	mutex.lock([device_address], (unlock) => {
		db.query(
			`SELECT receiving_address, post_publicly, ${db.getUnixTimestamp('last_price_date')} AS price_ts
			FROM receiving_addresses
			WHERE device_address=? AND user_address=? AND user_email=?`,
			[device_address, userInfo.user_address, userInfo.user_email],
			(rows) => {
				if (rows.length > 0) {
					let row = rows[0];
					callback(row.receiving_address, row.post_publicly);
					return unlock();
				}

				const headlessWallet = require('headless-obyte');
				headlessWallet.issueNextMainAddress((receiving_address) => {
					db.query(
						`INSERT INTO receiving_addresses
						(device_address, user_address, user_email, receiving_address, price, last_price_date)
						VALUES(?,?,?,?,?,${db.getNow()})`,
						[device_address, userInfo.user_address, userInfo.user_email, receiving_address, conf.priceInBytes],
						() => {
							callback(receiving_address, null);
							unlock();
						}
					);
				});
			}
		);
	});
}