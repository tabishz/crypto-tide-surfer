const config = {
  crypto: "ADA",
  base: "USDT",
  minPrice: 0.005,
  maxPrice: 0.02,
  initialAmount: 0.20, // Total Base Asset (%)
  minAmount: 10, // Minimum $ amount to use for purchases
  maxAmount: 50, // Maximum $ amount to use for purchases
  initialStopLoss: 0.015, // %age decimal 0.01 = 1%
  runningStopLoss: 0.01, // %age decimal
  sellThreshold: 0.0025, // %age closeness to stopLoss price when to place order
  buyThreshold: 0.0015, // %age closeness to buy price when placing order
  runningInterval: 10 *1000, // milliseconds
  followInterval: 20 *1000, // milliseconds
  minChange: 0.01, // Minimum % change in price over evaluation period to buy (0.01 = 1%)
  minOverallChange: 0.01, // Minimum % change between newest and oldest candle in price to buy (0.01 = 1%)
  bothChangeSatisfy: true, // both minChange and OverallChange must satisfy before buy
  evalTime: "1m",
  evalLimit: 4,
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
