// require('dotenv').config();
const config = require('./config');
const { Currency } = require('./Currency');

const cryptoCurrency = new Currency(config.crypto, config.base);

const main = async () => {
  // Check if a previous open tracking order is in database
  await cryptoCurrency.initialize();
  // const previousOrder = await cryptoCurrency.previousOpenOrder();
  // if (previousOrder) {
  //   // if there is one, continue that progress
  //   // Monitor price and decide when to sell
  //   //
  // }

  // Just start looking to purchase
  await purchaseCycle();
  await sellCycle();
  main();
  return;    
};

// running the main logic
cryptoCurrency.log(`Running ENV:${process.env.NODE_ENV}`);
main();

/**
 * This functions keeps on checking market data and makes the purchase when conditions meet
 * @returns Object of order details
 */
const purchaseCycle = async () => {
  const baseAmount = await cryptoCurrency.decideAmount();
  cryptoCurrency.log(
    `Amount to buy ${cryptoCurrency.crypto} with ${baseAmount} ${cryptoCurrency.base}`
  );
  await cryptoCurrency.followPrice();
  await cryptoCurrency.getPrice();
  const thresholdPrice = cryptoCurrency.currentPrice * (1 + config.buyThreshold);
  let quantity = await cryptoCurrency.decideQuantityToBuy();
  if (cryptoCurrency.balance.filled) quantity = quantity - cryptoCurrency.balance.filled;
  const order = await cryptoCurrency.buy(thresholdPrice, quantity);
  if (order.status == 'CANCELED') {
    await purchaseCycle();
  } else if (order.status == 'closed') {
    return order;
  }
  return order;
};

/**
 * This functions keeps checking for price updates and sells at stop loss thresholds
 * @returns Object of order details
 */
const sellCycle = async () => {
  cryptoCurrency.log(
    `Ready to sell ${cryptoCurrency.balance.crypto} ${cryptoCurrency.crypto} for ${cryptoCurrency.base}`
  );
  await cryptoCurrency.updatePrice();
  const thresholdPrice = cryptoCurrency.currentPrice * (1 + config.sellThreshold);
  const order = await cryptoCurrency.sell(thresholdPrice, cryptoCurrency.balance.crypto);
  if (order.status == 'CANCELED') {
    await sellCycle();
  } else if (order.status == 'closed') {
    return order;
  }
  return order;
};
