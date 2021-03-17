const config = {
  crpyto: "HOT",
  base: "USDT",
  minPrice: 0.005,
  maxPrice: 0.02,
  initialAmount: 0.20, // Total Base Asset (%)
  minAmount: 10, // Minimum $ amount to use for purchases
  maxAmount: 50, // Maximum $ amount to use for purchases
  initialStopLoss: 0.015, // %age decimal 0.01 = 1%
  runningStopLoss: 0.01, // %age decimal
  runningInterval: 10 *1000, // milliseconds
  followInterval: 60 *1000, // milliseconds
  minChange: 0.01, // Minimum % change in price over evaluation period to buy (0.01 = 1%)
  minOverallChange: 0.01, // Minimum % change between newest and oldest candle in price to buy (0.01 = 1%)
  bothChangeSatisfy: true, // both minChange and OverallChange must satisfy before buy
  evalTime: "1m",
  evalLimit: 4,
  evalLast: 4,
  priceApiUrl: 'https://www.binance.com/api/v3',
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
