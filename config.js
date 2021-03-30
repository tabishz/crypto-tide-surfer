const config = {
  crypto: process.env.CRYPTO,
  base: process.env.BASE,
  minAmount: process.env.MIN_AMOUNT, // Minimum $ amount to use for purchases
  maxAmount: process.env.MAX_AMOUNT, // Maximum $ amount to use for purchases
  initialStopLoss: process.env.INIT_STOP_LOSS, // %age decimal 0.01 = 1%
  runningStopLoss: process.env.RUN_STOP_LOSS, // %age decimal
  sellThreshold: process.env.SELL_THRESHOLD, // %age closeness to stopLoss price when to place order
  buyThreshold: process.env.BUY_THRESHOLD, // %age closeness to buy price when placing order
  runningInterval: process.env.RUNNING_INTERVAL *1000, // milliseconds
  followInterval: process.env.FOLLOW_INTERVAL *1000, // milliseconds
  coolOffPeriod: process.env.COOLOFF_PERIOD *60*1000, // time to wait between selling and buying again
  minChange: process.env.MIN_CHANGE, // Minimum % change in price over evaluation period to buy (0.01 = 1%)
  minOverallChange: process.env.MIN_OVERALL_CHANGE, // Minimum % change between newest and oldest candle in price to buy (0.01 = 1%)
  bothChangeSatisfy: process.env.SATISFY_BOTH, // both minChange and OverallChange must satisfy before buy
  evalTime: process.env.EVAL_TIME,
  evalLimit: process.env.EVAL_LIMIT,
  priceApiUrl: process.env.PRICE_URL,
  db: {
    ledger: 'ledger',
    orders: 'orders',
    track: 'track',
    env: 'env',
  },
  exchange: {
    fees: 0.001,
  },
  order: {
    wait: process.env.ORDER_WAIT,
    intervals: process.env.ORDER_INTERVALS,
  },
  telegram: {
    enabled: (process.env.TELEGRAM_ENABLE == 1) ? true : false,
    token: process.env.TELEGRAM_API,
    allowed: process.env.TELEGRAM_ALLOW.split(','),
    chatId: process.env.TELEGRAM_CHAT,
  }
};

module.exports = config;
