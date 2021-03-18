const { db } = require('./config');

const binance = (credentials) => {
  if (
    credentials.apiKey == process.env.API_KEY &&
    credentials.secret == process.env.API_SECRET
  ) return true;
  return false;
};

const createLimitBuyOrder = async (pair, amount, price) => {
  const timestamp = new Date();
  const order = {
    id: Math.floor(Math.random() * (999999999 - 100000000) + 100000000),
    clientOrderId: 'x-R4BD3S82821aa1e8ff414d09be3DEV',
    timestamp: timestamp.getTime(),
    datetime: timestamp.getISOString(),
    symbol: pair,
    type: 'limit',
    timeInForce: 'GTC',
    postOnly: false,
    side: 'buy',
    price: price,
    amount: amount,
    cost: price * amount,
    average: price,
    filled: amount,
    remaining: 0,
    status: 'closed',
  };
  return order;
};

const createLimitSellOrder = async (pair, amount, price) => {
  const timestamp = new Date();
  const order = {
    id: Math.floor(Math.random() * (999999999 - 100000000) + 100000000).toString(),
    clientOrderId: 'x-R4BD3S82821aa1e8ff414d09be3DEV',
    timestamp: timestamp.getTime(),
    datetime: timestamp.getISOString(),
    symbol: pair,
    type: 'limit',
    timeInForce: 'GTC',
    postOnly: false,
    side: 'sell',
    price: price,
    amount: amount,
    cost: price * amount,
    average: price,
    filled: amount,
    remaining: 0,
    status: 'closed',
  };
  return order;
};

const fetchBalance = async () => {
  const balance = await db.balance();
  return balance;
};

module.exports = {
  binance,
  createLimitBuyOrder,
  createLimitSellOrder,
  fetchBalance,
};
