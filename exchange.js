const ccxt = require('ccxt');
const binance = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET
});

const limitBuy = async (crypto, amount) => {
    await binance.createLimitBuyOrder();
}

module.exports = {
    sell,
    limitSell,
    buy,
    limitBuy,
}