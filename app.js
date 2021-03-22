// require('dotenv').config();
const config = require('./config');
const { Currency } = require('./Currency');

const cc = new Currency(config.crypto, config.base);

async function main () {
  while (1 < 2) {
    await cc.initialize();
    await cc.purchaseCycle();
    await cc.sellCycle()
    cc.log('Buy/Sell Cycle completed. Cooling off...', 'main');
    await cc.delay(config.coolOffPeriod);
  }
};

// running the main logic
cc.log(`Running ENV:${process.env.NODE_ENV}`);
(async () => await main())();
