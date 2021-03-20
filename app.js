// require('dotenv').config();
const config = require('./config');
const { Currency } = require('./Currency');

const cc = new Currency(config.crypto, config.base);

async function main () {
  await cc.purchaseCycle();
  await cc.sellCycle()
  await main();
  return;
};

// running the main logic
cc.log(`Running ENV:${process.env.NODE_ENV}`);
(async () => await main())();
