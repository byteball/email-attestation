# Email Attestation Bot
A bot that attests the user's email address

# Setup
* Run `npm install` to install node modules.
* Run `node import-db.js` to import `db.sql` into the database and appling database migrations.
* Run `node attestation.js` first time to generate keys.
* Configure `admin_email`, `from_email`, `attestation_from_name`, `attestation_from_email` and `salt` values in new conf.json file (desktopApp.getAppDataDir() folder). Read more about other configuration options [there](https://github.com/byteball/headless-byteball#customize).
* Send bytes to `== distribution address`, which is displayed in logs, it is for whitelisted domain emails and referral bonuses.
* Run `node attestation.js` again.

# Testnet
* Run `testnetify.sh` to connect to TESTNET hub. Delete and import the database again if you already ran it on MAINNET.
* Change `bLight` value to true in conf.json file, so you would not need to wait for long syncing.
* Change `socksHost` and `socksPort` values to null in conf.json file, if you are not using TOR.

# Translating
Join [Crowdin project](https://crowdin.com/project/byteball-betting-bot) to help with translations.