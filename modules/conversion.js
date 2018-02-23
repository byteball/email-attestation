/*jslint node: true */
'use strict';
const request = require('request');
const eventBus = require('byteballcore/event_bus.js');
const notifications = require('./notifications');

let GBYTE_BTC_rate;
let BTC_USD_rate;

let bRatesReady = false;
function checkAllRatesUpdated() {
	if (bRatesReady) {
		return;
	}
	if (GBYTE_BTC_rate && BTC_USD_rate) {
		bRatesReady = true;
		console.log('rates are ready');
		console.log(`1$ = ${getPriceInBytes(1)} Bytes at ${new Date()}`);
		const headlessWallet = require('headless-byteball'); // start loading headless only when rates are ready
		checkRatesAndHeadless();
	}
}

let bHeadlessReady = false;
eventBus.once('headless_wallet_ready', () => {
	bHeadlessReady = true;
	checkRatesAndHeadless();
});

function checkRatesAndHeadless() {
	if (bRatesReady && bHeadlessReady) {
		eventBus.emit('headless_and_rates_ready');
	}
}

function updateBittrexRates() {
	console.log('updating bittrex');
	const apiUri = 'https://bittrex.com/api/v1.1/public/getmarketsummaries';
	request(apiUri, (error, response, body) => {
		if (!error && response.statusCode === 200) {
			let arrCoinInfos = JSON.parse(body).result;
			arrCoinInfos.forEach(coinInfo => {
				let price = coinInfo.Last; // number
				if (!price)
					return;

				if (coinInfo.MarketName === 'USDT-BTC') {
					BTC_USD_rate = price;
				} else if (coinInfo.MarketName === 'BTC-GBYTE') {
					GBYTE_BTC_rate = price;
				}
			});
			checkAllRatesUpdated();
		} else {
			notifications.notifyAdmin("getting bittrex data failed", error+", status="+(response ? response.statusCode : '?'));
			console.log("Can't get currency rates from bittrex, will retry later");
		}
	});
}

function getPriceInBytes(priceInUSD) {
	if (!bRatesReady) {
		throw Error("rates not ready yet");
	}
	return Math.round(1e9 * priceInUSD / (GBYTE_BTC_rate * BTC_USD_rate));
}

function enableRateUpdates() {
	setInterval(updateBittrexRates, 600*1000);
}

updateBittrexRates();
enableRateUpdates();

exports.getPriceInBytes = getPriceInBytes;

