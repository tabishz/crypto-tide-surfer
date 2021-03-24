let exchangeLibrary = '';
if (process.env.NODE_ENV == 'prd') {
  exchangeLibrary = 'ccxt';
} else {
  exchangeLibrary = './dev/Exchange';
}
const ccxt = require(exchangeLibrary);
const axios = require('axios');

const db = require('./db');
const config = require('./config');
const { exchanges } = require('ccxt');

const exchange = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  enableRateLimit: true,
});

class Currency {
  constructor(crypto, base) {
    this.crypto = crypto;
    this.base = base;
    this.pair = `${crypto}/${base}`;
    this.balance = {};
  }

  async initialize() {
    await this.getBalances();
    await this.getLastBalance();
    this.mode = 'start';
    this.filled = 0;
    this.maxPrice = 0;
    this.quantity = 0;
    this.remaining = 0;
    this.purchased = 0;
    this.currentPrice = null;
    this.purchasePrice = null;
    this.orderId = null;
    await this.checkTracker();
    this.log(
      `Balances ${this.pair}: ${this.balance.crypto}/${this.balance.base}`,
      'initialize'
    );
    if (this.mode == 'sell') {
      this.log(
        `Previous open order (${this.orderId}). Got ${this.remaining} ${this.crypto}` +
          ` (Purchased at ${this.purchasePrice} ${this.base})`,
        'initialize'
      );
    }
    return;
  }

  async buy(price, quantity) {
    this.log(`Purchasing ${quantity} ${this.crypto} @ ${price} ${this.base}`, 'buy');
    const order = await this.limitBuy(price, quantity);
    this.orderId = order.id;
    if (order.status !== 'closed') {
      const cancelled = await this.cancelOrder(order.id);
      if (cancelled.status === 'CANCELED') {
        this.log(`Canceled ${order.id} for ${this.pair} - retrying.`, 'buy');
        return cancelled;
      } else {
        this.log(`Unable to Cancel: ${JSON.stringify(order)}`, 'buy');
        return { status: false };
      }
    } else if (order.status == 'closed') {
      this.remaining = this.purchased;
      this.log(`Bought ${quantity} ${this.crypto} for ${price} ${this.base}`, 'buy');
    }
    this.purchasePrice =
      order.average !== undefined ? parseFloat(order.average) : parseFloat(order.price);
    return order;
  }

  async sell(price, quantity) {
    this.log(`Selling ${quantity} ${this.crypto} @ ${price} ${this.base}`, 'sell');
    const order = await this.limitSell(price, quantity);
    if (order.status !== 'closed') {
      const cancelled = await this.cancelOrder(order.id);
      if (cancelled.status === 'CANCELED') {
        this.log(`Canceled ${order.id} for ${this.pair} - retrying.`, 'sell');
        return cancelled;
      } else {
        this.log(`Unable to Cancel: ${JSON.stringify(order)}`, 'sell');
        return { status: false };
      }
    } else if (order.status == 'closed') {
      this.log(`Sold ${quantity} ${this.crypto} for ${price} ${this.base}`, 'sell');
    }
    this.orderId = order.id;
    return order;
  }

  /**
   * This function places the limit order to buy crypto quantity at given price limit
   * Also adds info to Database
   * @param {Number} price limit price at which to buy crypto
   * @param {Number} quantity quantity of crypto to buy
   * @returns Object of order details
   */
  async limitBuy(price, quantity) {
    const order = await exchange.createLimitBuyOrder(this.pair, quantity, price);
    this.log(`OrderId: ${order.id} (${order.status}) for ${this.pair} placed.`, 'limitBuy');
    await db.createOrder(order);
    if (order.status === 'closed') {
      this.remaining = order.amount;
      this.balance.base = this.balance.base - order.cost;
      this.purchased = parseFloat(order.amount) * (1 - parseFloat(config.exchange.fees));
      await db.updateLedger({
        cost: order.cost,
        transaction: order.side,
        crypto: this.crypto,
        price: order.price,
        base: this.base,
        quantity: this.quantity,
        priceBought: order.price,
      });
      return order;
    } else {
      const status = await this.checkOrderStatus(
        order.id,
        config.order.wait,
        config.order.intervals
      );
      this.log(`orderStatus: ${JSON.stringify(status)}`, 'limitBuy');
      if (status.status === 'closed') {
        this.remaining = order.amount;
        this.balance.base = this.balance.base - status.cost;
        this.purchased = parseFloat(order.amount) * (1 - parseFloat(config.exchange.fees));
        await db.createOrder(status);
        await db.updateLedger({
          cost: status.cost,
          transaction: status.side,
          crypto: this.crypto,
          price: status.price,
          base: this.base,
          quantity: status.filled,
          priceBought: status.price,
        });
      } else if (this.filled) {
        this.remaining = status.remaining;
        this.purchased = this.purchased + status.filled;
        await db.updateLedger({
          cost: status.cost,
          transaction: status.side,
          crypto: this.crypto,
          price: status.price,
          base: this.base,
          quantity: status.filled,
          priceBought: status.price,
        });
      }
      return status;
    }
  }

  /**
   * This function places the limit order to sell crypto quantity at given price limit
   * Also adds info to Database
   * @param {Number} price limit price at which to sell crypto
   * @param {Number} amount quantity of crypto to sell
   * @returns Object of order details
   */
  async limitSell(price, quantity) {
    const order = await exchange.createLimitSellOrder(this.pair, quantity, price);
    this.log(`OrderId: ${order.id} (${order.status}) for ${this.pair} placed.`, 'limitSell');
    await db.createOrder(order);
    if (order.status === 'closed') {
      this.quantity = 0;
      this.balance.base = this.balance.base + order.cost;
      await db.updateLedger({
        cost: order.cost,
        transaction: order.side,
        crypto: this.crypto,
        price: order.price,
        base: this.base,
        quantity: order.filled,
        priceBought: this.purchasePrice,
      });
      return order;
    } else {
      const status = await this.checkOrderStatus(
        order.id,
        config.order.wait,
        config.order.intervals
      );
      if (status.status === 'closed') {
        this.quantity = 0;
        this.balance.base = this.balance.base + status.cost;
        await db.updateOrder(status.id, status);
        await db.updateLedger({
          cost: status.cost,
          transaction: status.side,
          crypto: this.crypto,
          price: status.price,
          base: this.base,
          quantity: status.filled,
          priceBought: this.purchasePrice,
        });
      } else if (this.filled) {
        this.remaining = status.remaining;
        await db.updateLedger({
          cost: status.cost,
          transaction: status.side,
          crypto: this.crypto,
          price: status.price,
          base: this.base,
          quantity: status.filled,
          priceBought: this.purchasePrice,
        });
      }
      return status;
    }
  }

  async getBalances() {
    const balances = await exchange.fetchBalance();
    this.balance.crypto = balances.free[this.crypto];
    this.balance.base = balances.free[this.base];
    return;
  }

  async getLastBalance() {
    let lastBalance = await db.lastBalance();
    if (lastBalance) {
      lastBalance = lastBalance.toObject();
      this.lastBalance = lastBalance.cost;
      if (this.lastBalance > 0) return this.lastBalance;
    }
    return 0;
  }

  async decideAmount() {
    if (
      this.lastBalance >= config.minAmount &&
      this.lastBalance <= config.maxAmount &&
      this.lastBalance <= this.balance.base
    ) {
      return this.lastBalance;
    }
    if (this.balance.base < config.minAmount) return 0;
    if (this.balance.base >= config.minAmount && this.balance.base <= config.maxAmount) {
      return this.balance.base;
    }
    if (this.balance.base > config.maxAmount) return config.maxAmount;
  }

  async decideQuantityToBuy() {
    const amount = await this.decideAmount();
    if (!this.currentPrice) this.currentPrice = await this.getPrice();
    const quantity = amount / (this.currentPrice * (1 + parseFloat(config.buyThreshold)));
    return quantity;
  }

  quantityEnough(quantity, price) {
    if (price === undefined) return true;
    const total = quantity * price;
    if (total >= config.minAmount) return true;
    return false;
  }

  async determineStopLoss() {
    if (this.maxPrice > this.purchasePrice) {
      this.stopLossPrice = parseFloat(this.maxPrice) * (1 - parseFloat(config.runningStopLoss));
    } else {
      this.stopLossPrice =
        parseFloat(this.purchasePrice) * (1 - parseFloat(config.initialStopLoss));
    }
    return this.stopLossPrice;
  }

  checkOrderStatus(orderId, wait, intervals) {
    let i = 1;
    let order = { status: 'checking' };
    this.log(`Checking order status (id: ${orderId}).`, 'checkOrderStatus');
    return new Promise(async (resolve) => {
      while (i <= intervals && order.status !== 'closed') {
        order = await this.orderStatus(orderId);
        this.filled = order?.filled;
        if (order.filled > 0) {
          if (order.side == 'sell') this.remaining = order.remaining;
          if (order.side == 'buy') this.remaining = order.filled;
          this.filled = order.filled;
        }
        this.log(
          `(${i}) ${order.filled}/${order.remaining} ${this.crypto} Order Filled`,
          'checkOrderStatus'
        );
        if (i >= intervals || order.status === 'closed') resolve(order);
        i++;
      }
      await this.delay(wait);
    });
  }

  async orderStatus(orderId, symbol = this.pair) {
    try {
      const order = await exchange.fetchOrder(orderId, symbol);
      return order;
    } catch (error) {
      this.log(`Error: ${JSON.stringify(error)}`, 'orderStatus');
      return { status: 'unknown' };
    }
  }

  async openOrders(symbol = this.pair, limit = 1) {
    const orders = await exchange.fetchOpenOrders(symbol, undefined, limit);
    return orders;
  }

  async cancelOrder(id, symbol = this.pair) {
    try {
      await exchange.cancelOrder(id, symbol);
      this.log(`Cancelled order ${id}.`, 'cancelOrder');
      return true;
    } catch (error) {
      this.log(`Unable to Cancel: ${JSON.stringify(error)}`, 'cancelOrder');
      throw error;
    }
  }

  /**
   * Return market data for given crypto currency pair from exchange
   * @returns Array with market data as per config parameters
   */
  async getMarketData() {
    const url =
      `${config.priceApiUrl}/klines?symbol=${this.crypto}${this.base}` +
      `&interval=${config.evalTime}&limit=${config.evalLimit}`;
    const marketData = await axios.get(url);
    return marketData.data;
  }

  // async previousOpenOrder() {
  //   return await db.getOpenOrder();
  // }

  /**
   * Adds or updates (if greater than current max price) Max Price for Currency
   * @returns
   */
  async updatePrice() {
    const newPrice = await this.getPrice();
    if (this.maxPrice) {
      if (newPrice > this.maxPrice) {
        await this.updateTracker('sell');
        this.maxPrice = newPrice;
        await this.determineStopLoss();
        this.log(
          `Updated Max Price for ${this.pair}: ${this.maxPrice.toString()}` +
            ` Determined stopLoss: ${this.stopLossPrice}`,
          'updatePrice'
        );
      }
    } else {
      this.maxPrice = newPrice;
      await this.determineStopLoss();
      this.log(
        `Added Max Price for ${this.pair}: ${newPrice.toString()}` +
          ` Determined stopLoss: ${this.stopLossPrice}`,
        'updatePrice'
      );
    }
    return newPrice;
  }

  /**
   * This functions keeps on checking market data and makes the purchase when conditions meet
   * @returns Object of order details
   */
  async purchaseCycle() {
    const baseAmount = await this.decideAmount();
    this.log(`Amount to buy ${this.crypto}: ${baseAmount} ${this.base}`, 'purchaseCycle');
    var order = { status: 'new' };
    var thresholdPrice = this.currentPrice * (1 + parseFloat(config.buyThreshold));
    this.quantity = await this.decideQuantityToBuy();
    this.remaining = this.quantity;
    return new Promise(async (resolve) => {
      while (order.status !== 'closed') {
        await this.followPrice();
        await this.getPrice();
        thresholdPrice = this.currentPrice * (1 + parseFloat(config.buyThreshold));
        this.log(
          `Threshold Price: ${thresholdPrice}, currentPrice: ${this.currentPrice} (${config.buyThreshold})`,
          'purchaseCyle'
        );
        // if (this.filled) this.remaining = this.remaining - this.filled;
        if (this.filled) {
          this.log(
            `${this.crypto} Purchased: ${this.filled}, Remaining: ` + `${this.remaining}`,
            'purchaseCycle'
          );
        }
        order = await this.buy(thresholdPrice, this.remaining);
        if (order.status == 'closed' || !this.quantityEnough(this.remaining, thresholdPrice)) {
          await this.updateTracker('sell');
          resolve(order);
        }
      }
    });
  }

  /**
   * This functions keeps checking for price updates and sells at stop loss thresholds
   * @returns Object of order details
   */
  sellCycle() {
    this.log(`Ready to sell ${this.remaining} ${this.crypto} for ${this.base}`, 'sellCycle');
    var order = { status: 'staged' };
    var thresholdPrice = this.currentPrice * (1 - parseFloat(config.sellThreshold));;
    return new Promise(async (resolve) => {
      while (order.status !== 'closed') {
        // await this.updatePrice();
        this.log('Checking for stopLoss price', 'sellCycle');
        await this.signalToSell();
        if (this.filled) {
          this.log(
            `${this.crypto} Sold: ${this.filled}, Remaining: ` + `${this.remaining}`,
            'sellCycle'
          );
        }
        thresholdPrice = this.currentPrice * (1 - parseFloat(config.sellThreshold));
        order = await this.sell(thresholdPrice, this.remaining);
        if (order.status == 'closed' || !this.quantityEnough(this.remaining, thresholdPrice)) {
          await this.updateTracker('buy');
          resolve(order);
        }
      }
    });
  }

  signalToSell() {
    return new Promise(async (resolve) => {
      await this.determineStopLoss();
      this.log(
        `currentPrice: ${this.currentPrice} | stopLossPrice: ${this.stopLossPrice}`,
        'signalToSell'
      );
      while (this.currentPrice >= this.stopLossPrice) {
        await this.updatePrice();
        let diff = ((this.currentPrice - this.purchasePrice) / this.purchasePrice) * 100;
        this.log(
          `${this.crypto}=${this.currentPrice} ${this.base} (Purchased at ` +
            `${this.purchasePrice} ${this.base}) [${diff.toFixed(4)}%] ` +
            `StopLoss @ ${this.stopLossPrice} ${this.base}`,
          'signalToSell'
        );
        if (this.currentPrice <= this.stopLossPrice) {
          // create stopLoss order
          resolve(true);
        }
        await this.delay(config.runningInterval);
      }
    });
  }

  /**
   * Gets the current market price of crypto from exchange
   * @returns price of the crypto in base currency
   */
  async getPrice() {
    let info = await axios.get(
      `${config.priceApiUrl}/ticker/price?symbol=${this.crypto}${this.base}`
    );
    this.currentPrice = parseFloat(info.data.price);
    return this.currentPrice;
  }

  /**
   * Simple log with timestamp
   * @param {String} msg
   */
  log(msg, tag = null) {
    if (tag) msg = `[${tag}] ${msg}`;
    console.log(new Date().toLocaleString(), msg);
  }

  /**
   * Follows the price of the crypto pair and returns true if and when the change in price
   * is above minimum price as specified in Config
   * @returns true when conditions are met
   */
  followPrice() {
    var conditionMet;
    return new Promise(async (resolve) => {
      while (conditionMet !== true) {
        const chart = await this.getMarketData();
        const market = await this.evaluateChart(chart);
        this.log(
          `${this.crypto}=${this.currentPrice}  Change Sum: ` +
            `${(market.change * 100).toFixed(4)}% (>= ${config.minChange * 100}%)|` +
            ` Overall Change over last ${config.evalTime}*${config.evalLimit}: ` +
            `${(market.overallChange * 100).toFixed(4)}% (>= ${config.minOverallChange * 100}%)`
        );
        conditionMet = this.buyCondition(market);
        if (conditionMet) resolve(true);
        await this.delay(config.followInterval);
      }
    });
  }

  buyCondition(rate) {
    if (config.bothChangeSatisfy) {
      // Both changes must be greater than their minimum required values
      if (rate.change > config.minChange && rate.overallChange > config.minOverallChange) {
        this.log('Conditions to Purchase are met!');
        return true;
      }
    }
    // Either of the changes must be greater than their minimum required values
    if (rate.change > config.minChange || rate.overallChange > config.minOverallChange) {
      this.log('One of the Condition to Purchase is met!');
      return true;
    }
    return false;
  }

  /**
   *
   * @param {Array[]} data Market Price data to be evaluated for change
   * @returns Object of change and overall change
   */
  async evaluateChart(data) {
    let change = new Array();
    for (let i = 0; i < data.length; i++) {
      change[i] = (parseFloat(data[i][4]) - parseFloat(data[i][1])) / parseFloat(data[i][4]);
    }
    let difference = 0;
    change.forEach((d) => (difference += d));
    const changeOverEvaluation =
      (data[data.length - 1][4] - data[0][1]) / data[data.length - 1][4];
    this.currentPrice = parseFloat(data[data.length - 1][4]);
    return { change: difference, overallChange: changeOverEvaluation };
  }

  async checkTracker() {
    try {
      const tracked = await db.checkTracker(this.pair);
      if (tracked?.mode == 'sell') {
        this.maxPrice = tracked.maxPrice;
        this.quantity = tracked.quantity;
        this.remaining = tracked.remaining;
        this.purchased = tracked.purchased;
        this.purchasePrice = tracked.purchasePrice;
        this.orderId = tracked.orderId;
        this.mode = tracked.mode;
      }
    } catch (error) {
      this.log(`Unable to get data. ${JSON.stringify(error)}`, 'checkTracker');
      throw error;
    }
    return true;
  }

  async updateTracker(mode) {
    const data = {
      orderId: this.orderId,
      mode: mode,
      symbol: this.pair,
      purchasePrice: this.purchasePrice,
      maxPrice: this.maxPrice,
      quantity: this.quantity,
      remaining: this.remaining,
      purchased: this.purchased,
    };
    try {
      await db.updateTracker(data);
    } catch (error) {
      this.log(`Unable to update data. ${JSON.stringify(error)}`, 'updateTracker');
      throw error;
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  Currency,
};
