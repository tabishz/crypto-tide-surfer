const { db } = require('../config');

module.exports = class binance {
  constructor (data) {
    this.API_KEY = data.apiKey;
    this.API_SECRET = data.secret;
  }

  async createLimitBuyOrder (pair, amount, price) {
    const timestamp = new Date();
    const order = {
      id: Math.floor(Math.random() * (999999999 - 100000000) + 100000000),
      clientOrderId: 'x-R4BD3S82821aa1e8ff414d09be3DEV',
      timestamp: timestamp.getTime(),
      datetime: timestamp.toISOString(),
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
  
  async createLimitSellOrder (pair, amount, price) {
    const timestamp = new Date();
    const order = {
      id: Math.floor(Math.random() * (999999999 - 100000000) + 100000000).toString(),
      clientOrderId: 'x-R4BD3S82821aa1e8ff414d09be3DEV',
      timestamp: timestamp.getTime(),
      datetime: timestamp.toISOString(),
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
  
  async fetchBalance() {
    balance = await db.balance();
    return balance;
  };

}
