let exchangeLibrary = '';
if (process.env.NODE_ENV == 'prd') {
  exchangeLibrary = 'ccxt';
} else {
  exchangeLibrary = './dev/Exchange';
}
const ccxt = require(exchangeLibrary);
const axios = require('axios');

const db = require('./db');
const cfg = require('./config');

const exchange = new ccxt.binance({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
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
    this.log(`Balances ${this.pair}: ${this.balance.crypto}/${this.balance.base}`);
    return;
  }

  async buy(price, amount) {
    const order = await this.limitBuy(price, amount);
    this.log(`Purchasing ${amount/price} ${this.crypto} for ${price}`);
    if (order.status !== 'closed') {
      const cancelled = await this.cancelOrder(order.id);
      if (cancelled.status === 'CANCELED') {
        return cancelled;
      } else {
        return false;
      }
    }
    this.purchasePrice = order.price;
    return order;
  }

  async sell(price, amount) {
    const order = await this.limitSell(price, amount);
    this.log(`Selling ${amount/price} ${this.crypto} for ${price}`);
    if (order.status !== 'closed') {
      const cancelled = await this.cancelOrder(order.id);
      if (cancelled.status === 'CANCELED') {
        return cancelled;
      } else {
        return false;
      }
    }
    this.purchasePrice = null;
    return order;
  }

  // Test Functions
  // async buy(price, amount) {
  //   await db.newTrackOrder(this.pair, amount, price * amount);
  //   this.log(`Placing order for ${this.pair} for ${price} (${amount})`);
  //   return await db.updateLedger(amount, 'buy');
  // }
  // async sell(price, amount) {
  //   const trackOrder = await db.getOpenOrder();
  //   await db.closeTrackOrder(trackOrder._id);
  //   this.log(`Selling order for ${this.pair} for ${price} (${amount})`);
  //   return await db.updateLedger(amount, 'sell');
  // }
  // End Test Functions

  async limitBuy(price, amount) {
    const order = await exchange.createLimitBuyOrder(this.pair, amount, price);
    if (order.status === 'closed') {
      this.balance.crypto = order.filled;
      this.balance.base = this.balance.base - order.cost;
      await db.createOrder(order);
      await db.newTrackOrder(this.pair, amount, order.cost);
      await db.updateLedger({
        cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
        base: this.base, quantity: this.balance.crypto, purchasePrice: this.purchasePrice,
      });      
      return order;
    } else {
      const status = await this.checkOrderStatus(order.id, cfg.order.wait, cfg.order.intervals);
      if (status.status === 'closed') {
        this.balance.crypto = order.filled;
        this.balance.base = this.balance.base - order.cost;
        await db.createOrder(status);
        await db.newTrackOrder(this.pair, amount, status.cost);
        await db.updateLedger({
          cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
          base: this.base, quantity: this.balance.crypto, purchasePrice: this.purchasePrice,
        });
      } else if (this.balance.filled) {
        await db.updateLedger({
          cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
          base: this.base, quantity: this.balance.filled, purchasePrice: this.purchasePrice,
        });
      }
      return status;
    }
  }

  async limitSell(price, amount) {
    const trackOrder = await db.newTrackOrder(this.pair, amount, price);
    const order = await exchange.createLimitSellOrder(this.pair, amount, price);
    if (order.status === 'closed') {
      this.balance.crypto = 0;
      this.balance.base = this.balance.base + order.cost;
      await db.createOrder(order);
      await db.updateLedger({
        cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
        base: this.base, quantity: this.balance.crypto, purchasePrice: this.purchasePrice,
      });
      await db.closeTrackOrder(trackOrder._id);
      return order;
    } else {
      await db.createOrder(order);
      const status = await this.checkOrderStatus(order.id, cfg.order.wait, cfg.order.intervals);
      if (status.status === 'closed') {
        this.balance.crypto = 0;
        this.balance.base = this.balance.base + order.cost;
        await db.updateOrder(order.id, status);
        await db.updateLedger({
          cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
          base: this.base, quantity: this.balance.crypto, purchasePrice: this.purchasePrice,
        });
        await db.closeTrackOrder(trackOrder._id);
      } else if (this.balance.filled) {
        await db.updateLedger({
          cost: order.cost, transaction: order.side, crypto: this.crypto, price: order.price,
          base: this.base, quantity: this.balance.crypto, purchasePrice: this.purchasePrice,
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
    await this.getLastBalance();
    if (this.lastBalance >= cfg.minAmount && this.lastBalance <= cfg.maxAmount) {
      return this.lastBalance;
    }
    if (this.balance.base < cfg.minAmount) return 0;
    if (this.balance.base >= cfg.minAmount && this.balance.base <= cfg.maxAmount) {
      return this.balance.base;
    }
    if (this.balance.base > cfg.maxAmount) return cfg.maxAmount;
  }

  async decideQuantityToBuy() {
    const amount = await this.decideAmount();
    if (!this.currentPrice) this.currentPrice = await this.getPrice();
    const quantity = amount / this.currentPrice;
    return quantity;
  }

  async determineStopLoss() {
    if (this.maxPrice > this.purchasePrice) {
      this.stopLossPrice = this.maxPrice * (1 - cfg.runningStopLoss);
    } else {
      this.stopLossPrice = this.purchasePrice * (1 - cfg.initialStopLoss);
    }
    return this.stopLossPrice;
  }

  checkOrderStatus(orderId, wait, intervals) {
    let i = 1;
    let order;
    return(async(resolve) => {
      while (i <= intervals || order?.status == 'closed' ) {
        order = await this.orderStatus(orderId);
        i++;
        this.balance.filled = order?.filled;
        if (order?.filled > 0) {
          if (order.side == 'sell') this.balance.crypto = order.remaining;
          if (order.side == 'buy') this.balance.crypto = order.filled;
          this.balance.filled = order.filled;
        }
        if (i >= intervals || order.status === 'closed') {
          resolve(order);
        }
      }
      await this.delay(wait);
    });
  }

  async orderStatus(orderId) {
    let order = await ccxt.fetchOrder(orderId);
    // order = JSON.parse(order);
    return order.status;
  }

  async cancelOrder(orderId) {
    let cancelled = await ccxt.cancelOrder(orderId.toString());
    // return JSON.parse(cancelled);
    return cancelled;
  }

  /**
   * Return market data for given crypto currency pair from exchange
   * @returns Array with market data as per config parameters
   */
  async getMarketData() {
    const url =
      `${cfg.priceApiUrl}/klines?symbol=${this.crypto}${this.base}` +
      `&interval=${cfg.evalTime}&limit=${cfg.evalLimit}`;
    const marketData = await axios.get(url);
    return marketData.data;
  }

  async previousOpenOrder() {
    return await db.getOpenOrder();
  }

  /**
   * Adds or updates (if greater than current max price) Max Price for Currency
   * @param {Float} price new price of the crypto currency
   * @param {ObjectID} uid mongoDB document ID
   * @returns
   */
  async updatePrice(uid) {
    const newPrice = await this.getPrice();
    this.currentPrice = newPrice;
    if (this.maxPrice) {
      if (newPrice > this.maxPrice) {
        this.maxPrice = newPrice;
        await this.determineStopLoss();
        const updated = await db.setMaxPrice(uid, newPrice);
        if (updated) {
          this.log(`Updated Max Price for ${this.pair}: ${this.maxPrice.toString()}`);
          return newPrice;
        }
      }
    } else {
      const updated = await db.setMaxPrice(uid, newPrice);
      this.maxPrice = newPrice;
      await this.determineStopLoss();
      if (updated) {
        this.log(`Added Max Price for ${this.pair}: ${newPrice.toString()}`);
        return newPrice;
      }
    }
    return this.currentPrice;
  }

  signalToSell() {
    return new Promise (async (resolve) => {
      while (this.currentPrice > this.stopLossPrice * (1 + cfg.sellThreshold)) {
        await this.updatePrice;
        let diff = (this.currentPrice - this.purchasePrice) / this.purchasePrice * 100;
        this.log(
          `Current Price is: ${this.currentPrice}${this.base} (Purchased at `+
          `${this.purchasePrice}${this.base}) [${diff.toFixed(4)}%]`
        );
        if (this.currentPrice <= this.stopLossPrice * (1 + cfg.sellThreshold)) {
          // create stopLoss order
          resolve(true);
        }
        await this.delay(cfg.runningInterval);
      }
    });
  }

   /**
   * This functions keeps on checking market data and makes the purchase when conditions meet
   * @returns Object of order details
   */
  async purchaseCycle () {
    const baseAmount = await this.decideAmount();
    this.log(
      `Amount to buy ${this.crypto}: ${baseAmount} ${this.base}`
    );
    const goAhead = await this.followPrice();
    if (goAhead === true) {
      await this.getPrice();
      const thresholdPrice = this.currentPrice * (1 + cfg.buyThreshold);
      let quantity = await this.decideQuantityToBuy();
      if (this.balance.filled) quantity = quantity - this.balance.filled;
      const order = await this.buy(thresholdPrice, quantity);
      if (order.status == 'CANCELED') {
        await this.purchaseCycle();
      } else if (order.status == 'closed') {
        return order;
      }
    }
  };

/**
 * This functions keeps checking for price updates and sells at stop loss thresholds
 * @returns Object of order details
 */
 async sellCycle () {
  this.log(
    `Ready to sell ${this.balance.crypto} ${this.crypto} for ${this.base}`
  );
  await this.updatePrice();
  await this.signalToSell();
  const thresholdPrice = this.currentPrice * (1 + cfg.sellThreshold);
  const order = await this.sell(thresholdPrice, this.balance.crypto);
  if (order.status == 'CANCELED') {
    await this.sellCycle();
  } else if (order.status == 'closed') {
    return order;
  }
  return order;
};

  /**
   * Gets the current market price of crypto from exchange
   * @returns price of the crypto in base currency
   */
  async getPrice() {
    let info = await axios.get(
      `${cfg.priceApiUrl}/ticker/price?symbol=${this.crypto}${this.base}`
    );
    this.currentPrice = parseFloat(info.data.price);
    return this.currentPrice;
  }

  /**
   * Simple log with timestamp
   * @param {String} msg
   */
  log(msg) {
    console.log(new Date().toLocaleString(), msg);
  }

  /**
   * Follows the price of the crypto pair and returns true if and when the change in price
   * is above minimum price as specified in Config
   * @returns true when conditions are met
   */
  followPrice() {
    var conditionMet;
    return new Promise (async (resolve) => {
      while (conditionMet !== true) {
        const chart = await this.getMarketData();
        const market = await this.evaluateChart(chart);
        this.log(
          `${this.crypto}=${this.currentPrice}  Change Sum: `+
          `${(market.change * 100).toFixed(4)}% (need ${(cfg.minChange * 100)}%)|` +
          ` Overall Change over last ${cfg.evalTime}*${cfg.evalLimit}: ` +
          `${(market.overallChange * 100).toFixed(4)}% (need ${cfg.minOverallChange * 100}%)`
        );
        conditionMet = this.buyCondition(market);
        if (conditionMet) resolve(true);
        await this.delay(cfg.followInterval);
      }
    });
  }

  buyCondition(rate) {
    if (cfg.bothChangeSatisfy) {
      // Both changes must be greater than their minimum required values
      if (rate.change > cfg.minChange && rate.overallChange > cfg.minOverallChange) {
        this.log('Conditions to Purchase are met!');
        return true;
      }
    }
    // Either of the changes must be greater than their minimum required values
    if (rate.change > cfg.minChange || rate.overallChange > cfg.minOverallChange) {
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
    this.currentPrice = data[data.length - 1][4];
    return { change: difference, overallChange: changeOverEvaluation };
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = {
  Currency,
};
