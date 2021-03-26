// require('dotenv').config();
const express = require('express');
const app = express();
const router = require('./api/router');
const http = require('http');
const config = require('./config');
const { Currency } = require('./Currency');
const { telegram, message } = require('./api/telegram');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const cc = new Currency(config.crypto, config.base);

async function main () {
  while (1 < 2) {
    await cc.initialize();
    if (cc.mode != 'sell') await cc.purchaseCycle();
    await cc.sellCycle();
    cc.log(`Buy/Sell Cycle completed. Cooling off... (${config.coolOffPeriod/60000} minutes)`,
      'main');
    await cc.delay(config.coolOffPeriod);
  }
};

if (config.telegram.enabled) {
  telegram.on('update', (update) => {
    cc.log(`Msg Received: ${JSON.stringify(update)}`, 'Telegram');
    message.reply(update.message, cc);
  });
}

// REST API endpoint
app.use(`/api`, router);

// REST Call listener
http.createServer({
  // key: fs.readFileSync('../certs/key.pem'),
  // cert: fs.readFileSync('../certs/cert.pem')
}, app)
.listen(process.env.PORT);
console.log(`${process.env.APP_NAME} REST API listening on port: ${process.env.PORT}`);

// running the main logic
cc.log(`Running ENV:${process.env.NODE_ENV}`);
(async () => await main())();
