require('dotenv').config();
const ccxt = require('ccxt');
const axios = require('axios');
const mysql = require('mysql');
const config = require('./config');

var start = 0;
var lastPrice = 0;
var orderRunning = 0;
var highPrice;
var profitLoss;
var actualBuyPrice;
var orderId;

var conn = mysql.createPool({
  connectionLimit: 20,
  host: 'localhost',
  port: 3308,
  user: 'root',
  password: '',
  database: 'cryptobot_db',
  multipleStatements: true,
});

console.log('CyptoXD Bot Started...');

const tick = async (binanceClient) => {
  try {
    const market = `${config.asset}/${config.base}`;
    var timeStamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    // Fetch current price
    const marketTicker = await Promise.all([
      axios.get(
        `https://www.binance.com/api/v3/ticker/price?symbol=${config.asset}${config.base}`
      ),
    ]);
    const marketPrice = marketTicker[0].data.price;

    const balances = await binanceClient.fetchBalance();
    const assetBalance = balances.free[config.asset];
    const baseBalance = balances.free[config.base];
    const sellVolume = assetBalance; //* config.percentSpend;
    const buyVolume = (baseBalance * config.percentSpend) / marketPrice;

    if (lastPrice !== 0) {
      var variance = ((marketPrice - lastPrice) / marketPrice) * 100;
    } else {
      variance = 0;
    }

    // Buy If Last 5 Min is Positive Slope +2%
    const marketResult = await Promise.all([
      axios.get(
        `https://www.binance.com/api/v3/klines?symbol=${config.asset}${config.base}&interval=${config.shortEvalTime}&limit=${config.evalLimit}`
      ),
    ]);

    function evaluateChart(data) {
      let change = new Array();
      for (let i = 0; i < data.length; i++) {
        change[i] = (parseFloat(data[i][4]) - parseFloat(data[i][1])) / parseFloat(data[i][4]);
      }
      let difference = 0;
      change.forEach((d) => (difference += d));
      const changeOverEvaluation =
        (data[data.length - 1][4] - data[0][1]) / data[data.length - 1][4];
      return { change: difference, overallChange: changeOverEvaluation };
    }

    var changeResult = evaluateChart(marketResult[0].data);

    /*     const intervalPriceOpen = marketResult[0].data[2][1];
    const intervalPriceHigh = marketResult[0].data[2][2];
    const intervalPriceLow = marketResult[0].data[2][3];
    const intervalPriceClose = marketResult[0].data[2][4]; */

    /*     // First Interval (Short)
    const intervalPriceClose = marketResult[0].data[2][4];
   
    // First Interval (Long)
    const longIntervalPriceHigh = marketResult[1].data[2][2];

    // Second Interval (Short)
    const sIntervalPriceClose = marketResult[0].data[1][4];

    // Second Interval (Long)
    const sLongIntervalPriceHigh = marketResult[1].data[1][2];

    // Third Interval (Short)
    const tIntervalPriceClose = marketResult[0].data[0][4];

    // Third Interval (Long)
    const tLongIntervalPriceHigh = marketResult[1].data[0][2];

    var fShortPercentChange = ((sIntervalPriceClose - tIntervalPriceClose) / (tIntervalPriceClose)) * 100;
    var sShortPercentChange = ((intervalPriceClose - sIntervalPriceClose) / (sIntervalPriceClose)) * 100;
    var sLongPercentChange = ((sLongIntervalPriceHigh - tLongIntervalPriceHigh) / (tLongIntervalPriceHigh)) * 100;
    var fLongPercentChange = ((longIntervalPriceHigh - sLongIntervalPriceHigh) / (sLongIntervalPriceHigh)) * 100 */

    if (start == 0) {
      console.log(`${timeStamp}: Evaluating the market of ${market}`);
      if (changeResult.change >= config.minChange) {
        console.log(`
            ${timeStamp}: Buy Indicator for ${market} @ ${marketPrice}
            % Change in Last Interval is ${(changeResult.change * 100).toFixed(3)}%
            
            `);
        start = 1;
        startPrice = marketPrice;
      }
    }

    // Execute Purchase Order for Start Price
    if (start == 1 && marketPrice <= startPrice) {
      highPrice = marketPrice;
      actualBuyPrice = marketPrice;
      const orderStatus = await binanceClient.createLimitBuyOrder(
        market,
        buyVolume,
        marketPrice
      );

      console.log(
        `${timeStamp}: Order ID: ${orderStatus.id} Status: ${orderStatus.status} Purchase Order Executed for ${buyVolume} ${config.asset} @ ${marketPrice} ${config.base}`
      );

      var sql = `INSERT INTO buy (orderid, pair, price, qty) VALUES (${orderStatus.id}, '${market}', ${marketPrice}, ${buyVolume})`;
      conn.query(sql, function (err, result) {
        if (err) throw err;
      });

      start = 2;
      orderRunning = 1;
      profitLoss = parseFloat(highPrice) - (parseFloat(highPrice) * config.initialStopLoss) / 100;
    }

    // Create & Update Sell Order if accumulated price increases more than 2% (take profit) or decreases more than 3% (stop loss)
    if (start == 2 && marketPrice > highPrice) {

        highPrice = marketPrice;
        profitLoss = parseFloat(highPrice) * (1 - config.runningStopLoss / 100);
        //parseFloat(highPrice) - parseFloat(actualBuyPrice) / 3 + parseFloat(actualBuyPrice);

    }

    if (start == 2 && marketPrice <= profitLoss) {
      const orderStatus = await binanceClient.createLimitSellOrder(
        market,
        sellVolume,
        marketPrice
      );
      if (marketPrice > actualBuyPrice) {
        PnL = assetBalance * marketPrice - assetBalance * actualBuyPrice;
        console.log(
          `${timeStamp}: Order ID: ${orderStatus.id} Status: ${orderStatus.status} Sell Order Executed [Profit] for ${assetBalance} ${config.asset} @ ${marketPrice} ${config.base} - Profit: $${PnL}`
        );
        var sql = `INSERT INTO sell (orderid, pair, price, qty, PnL) VALUES (${orderStatus.id}, '${market}', ${marketPrice}, ${assetBalance}, ${PnL})`;
        conn.query(sql, function (err, result) {
            if (err) throw err;
        });
      } else {
        PnL = assetBalance * actualBuyPrice - assetBalance * marketPrice;
        console.log(
          `${timeStamp}: Order ID: ${orderStatus.id} Status: ${orderStatus.status} Sell Order Executed [Loss] for ${assetBalance} ${config.asset} @ ${marketPrice} ${config.base} - Loss: $${PnL}`
        );
        var sql = `INSERT INTO sell (orderid, pair, price, qty, PnL) VALUES (${orderStatus.id}, '${market}', ${marketPrice}, ${assetBalance}, -${PnL})`;
        conn.query(sql, function (err, result) {
            if (err) throw err;
        });
      }

      start = 0;
      orderRunning = 0;
    }

    if (orderRunning == 0) {
      console.log(
        `${timeStamp}: Current Price is ${marketPrice}. Variance: ${variance.toFixed(
          2
        )}% | Sum of Last ${config.evalLimit} Candles: ${(changeResult.change * 100).toFixed(3)}%`
      );
    } else {
      console.log(`${timeStamp}: [1] Sell Order for ${sellVolume} ${market} in Progress...
        Purchase Price: ${actualBuyPrice}
        Current Price: ${marketPrice}
        Variance: ${variance.toFixed(3)}%
        Highest Price: ${highPrice}
        Stop Loss: ${profitLoss}
                
        `);
    }

    lastPrice = marketPrice;
  } catch (error) {
    console.log(error);
  }
};

const run = () => {
  const binanceClient = new ccxt.binance({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    options: { adjustForTimeDifference: true },
  });

  tick(binanceClient);
  setInterval(tick, config.tickInterval, binanceClient);
};

run();
