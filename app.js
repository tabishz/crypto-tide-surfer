// require('dotenv').config();
const express = require('express');
const app = express();
const router = express.Router();
const http = require('http');
const config = require('./config');
const { Currency } = require('./Currency');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// app.use(`/api`, require('./api/router'));
app.use(`/api`, router);
router.get('/', async(req, res) => {
  res.json({msg: "You've reached the API."});
});

router.get('/orderStatus', async(req, res) => {
  const details = await cc.orderStatus(req.body.orderId, req.body.symbol);
  res.json(details);
});

router.get('/orders', async(req, res) => {
  const details = await cc.openOrders(req.body.symbol, req.body.limit);
  res.json(details);
});

// REST Call listener
http.createServer({
  // key: fs.readFileSync('../certs/key.pem'),
  // cert: fs.readFileSync('../certs/cert.pem')
}, app)
.listen(process.env.PORT);
console.log(`${process.env.APP_NAME} listening on port: ${process.env.PORT}`);

// running the main logic
cc.log(`Running ENV:${process.env.NODE_ENV}`);
(async () => await main())();
