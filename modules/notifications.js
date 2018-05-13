/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf.js');
const mail = require('byteballcore/mail.js');
const emailjs = require('emailjs');

let server;

if (conf.bUseSmtp) {
	server = emailjs.server.connect({
		user: conf.smtpUser,
		password: conf.smtpPassword,
		host: conf.smtpHost,
		port: typeof conf.smtpPort == 'undefined' ? null : conf.smtpPort, // custom port
		ssl: typeof conf.smtpSsl == 'undefined' ? false : conf.smtpSsl, // ssl=true is port 465
		tls: typeof conf.smtpTls == 'undefined' ? true : conf.smtpTls // ssl=false and tls=true is port 587, both false is port 25
	});
}

function notifyAdmin(subject, body) {
	console.log('notifyAdmin:\n' + subject + '\n' + body);
	if (conf.bUseSmtp) {
		server.send({
			text: body,
			from: 'Server <' + conf.from_email + '>',
			to: 'You <' + conf.admin_email + '>',
			subject: subject
		}, function (err) {
			if (err) console.error(new Error(err));
		});
	} else {
		mail.sendmail({
			to: conf.admin_email,
			from: conf.from_email,
			subject: subject,
			body: body
		});
	}
}

exports.notifyAdmin = notifyAdmin;