require('dotenv').config();
const ccxt = require('ccxt');
const axios = require('axios');
const mysql = require('mysql');
const config = require('./config');
const asset = config.asset;
const base = config.base;
const tickInterval = config.tickInterval;
const spread = config.spread;
const percentSpend = config.percentSpend;
const stopLoss = config.stopLoss;
const takeProfit = config.takeProfit;
const evalTime = config.evalTime;
const startPrice = config.startPrice;

var start = 0;
var lastPrice = 0;
var orderStatus;
var actualBuyPrice;

/* console.log(`${timeStamp}: Buy Limit Order Created with ${startSpend} ${base} for ${asset} @ ${startPrice} ${base}`);  */

var conn = mysql.createPool({
    connectionLimit: 20,
    host: "localhost",
    port: 3308,
    user: "root",
    password: "",
    database: "cryptobot_db",
    multipleStatements: true
  });

/* var sql = `INSERT INTO start (pair, price, spend) VALUES ('${market}', ${startPrice}, ${startSpend})`;
conn.query(sql, function (err, result) {
    if (err) throw err;
}); */

const tick = async (config, binanceClient) => {
try {

    const market = `${asset}/${base}`;
    var timeStamp = new Date().toISOString().replace(/T/, ' '). replace(/\..+/, '');

    // Cancel open orders left from previous tick, if any
/*     const orders = await binanceClient.fetchOpenOrders(market);
    orders.forEach(async order => {
        try {
    await binanceClient.cancelOrder(order.id, market);
        } catch (error) { console.log(error); }
    }); */

    // Fetch current price
    const marketTicker = await Promise.all([
        axios.get(`https://www.binance.com/api/v3/ticker/price?symbol=${asset}${base}`)
    ]); 
    const marketPrice = marketTicker[0].data.price;

    const sellPrice = marketPrice * (1 + spread);
    const buyPrice = marketPrice * (1 - spread);
    const balances = await binanceClient.fetchBalance();
    const assetBalance = balances.free[asset];
    const baseBalance = balances.free[base];
    const sellVolume = assetBalance; //* percentSpend;
    const buyVolume = (baseBalance * percentSpend) / marketPrice;

    

    if (lastPrice !== 0) {
        var variance = (marketPrice - lastPrice) / marketPrice * 100;
    } else { 
        variance = 0;
        console.log(`${timeStamp}: Buy Limit Order Created for ${buyVolume} ${asset} @ ${startPrice} ${base}`); 
    }

    console.log(`
        ${timeStamp}: Current Price is ${marketPrice}. Variance: ${variance}
    `);

    // Buy If Last 5 Min is Positive Slope +2%
    const marketResult = await Promise.all([
        axios.get(`https://www.binance.com/api/v3/klines?symbol=${asset}${base}&interval=${evalTime}&limit=3`)
    ]); 

    // First 5 Mins
    const intervalPriceOpen = marketResult[0].data[0][1];
    const intervalPriceHigh = marketResult[0].data[0][2];
    const intervalPriceLow = marketResult[0].data[0][3];
    const intervalPriceClose = marketResult[0].data[0][4];

    // Second 5 Mins
    const sIntervalPriceOpen = marketResult[0].data[1][1];
    const sIntervalPriceHigh = marketResult[0].data[1][2];
    const sIntervalPriceLow = marketResult[0].data[1][3];
    const sIntervalPriceClose = marketResult[0].data[1][4];

    // Third 5 Mins
    const tIntervalPriceOpen = marketResult[0].data[2][1];
    const tIntervalPriceHigh = marketResult[0].data[2][2];
    const tIntervalPriceLow = marketResult[0].data[2][3];
    const tIntervalPriceClose = marketResult[0].data[2][4];

    var sPercentChange = ((tIntervalPriceClose - sIntervalPriceClose) / (tIntervalPriceClose)) * 100
    var fPercentChange = ((sIntervalPriceClose - intervalPriceClose) / (sIntervalPriceClose)) * 100

    if (start == 2 && fPercentChange >= 2 && sPercentChange >= 1) {
        console.log(`
        ${timeStamp}: Should buy again ${market} @ ${marketPrice}
        % Change in Last 10 Mins is ${sPercentChange}
        % Change in Last 5 Mins is ${fPercentChange}`);
    }

    // (First Time Only) Execute Purchase Order for Start Price
    if (start == 0 && marketPrice <= startPrice) {
        var cost = marketPrice * buyVolume;
        actualBuyPrice = marketPrice;
        //await binanceClient.createMarketBuyOrder(market, cost);
        await binanceClient.createLimitBuyOrder(market, buyVolume, marketPrice);

        console.log(`${timeStamp}: Purchase Order Executed for ${buyVolume} ${asset} @ ${marketPrice} ${base}`);

        var sql = `INSERT INTO buy (pair, price, qty) VALUES ('${market}', ${marketPrice}, ${buyVolume})`;
            conn.query(sql, function (err, result) {
            if (err) throw err;
        });

        start = 1;
    }

    // (First Time Only) Create & Update Sell Order if accumulated price increases more than 2% (take profit) or decreases more than 3% (stop loss) 
    if (start == 1 && marketPrice >= (actualBuyPrice + ((actualBuyPrice * takeProfit) / 100))) {
        PnL = (assetBalance * marketPrice) - (assetBalance * actualBuyPrice);
        var cost = marketPrice * sellVolume;
        //await binanceClient.createMarketSellOrder(market, cost);
        await binanceClient.createLimitSellOrder(market, sellVolume, marketPrice);

        console.log(`${timeStamp}: Sell Order Executed [Take Profit] for ${assetBalance} ${asset} @ ${marketPrice} ${base} - Profit: $${PnL}`);
        var sql = `INSERT INTO sell (pair, price, qty, PnL) VALUES ('${market}', ${marketPrice}, ${assetBalance}, ${PnL})`;
            conn.query(sql, function (err, result) {
            if (err) throw err;
        });
        start = 2;
    } else if (start == 1 && marketPrice <= (actualBuyPrice - ((actualBuyPrice * stopLoss) / 100))) {
        PnL = (assetBalance * actualBuyPrice) - (assetBalance * marketPrice);
        var cost = marketPrice * sellVolume;
        //await binanceClient.createMarketSellOrder(market, cost);
        await binanceClient.createLimitSellOrder(market, sellVolume, marketPrice);

        console.log(`${timeStamp}: Sell Order Executed [Stop Loss] for ${assetBalance} ${asset} @ ${marketPrice} ${base} - Loss: $${PnL}`);
        var sql = `INSERT INTO sell (pair, price, qty, PnL) VALUES ('${market}', ${marketPrice}, ${assetBalance}, ${PnL})`;
            conn.query(sql, function (err, result) {
            if (err) throw err;
        });
        start = 2;
    }

      //Send orders
    //await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    //await binanceClient.createMarketBuyOrder(market, buyVolume, buyPrice);

/*     console.log(`
    ${timeStamp}
    New tick for ${market}...
    Created limit sell order for ${sellVolume}@${sellPrice}  
    Created limit buy order for ${buyVolume}@${buyPrice}  
    Balances:
    ${base}: ${baseBalance}
    ${asset}: ${assetBalance}
    `); */

    lastPrice = marketPrice;


} catch (error) { console.log(error); }}

const run = () => {

    const binanceClient = new ccxt.binance({
        apiKey: process.env.API_KEY,
        secret: process.env.API_SECRET
    });

    tick(config, binanceClient);
    setInterval(tick, tickInterval, config, binanceClient);
};

run();