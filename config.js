const config = {
  crypto: process.env.CRYPTO,
  base: process.env.BASE,
  minPrice: 0.005, // not being used at the moment
  maxPrice: 0.02, // not being used at the moment
  initialAmount: 0.20, // Total Base Asset (%) // not being used at the moment
  minAmount: 10, // Minimum $ amount to use for purchases
  maxAmount: 50, // Maximum $ amount to use for purchases
  initialStopLoss: 0.015, // %age decimal 0.01 = 1%
  runningStopLoss: 0.01, // %age decimal
  sellThreshold: 0.0025, // %age closeness to stopLoss price when to place order
  buyThreshold: 0.0015, // %age closeness to buy price when placing order
  runningInterval: 10 *1000, // milliseconds
  followInterval: 15 *1000, // milliseconds
  coolOffPeriod: 2*60*1000, // time to wait between selling and buying again
  minChange: process.env.MIN_CHANGE, // Minimum % change in price over evaluation period to buy (0.01 = 1%)
  minOverallChange: process.env.MIN_OVERALL_CHANGE, // Minimum % change between newest and oldest candle in price to buy (0.01 = 1%)
  bothChangeSatisfy: false, // both minChange and OverallChange must satisfy before buy
  evalTime: "1m",
  evalLimit: 7,
  priceApiUrl: process.env.PRICE_URL,
  db: {
    ledger: 'ledger',
    orders: 'orders',
    track: 'track',
  },
  exchange: {
    fees: 0.001,
  },
  order: {
    wait: 3000,
    intervals: 6,
  }
};

module.exports = config;
