const ccxt = require('ccxt');
const axios = require('axios');

const db = require('./db');
const cfg = require('/.config');

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

  // async buy(price, amount) {
  //   const order = await this.limitBuy(price, amount);
  //   if (order.status !== 'closed') {
  //     const cancelled = await this.cancelOrder(order.id);
  //     if (cancelled.status === 'CANCELED') {
  //       return cancelled;
  //     } else {
  //       return false;
  //     }
  //   }
  //   return order;
  // }

  // async sell(price, amount) {
  //   const order = await this.limitSell(price, amount);
  //   if (order.status !== 'closed') {
  //     const cancelled = await this.cancelOrder(order.id);
  //     if (cancelled.status === 'CANCELED') {
  //       return cancelled;
  //     } else {
  //       return false;
  //     }
  //   }
  //   return order;
  // }

  // Test Functions
  async buy(price, amount) {
    await db.newTrackOrder(this.pair, amount, price * amount);
    this.log(`Placing order for ${this.pair} for ${price} (${amount})`);
    return await db.updateLedger(amount, 'buy');
  }
  async sell(price, amount) {
    const trackOrder = await db.getOpenOrder();
    await db.closeTrackOrder(trackOrder._id);
    this.log(`Selling order for ${this.pair} for ${price} (${amount})`);
    return await db.updateLedger(amount, 'sell');
  }
  // End Test Functions

  async limitBuy(price, amount) {
    const order = await exchange.createLimitBuyOrder(this.pair, amount, price);
    if (order.status === 'closed') {
      await db.createOrder(amount, order.side, order);
      await db.newTrackOrder(this.pair, amount, order.cost);
      await db.updateLedger(order.cost, order.side);
      return order;
    } else {
      const status = await this.checkOrderStatus(order.id, cfg.order.wait, cfg.order.intervals);
      if (status.status === 'closed') {
        await this.createOrder(status.cost, status.side, status);
        await db.newTrackOrder(this.pair, amount, status.cost);
        await db.updateLedger(status.cost, status.side);
      }
      return status;
    }
  }

  async limitSell(price, amount) {
    const trackOrder = await db.getOpenOrder();
    const order = await exchange.createLimitSellOrder(this.pair, amount, price);
    if (order.status === 'closed') {
      await db.createOrder(order);
      await db.updateLedger(order.cost, order.side);
      await db.closeTrackOrder(trackOrder._id);
      return order;
    } else {
      await db.createOrder(order);
      const status = await this.checkOrderStatus(order.id, cfg.order.wait, cfg.order.intervals);
      if (status.status === 'closed') {
        await db.updateOrder(order.id, status);
        await db.updateLedger(status.cost, status.side);
        await db.closeTrackOrder(trackOrder._id);
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

  async decideAmount() {
    if (!this.balance.base || this.balance.base < cfg.minAmount) return 0;
    if (this.balance.base >= cfg.minAmount && this.balance.base <= cfg.maxAmount) {
      return this.balance.base;
    }
    if (this.balance.base > cfg.maxAmount) return cfg.maxAmount;    
  }

  async checkOrderStatus(orderId, wait, intervals) {
    let i = 1;
    const handle = setInterval(async () => {
      let order = await this.orderStatus(orderId);
      i++;
      if (i >= intervals || order.status === 'closed') {
        clearInterval(handle);
        return order;
      }
    }, wait);
  }

  async orderStatus(orderId) {
    let order = await ccxt.fetchOrder(orderId);
    order = JSON.parse(order);
    return order.status;
  }

  async cancelOrder(orderId) {
    let cancelled = await ccxt.cancelOrder(orderId.toString());
    return JSON.parse(cancelled);
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

  async getPrice() {
    let info = await axios.get(
      `${cfg.priceApiUrl}/ticker/price?symbol=${this.crypto}${this.base}`
    );
    info = JSON.parse(info.data);
    this.price = parseFloat(info.price);
    return this.price;
  }

  /**
   * Adds or updates (if greater than current max price) Max Price for Currency
   * @param {Float} price new price of the crypto currency
   * @param {ObjectID} uid mongoDB document ID
   * @returns
   */
  async updatePrice(price, uid) {
    const newPrice = await this.getPrice();
    const track = await db.getMaxPrice(uid);
    if (track?.maxPrice) {
      if (newPrice > track.maxPrice) {
        const updated = await db.setMaxPrice(uid, newPrice);
        if (updated) {
          this.log(`Updated Max Price for ${this.pair}: ${newPrice.toString()}`);
          return newPrice;
        }
      }
    } else {
      const updated = await db.setMaxPrice(uid, newPrice);
      if (updated) {
        this.log(`Added Max Price for ${this.pair}: ${newPrice.toString()}`);
        return newPrice;
      }
    }
    return false;
  }

  /**
   * Simple log with timestamp
   * @param {String} msg
   */
  log(msg) {
    console.log(new Date().getISOString(), msg);
  }

  /**
   * Follows the price of the crypto pair and returns true if and when the change in price
   * is above minimum price as specified in Config
   * @returns true when conditions are met
   */
  async followPrice() {
    var followHandle = setInterval(async () => {
      const chart = await this.getMarketData();
      const market = await this.evaluateChart(chart);
      if (cfg.bothChangeSatisfy) {
        // Both changes must be greater than their minimum required values
        if (market.change > cfg.minChange && market.overallChange > cfg.minOverallChange) {
          clearInterval(followHandle);
          return true;
        }
      } else {
        // Either of the changes must be greater than their minimum required values
        if (market.change > cfg.minChange || market.overallChange > cfg.minOverallChange) {
          clearInterval(followHandle);
          return true;
        }
      }
    }, cfg.followInterval);
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
    return { change: difference, overallChange: changeOverEvaluation };
  }
}

module.exports = {
  Currency,
};
