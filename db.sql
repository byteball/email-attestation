CREATE TABLE IF NOT EXISTS users (
	device_address CHAR(33) NOT NULL PRIMARY KEY,
	user_address CHAR(32) NULL,
	user_email VARCHAR(320) NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (device_address) REFERENCES correspondent_devices(device_address)
);
-- query separator
CREATE TABLE IF NOT EXISTS receiving_addresses (
	receiving_address CHAR(32) NOT NULL PRIMARY KEY,
	device_address CHAR(33) NOT NULL,
	user_address CHAR(32) NOT NULL,
	user_email VARCHAR(320) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	post_publicly TINYINT NULL,
	price INT NULL,
	last_price_date TIMESTAMP NULL,
	UNIQUE (device_address, user_address, user_email),
	FOREIGN KEY (device_address) REFERENCES correspondent_devices(device_address),
	FOREIGN KEY (receiving_address) REFERENCES my_addresses(address)
);
-- query separator
CREATE INDEX IF NOT EXISTS byReceivingAddress ON receiving_addresses(receiving_address);
-- query separator
CREATE INDEX IF NOT EXISTS byUserAddress ON receiving_addresses(user_address);
-- query separator
CREATE INDEX IF NOT EXISTS byUserEmail ON receiving_addresses(user_email);
-- query separator
CREATE TABLE IF NOT EXISTS transactions (
	transaction_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	receiving_address CHAR(32) NOT NULL,
	price INT NOT NULL,
	received_amount INT NOT NULL,
	payment_unit CHAR(44) NOT NULL UNIQUE,
	payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	is_confirmed INT NOT NULL DEFAULT 0,
	confirmation_date TIMESTAMP NULL,
	FOREIGN KEY (receiving_address) REFERENCES receiving_addresses(receiving_address),
	FOREIGN KEY (payment_unit) REFERENCES units(unit) ON DELETE CASCADE
);
-- query separator
CREATE TABLE IF NOT EXISTS verification_emails (
	transaction_id INTEGER NOT NULL,
	user_email VARCHAR(320) NOT NULL,
	code CHAR(8) NOT NULL,
	number_of_attempts TINYINT NOT NULL DEFAULT 0,
	is_sent INT NOT NULL DEFAULT 0, -- 1 sent, 0 not sent
	result TINYINT NULL, -- 1 success, 0 failure, NULL pending or abandoned
	result_date TIMESTAMP NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (transaction_id),
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
);
-- query separator
CREATE INDEX IF NOT EXISTS byVerificationEmailIsSent ON verification_emails(is_sent);
-- query separator
CREATE TABLE IF NOT EXISTS attestation_units (
	transaction_id INTEGER NOT NULL,
	attestation_unit CHAR(44) NULL UNIQUE,
	attestation_date TIMESTAMP NULL,
	PRIMARY KEY (transaction_id),
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
	FOREIGN KEY (attestation_unit) REFERENCES units(unit)
);
-- query separator
CREATE TABLE IF NOT EXISTS rejected_payments (
	rejected_payment_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	receiving_address CHAR(32) NOT NULL,
	price INT NOT NULL,
	received_amount INT NOT NULL,
	payment_unit CHAR(44) NOT NULL UNIQUE,
	payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	error TEXT NOT NULL,
	FOREIGN KEY (receiving_address) REFERENCES receiving_addresses(receiving_address),
	FOREIGN KEY (payment_unit) REFERENCES units(unit) ON DELETE CASCADE
);
-- query separator
CREATE TABLE IF NOT EXISTS reward_units (
	transaction_id INTEGER NOT NULL PRIMARY KEY,
	user_address CHAR(32) NOT NULL UNIQUE,
	user_email VARCHAR(320) NOT NULL UNIQUE,
	user_id CHAR(44) NOT NULL UNIQUE,
	reward INT NOT NULL,
	reward_unit CHAR(44) NULL UNIQUE,
	reward_date TIMESTAMP NULL,
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
	FOREIGN KEY (reward_unit) REFERENCES units(unit)
);
-- query separator
CREATE TABLE IF NOT EXISTS referral_reward_units (
	transaction_id INTEGER NOT NULL PRIMARY KEY,
	user_address CHAR(32) NOT NULL,
	user_id CHAR(44) NOT NULL,
	new_user_id CHAR(44) NOT NULL UNIQUE,
	new_user_address CHAR(44) NOT NULL UNIQUE,
	reward INT NOT NULL,
	reward_unit CHAR(44) NULL UNIQUE,
	reward_date TIMESTAMP NULL,
	FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
	FOREIGN KEY (new_user_id) REFERENCES reward_units(user_id),
	FOREIGN KEY (reward_unit) REFERENCES units(unit)
);