/*jslint node: true */
'use strict';
const eventBus = require('ocore/event_bus.js');
const network = require('ocore/network.js');


let bRatesReady = false;
eventBus.once('rates_updated', () => {
	bRatesReady = true;
	checkRatesAndHeadless();
});

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


function getPriceInBytes(priceInUSD) {
	const rates = network.exchangeRates;
	if (!rates.GBYTE_USD)
		throw Error("rates not ready yet");
	return Math.round(1e9 * priceInUSD / rates.GBYTE_USD);
}


exports.getPriceInBytes = getPriceInBytes;

