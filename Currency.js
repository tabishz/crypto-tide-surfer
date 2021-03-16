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
    return JSON.parse(marketData);
  }

  async previousOpenOrder() {
    return await db.getOpenOrder();
  }

  async getPrice() {
    let info = await axios.get(
      `${cfg.priceApiUrl}/ticker/price?symbol=${this.crypto}${this.base}`
    );
    info = JSON.parse(info);
    return parseFloat(info.price);
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
}

module.exports = {
  Currency,
};
