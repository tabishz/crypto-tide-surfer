// require('dotenv').config();
const config = require('./config');
const { Currency } = require('./Currency');

const cc = new Currency(config.crypto, config.base);

async function main () {
  cc.purchaseCycle()
    .then(async ordered => {
      await cc.sellCycle()
        .then(async sold => {
          await main();
          return;
        });
    });
};

// running the main logic
cc.log(`Running ENV:${process.env.NODE_ENV}`);
(async () => await main())();
