const express = require('express');
const router = express.Router();
const config = require('../config');
const { Currency } = require('../Currency');
// const crypto = require('crypto');

const cyrptoCurrency = new Currency(config.crypto, config.base);

router.get('/', async(req, res) => {
  res.json({msg: "You've reached the API."});
});

router.get('/orderStatus', async(req, res) => {
  const details = await cyrptoCurrency.orderStatus(req.body.orderId, req.body.symbol);
  res.json(details);
});

router.get('/openOrders', async(req, res) => {
  const details = await cyrptoCurrency.openOrders(req.body.symbol, req.body.limit);
  res.json(details);
});

module.exports = router;