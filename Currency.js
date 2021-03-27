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
const { message } = require('./api/telegram');

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
    if (this.mode === undefined) {
      const envData = await this.getEnv();
      if (envData) {
        for (let i=0; i < Object.keys(envData).length; i++) {
          this[Object.keys(envData)[i]] = envData[Object.keys(envData)[i]];
        }
        this.pair = `${this.crypto}/${this.base}`;
      } else {
        this.minAmount = config.minAmount,
        this.maxAmount = config.maxAmount,
        this.initStopLoss = config.initialStopLoss,
        this.runStopLoss = config.runningStopLoss,
        this.sellThreshold = config.sellThreshold,
        this.buyThreshold = config.buyThreshold,
        this.runningInterval = config.runningInterval,
        this.followInterval = config.followInterval,
        this.coolOffPeriod = config.coolOffPeriod,
        this.minChange = config.minChange,
        this.minOverallChange = config.minOverallChange,
        this.satisfyBoth = config.bothChangeSatisfy,
        this.evalTime = config.evalTime,
        this.evalLimit = config.evalLimit,
        this.orderWait = config.order.wait,
        this.orderIntervals = config.order.intervals;
        await this.saveEnv();
      }
    }
    this.mode = 'start';
    this.filled = 0;
    this.maxPrice = 0;
    this.quantity = 0;
    this.remaining = 0;
    this.purchased = 0;
    this.trackedBalance = 0;
    this.currentPrice = null;
    this.purchasePrice = null;
    this.orderId = null;
    await this.getBalances();
    await this.getLastBalance();
    await this.checkTracker();
    this.log(
      `Balances ${this.pair}: ${this.balance.crypto}/${this.balance.base} `+ 
      `[TrackedBalance: ${this.trackedBalance}]`,
      'initialize'
    );
    if (this.mode == 'sell') {
      this.log(
        `Previous open order (${this.orderId}). Got ${this.remaining.toFixed(3)}` +
        ` ${this.crypto} (Purchased at ${this.purchasePrice} ${this.base})`,
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
      const pnl = (price/this.purchasePrice - 1) * 100;
      this.log(`Sold ${quantity.toFixed(3)} ${this.crypto} for ${price.toFixed(5)} `+
        `${this.base} (PnL: ${pnl.toFixed(2)}%)`, 'sell');
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
        this.orderWait,
        this.orderIntervals
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
        this.orderWait,
        this.orderIntervals
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
    await this.getBalances();
    if (
      this.trackedBalance >= this.minAmount &&
      this.trackedBalance <= this.maxAmount &&
      this.trackedBalance <= this.balance.base
    ) {
      return this.trackedBalance;
    }
    if (
      this.lastBalance >= this.minAmount &&
      this.lastBalance <= this.maxAmount &&
      this.lastBalance <= this.balance.base
    ) {
      return this.lastBalance;
    }
    if (this.balance.base < this.minAmount) return 0;
    if (this.balance.base >= this.minAmount && this.balance.base <= this.maxAmount) {
      return this.balance.base;
    }
    if (this.balance.base > this.maxAmount) return this.maxAmount;
  }

  async decideQuantityToBuy() {
    const amount = await this.decideAmount();
    if (!this.currentPrice) this.currentPrice = await this.getPrice();
    const quantity = amount / (this.currentPrice * (1 + parseFloat(this.buyThreshold)));
    return quantity;
  }

  quantityEnough(quantity, price) {
    if (price === undefined) return true;
    const total = quantity * price;
    if (total >= this.minAmount) return true;
    return false;
  }

  async determineStopLoss() {
    if (this.maxPrice > this.purchasePrice) {
      this.stopLossPrice = parseFloat(this.maxPrice) * (1 - parseFloat(this.runStopLoss));
    } else {
      this.stopLossPrice =
        parseFloat(this.purchasePrice) * (1 - parseFloat(this.initStopLoss));
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
      const order = await this.orderStatus(id);
      if (order.status == 'closed') {
        // TODO: Update remaining quantity
        return true;
      } else {
        this.log(`Unable to Cancel: ${JSON.stringify(error)}`, 'cancelOrder');
        throw error;
      }
    }
  }

  /**
   * Return market data for given crypto currency pair from exchange
   * @returns Array with market data as per config parameters
   */
  async getMarketData() {
    const url =
      `${config.priceApiUrl}/klines?symbol=${this.crypto}${this.base}` +
      `&interval=${this.evalTime}&limit=${this.evalLimit}`;
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
    this.currentPrice = await this.getPrice();
    if (this.maxPrice) {
      if (this.currentPrice > this.maxPrice) {
        await this.updateTracker('sell');
        this.maxPrice = this.currentPrice;
        await this.determineStopLoss();
        this.log(
          `Updated Max Price for ${this.pair}: ${this.maxPrice.toString()}` +
            ` Determined stopLoss: ${this.stopLossPrice.toFixed(5)}`,
          'updatePrice'
        );
      }
    } else {
      this.maxPrice = this.currentPrice;
      await this.determineStopLoss();
      this.log(
        `Added Max Price for ${this.pair}: ${this.currentPrice.toString()}` +
          ` Determined stopLoss: ${this.stopLossPrice.toFixed(5)}`,
        'updatePrice'
      );
    }
    return this.currentPrice;
  }

  /**
   * This functions keeps on checking market data and makes the purchase when conditions meet
   * @returns Object of order details
   */
  async purchaseCycle() {
    const baseAmount = await this.decideAmount();
    await this.getPrice();
    this.mode = 'buy';
    this.log(`Amount to buy ${this.crypto}: ${baseAmount} ${this.base}`, 'purchaseCycle');
    var order = { status: 'new' };
    var thresholdPrice = this.currentPrice * (1 + parseFloat(this.buyThreshold));
    this.quantity = await this.decideQuantityToBuy();
    this.remaining = this.quantity;
    return new Promise(async (resolve) => {
      while (order.status !== 'closed' && this.quantityEnough(this.remaining, thresholdPrice)) {
        await this.followPrice();
        await this.getPrice();
        thresholdPrice = this.currentPrice * (1 + parseFloat(this.buyThreshold));
        this.log(
          `Threshold Price: ${thresholdPrice}, currentPrice: ${this.currentPrice} (${this.buyThreshold})`,
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
          this.trackedBalance = order.cost;
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
  async sellCycle() {
    this.log(`Ready to sell ${this.remaining} ${this.crypto} for ${this.base}`, 'sellCycle');
    var order = { status: 'staged' };
    await this.getPrice();
    var thresholdPrice = this.currentPrice * (1 - parseFloat(this.sellThreshold));;
    return new Promise(async (resolve) => {
      while (order.status !== 'closed' && this.quantityEnough(this.remaining, thresholdPrice)) {
        // await this.updatePrice();
        this.log('Checking for stopLoss price', 'sellCycle');
        await this.signalToSell();
        if (this.filled) {
          this.log(
            `${this.crypto} Sold: ${this.filled}, Remaining: ` + `${this.remaining}`,
            'sellCycle'
          );
        }
        thresholdPrice = this.currentPrice * (1 - parseFloat(this.sellThreshold));
        order = await this.sell(thresholdPrice, this.remaining);
        if (order.status == 'closed' || !this.quantityEnough(this.remaining, thresholdPrice)) {
          this.trackedBalance = order.cost;
          await this.updateTracker('buy');
          resolve(order);
        }
      }
    });
  }

  signalToSell() {
    return new Promise(async (resolve) => {
      await this.updatePrice();
      await this.determineStopLoss();
      this.log(
        `currentPrice: ${this.currentPrice} | stopLossPrice: ${this.stopLossPrice}`,
        'signalToSell'
      );
      while (this.currentPrice >= this.stopLossPrice || this.mode == 'sell') {
        await this.updatePrice();
        let diff = ((this.currentPrice - this.purchasePrice) / this.purchasePrice) * 100;
        this.log(
          `${this.crypto}=${this.currentPrice} ${this.base} (Purchased at ` +
            `${this.purchasePrice} ${this.base}) [${diff.toFixed(3)}%] ` +
            `StopLoss @ ${this.stopLossPrice.toFixed(5)} ${this.base}`,
          'signalToSell'
        );
        if (this.currentPrice <= this.stopLossPrice) {
          // create stopLoss order
          resolve(true);
        }
        await this.delay(this.runningInterval);
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
        this.overallChange = (market.overallChange * 100).toFixed(4) + '%';
        this.change = (market.change * 100).toFixed(4) + '%';
        this.log(
          `${this.crypto}=${this.currentPrice}  Change Sum: ` +
            `${this.change} (>= ${this.minChange * 100}%)|` +
            ` Overall Change over last ${this.evalTime}*${this.evalLimit}: ` +
            `${this.overallChange} (>= ${this.minOverallChange * 100}%)`
        );
        conditionMet = this.buyCondition(market);
        if (conditionMet) resolve(true);
        await this.delay(this.followInterval);
      }
    });
  }

  buyCondition(rate) {
    if (this.satisfyBoth) {
      // Both changes must be greater than their minimum required values
      if (rate.change > this.minChange && rate.overallChange > this.minOverallChange) {
        this.log('Conditions to Purchase are met!');
        return true;
      }
    }
    // Either of the changes must be greater than their minimum required values
    if (rate.change > this.minChange || rate.overallChange > this.minOverallChange) {
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
        if (tracked.balance) this.maxPrice = tracked.maxPrice;
        if (tracked.quantity) this.quantity = tracked.quantity;
        if (tracked.remaining) this.remaining = tracked.remaining;
        if (tracked.purchased) this.purchased = tracked.purchased;
        if (tracked.purchasePrice) this.purchasePrice = tracked.purchasePrice;
        if (tracked.orderId) this.orderId = tracked.orderId;
        if (tracked.mode) this.mode = tracked.mode;
      }
      if (tracked?.balance) this.trackedBalance = tracked.balance;
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
      balance: this.trackedBalance,
    };
    this.mode = mode;
    try {
      await db.updateTracker(data, this.pair);
      return true;
    } catch (error) {
      this.log(`Unable to update data. ${JSON.stringify(error)}`, 'updateTracker');
      throw error;
    }
  }

  /**
   * Updates the Currency Object value
   * @param {String} key Key for Currency Object
   * @param {String|Number} value Value of the Key for Currency Object
   * @returns true
   */
  async updateEnv(key, value) {
    this[key] = value;
    if (key == 'crypto' || key == 'base') {
      this.pair = `${this.crypto}/${this.base}`;
    }
    this.log(`Updating this.${key} to ${value}`, 'updateEnv');
    await db.updateEnv({[key]: value}, this._id);
    return true;
  }

  async saveEnv() {
    const data = {
      crypto: this.crypto,
      base: this.base,
      minAmount: config.minAmount,
      maxAmount: config.maxAmount,
      initStopLoss: config.initialStopLoss,
      runStopLoss: config.runningStopLoss,
      sellThreshold: config.sellThreshold,
      buyThreshold: config.buyThreshold,
      runningInterval: config.runningInterval, // seconds
      followInterval: config.followInterval, // seconds
      coolOffPeriod: config.coolOffPeriod, // minutes
      minChange: config.minChange,
      minOverallChange: config.minOverallChange,
      satisfyBoth: config.bothChangeSatisfy, // 0 for False, 1 for True
      evalTime: config.evalTime, // 1m, 3m, 5m, 10m, 15m, 30m, 1h
      evalLimit: config.evalLimit, // # of evaluation candles
      orderWait: config.order.wait,
      orderIntervals: config.order.intervals,
    };
    try {
      const saved = await db.initEnv(data);
      if (saved) {
        const envData = await this.getEnv();
        this._id = envData._id;
      }
      return true;
    } catch (error) {
      this.log(`Unable to update data. ${JSON.stringify(error)}`, 'saveEnv');
      return false;
    }
  }

  async getEnv() {
    try {
      const envData = await db.fetchEnv();
      return envData;
    } catch (error) {
      this.log(`Unable to get data. ${JSON.stringify(error)}`, 'getEnv');
      return false;
    }
  }

  sendTelegram(msg) {
    message.send(config.telegram.chatId, msg);
    return true;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Simple log with timestamp
   * @param {String} msg
   */
   log(msg, tag = null) {
    const d = new Date();
    const dateString = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}`+
      `-${d.getDate().toString().padStart(2, '0')}T${d.getHours()}:${d.getMinutes()}:`+
      `${d.getSeconds()}`;

    if (tag) {
      if (tag === 'buy' || tag === 'sell' || tag === 'initialize') {
        if (config.telegram.enabled) this.sendTelegram(`<\*${tag}*> ${msg}`);
      }
      msg = `[${tag}] ${msg}`;
    }
    console.log(dateString, msg);
  }
}

module.exports = {
  Currency,
};
