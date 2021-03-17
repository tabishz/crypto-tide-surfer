const config = {
    asset: 'HOT',
    base: 'USDT',
    percentSpend: 0.5,
    initialStopLoss: 2, // Percentage
    runningStopLoss: 1, // Percentage
    tickInterval: 10000,
    evalLimit: 3,
    shortEvalTime: '1m',
    shortChange: 0.25,
    longEvalTime: '15m',
    longChange: 0.5,
    minChange: 0.0050
}

module.exports = config;