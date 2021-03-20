const mongoose = require('mongoose');
const config = require('./config');

mongoose
  .connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    poolSize: 5,
  })
  .then(() => log('Connected to MongoDB'))
  .catch(() => log('Unable to connect to MongoDB'));

const trackerSchema = new mongoose.Schema(
  {
    id: String,
    symbol: { type: String, required: [true, 'Symbol is missing'] },
    status: String,
    amount: Number,
    quantity: Number,
    price: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    maxPrice: Number,
    closeTime: Date,
  },
  { collection: config.db.track }
);

const ledgerSchema = new mongoose.Schema(
  {
    crypto: String,
    base: String,
    cost: Number,
    priceBought: Number,
    priceSold: Number,
    quantity: Number,
    transaction: String,
    fees: Number,
    PnL: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: config.db.ledger }
);

const orderSchema = new mongoose.Schema(
  {
    info: Object,
    id: String,
    clientOrderId: String,
    timestamp: Number,
    datetime: String,
    symbol: String,
    type: String,
    timeInForce: String,
    postOnly: Boolean,
    side: String,
    price: Number,
    amount: Number,
    cost: Number,
    average: Number,
    filled: Number,
    remaining: Number,
    status: String,
  },
  { collection: config.db.order }
);

const Tracker = new mongoose.model('Tracker', trackerSchema);
const Ledger = new mongoose.model('Ledger', ledgerSchema);
const Order = new mongoose.model('Order', orderSchema);

// const createRecord
const getOpenOrder = async () => {
  try {
    const openOrder = await Tracker.findOne({ status: 'open' }, { timestamp: -1 }).exec();
    return openOrder.toObject();
  } catch (error) {
    log(`Unable to get open order. ${JSON.stringify(error)}`);
    throw error;
  }
};

const newTrackOrder = async (pair, amount, price, id) => {
  const data = new Tracker({
    id: id,
    symbol: pair,
    status: 'open',
    amount: amount,
    quantity: amount / price,
    price: price,
    // timestamp: new Date(),
  });
  try {
    const results = await data.save();
    log('Tracker log created');
    return results;
  } catch (error) {
    log(`Unable to created tracker log. ${JSON.stringify(error)}`);
    throw error;
  }
};

/**
 * Gets Max Price for the tracked order if available in database
 * @param {ObjectID} uid for mongoDB
 * @returns Object with maxPrice if available
 */
const getMaxPrice = async (oid) => {
  try {
    const price = await Tracker.findOne({ id: oid }, { maxPrice: 1 }).exec();
    if (price) return price.toObject();
    return null;
  } catch (error) {
    log(`Unable to get Max Price. ${JSON.stringify(error)}`);
    throw error;
  }
};

/**
 * Updates maxPrice in the mongoDB collection
 * @param {ObjectID} uid for mongoDB
 * @param {Float} price max price to set in database
 * @returns Object of confirmation of update
 */
const setMaxPrice = async (oid, price) => {
  try {
    return await Tracker.updateOne({ id: oid }, { maxPrice: price }, { upsert: true });
  } catch (error) {
    log(`Unable to set Max Price. ${JSON.stringify(error)}`);
    throw error;
  }
};

const closeTrackOrder = async (oid) => {
  const data = {
    status: 'closed',
    closeTime: new Date(),
  };
  try {
    return await Tracker.updateOne({ id: oid }, data, { upsert: true });
  } catch (error) {
    log(`Unable to close Track Order. ${JSON.stringify(error)}`);
    throw error;
  }
};

/**
 * updates an order in mongoDB by replacing old one
 * @param {ObjectID} orderId
 * @param {Object} newDoc
 * @returns Boolean
 */
const updateOrder = async (orderId, newDoc) => {
  try {
    await Order.deleteOne({ id: orderId });
    const data = new Order(newDoc);
    const inserted = data.save();
    if (inserted) return true;
    return false;
  } catch (error) {
    log(`Unable to Update Order ${orderId}. ${JSON.stringify(error)}`);
    throw error;
  }
};

const createOrder = async (newDoc) => {
  try {
    const data = new Order(newDoc);
    const inserted = await data.save();
    if (inserted) return true;
    return false;
  } catch (error) {
    log(`Unable to create Order. ${JSON.stringify(error)}`);
    throw error;
  }
};

const updateLedger = async (details) => {
  const data = {
    crypto: details.crypto,
    base: details.base,
    cost: details.cost,
    priceBought: details.purchasePrice,
    quantity: details.quantity,
    transaction: details.transaction,
    fees: config.exchange.fees * details.cost,
    // timestamp: new Date(), // Using Default in Schema
  };

  if (details.transaction == 'sell') {
    data.priceSold = details.price;
    data.PnL =
      (data.priceSold * data.quantity - data.fees) -
      (data.priceBought * data.quantity * (1 + config.exchange.fees));
  }

  try {
    const insert = new Ledger(data);
    const inserted = await insert.save();
    if (inserted) return true;
    return false;
  } catch (error) {
    log(`Unable to update Ledger. ${JSON.stringify(error)}`);
    throw error;
  }
};

const lastBalance = async () => {
  try {
    const balance = await Ledger.findOne({ transaction: 'sell' })
      .sort({ timestamp: -1 })
      .exec();
  } catch (error) {
    throw error;
  }
};

/**
 * Used only in Dev Environment to mock getBalances of Exchange
 * @returns Object of balances
 */
const balance = async () => {
  try {
    const balance = await Ledger.findOne({ balances: true }).exec();
    return balance.toObject();
  } catch (error) {
    log(`Unable to get Balance. ${JSON.stringify(error)}`);
    throw error;
  }
};

const log = (msg) => {
  console.log(new Date().toLocaleString(), '[Mongo]', msg);
};

module.exports = {
  getOpenOrder,
  updateOrder,
  updateLedger,
  createOrder,
  newTrackOrder,
  closeTrackOrder,
  getMaxPrice,
  setMaxPrice,
  balance,
  lastBalance,
};
