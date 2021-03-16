const config = {
  crpyto: "HOT",
  base: "USDT",
  minPrice: 0.005,
  maxPrice: 0.02,
  initialAmount: 0.20, // Total Base Asset (%)
  initialStopLoss: 0.015, // %age
  runningStopLoss: 0.01, // %age
  runningInterval: 10 *1000, // milliseconds
  followInterval: 60 *1000, // milliseconds
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
