/*jslint node: true */
'use strict';
const desktopApp = require('byteballcore/desktop_app.js');
const conf = require('byteballcore/conf');

const arrListOfWhiteEmails = Object.keys(conf.objRewardWhiteListEmails);

/**
 * responses for clients
 */
exports.greeting = () => {
	return [
		"Here you can attest your email.\n\n",

		"Your email will be saved privately in your wallet, ",
		"only a proof of attestation will be posted publicly on the distributed ledger. ",
		"The very fact of being attested may give you access to some services or tokens, even without disclosing your email. ",
		"Some apps may request you to reveal of your attested email, you choose what to reveal and to which app.\n\n",

		"You may also choose to make your attested email public.\n\n",

		`The price of attestation is ${conf.priceInBytes} Bytes. `,
		"The payment is nonrefundable even if the attestation fails for any reason.\n\n",

		"After payment, you will be received email with verification code. Verification code You will need to click at the specified link.\n\n",

		`After you successfully verify email for the first time, `,
		`and if your email corresponds to:\n${arrListOfWhiteEmails.join(';\n')}.\n`,
		`you receive a $${conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} reward in Bytes.`
	].join('');
};

exports.weHaveReferralProgram = () => {
	return [
		"Remember, we have a referral program: " +
		"if you send Bytes from your attested address to a new user who is not attested yet, " +
		"and he/she uses those Bytes to pay for a successful attestation, " +
		`and he/she uses attestation email corresponds to:\n${arrListOfWhiteEmails.join(';\n')}.\n` +
		`you receive a $${conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} reward in Bytes.`
	].join('');
};

exports.insertMyAddress = () => {
	return [
		"Please send me your address that you wish to attest (click ... and Insert my address).\n",
		"Make sure you are in a single-address wallet. ",
		"If you don't have a single-address wallet, ",
		"please add one (burger menu, add wallet) and fund it with the amount sufficient to pay for the attestation."
	].join('');
};

exports.insertMyEmail = () => {
	return 'Please send me your email that you wish to attest.';
};

exports.goingToAttestAddress = (address) => {
	return `Thanks, going to attest your address: ${address}.`;
};

exports.goingToAttestEmail = (email) => {
	return `Thanks, going to attest your email: ${email}.`;
};

exports.privateOrPublic = () => {
	return [
		"Store your email privately in your wallet (recommended) or post it publicly?\n\n",
		"[private](command:private)\t[public](command:public)"
	].join('');
};

exports.privateChoose = () => {
	return [
		"Your email will be kept private and stored in your wallet.\n",
		"Click [public](command:public) now if you changed your mind."
	].join('');
};

exports.publicChoose = () => {
	return [
		"Your email will be posted into the public database and will be available for everyone.\n",
		"Click [private](command:private) now if you changed your mind."
	].join('');
};

exports.pleasePay = (receivingAddress, price) => {
	return `Please pay for the attestation: [attestation payment](byteball:${receivingAddress}?amount=${price}).`;
};

exports.pleasePayOrPrivacy = (receivingAddress, price, postPublicly) => {
	return (postPublicly === null) ? exports.privateOrPublic() : exports.pleasePay(receivingAddress, price);
};

exports.receivedPaymentFromMultipleAddresses = () => {
	return "Received a payment but looks like it was not sent from a single-address wallet.";
};

exports.receivedPaymentNotFromExpectedAddress = (address) => {
	return [
		`Received a payment but it was not sent from the expected address ${address}.\n`,
		"Make sure you are in a single-address wallet, ",
		"otherwise switch to a single-address wallet or create one and send me your address before paying."
	].join('');
};

exports.receivedYourPayment = (amount) => {
	return `Received your payment of ${amount} Bytes, waiting for confirmation. It should take 5-15 minutes.`;
};

exports.paymentIsConfirmed = () => {
	return "Your payment is confirmed. Email will be send to your specified email address.";
};

exports.wrongVerificationCode = (leftNumberOfAttempts) => {
	return `Wrong verification code! You have ${leftNumberOfAttempts} attempts left.`;
};

exports.emailWasSent = (emailAddress) => {
	return [
		`Email was sent to the ${emailAddress}. Enter to the chat verification code, specified in email.\n`,
		"If you don't receive email, click [send email again](command:send email again)."
	].join('');
};

exports.attestedSuccessFirstTimeBonus = (rewardInBytes) => {
	return [
		"You requested an attestation for the first time and will receive a welcome bonus ",
		`of $${conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} `,
		`(${(rewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})} GB) `,
		"from Byteball distribution fund."
	].join('')
};

exports.referredUserBonus = (referralRewardInBytes) => {
	return [
		"You referred a user who has just verified his identity and you will receive a reward ",
		`of $${conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} `,
		`(${(referralRewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})} GB) `,
		"from Byteball distribution fund.\n",
		"Thank you for bringing in a new byteballer, the value of the ecosystem grows with each new user!"
	].join('');
};

exports.codeConfirmedEmailInAttestation = (email) => {
	return `Verification code was confirmed. Your email ${email} is in attestation. Please, wait.`;
};

exports.alreadyAttested = (attestationDate) => {
	return `You were already attested at ${attestationDate} UTC. Attest [again](command: again)?`;
};

exports.currentAttestationFailed = () => {
	return "Your attestation failed. Try [again](command: again)?";
};
exports.previousAttestationFailed = () => {
	return "Your previous attestation failed. Try [again](command: again)?";
};

/**
 * email
 */
exports.emailSubjectEmailAttestation = () => {
	return "Email verification";
};
exports.emailPlainBodyEmailAttestation = (verificationCode) => {
	return [
		`Your verification code is ${verificationCode}\n`,
		`Enter this code to chat with "${conf.deviceName}"`,
	].join('');
};
exports.emailBodyEmailAttestation = (verificationCode) => {
	return [
		`<p>Your verification code is <h3>${verificationCode}</h3></p>`,
		`<p>Enter this code to chat with "${conf.deviceName}"</p>`,
		'<p style="font-size: 13px; color: #727272; margin-top: 15px;">-------',
		'<br>Please do not reply directly to this email.',
		'</p>'
	].join('');
};

/**
 * errors initialize bot
 */
exports.errorInitSql = () => {
	return "please import db.sql file\n";
};

exports.errorConfigSmtp = () => {
	return `please specify smtpUser, smtpPassword and smtpHost in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorConfigEmail = () => {
	return `please specify admin_email and from_email in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorConfigSalt = () => {
	return `please specify salt in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};