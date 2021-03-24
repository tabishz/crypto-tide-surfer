const config = {
    asset: 'COTI',
    base: 'USDT',
    percentSpend: 1,
    initialStopLoss: 2, // Percentage
    runningStopLoss: 0.6, // Percentage
    tickInterval: 5000,
    evalLimit: 3,
    shortEvalTime: '1m',
    shortChange: 0.25,
    longEvalTime: '15m',
    longChange: 0.5,
    strategy: 'long',
    minChange: 0.0040
}

module.exports = config;