const express = require('express');
const router = express.Router();
// const crypto = require('crypto');

router.get('/', async(req, res) => {
  res.json({msg: "You've reached the API."});
});

router.get('/orderStatus', async(req, res) => {
  const details = await cc.orderStatus(req.body.orderId, req.body.symbol);
  res.json(details);
});

router.get('/openOrders', async(req, res) => {
  const details = await cc.openOrders(req.body.symbol, req.body.limit);
  res.json(details);
});

module.exports = router;