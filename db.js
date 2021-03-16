const { MongoClient } = require('mongodb');
const cfg = require('./config');

const mongo = new MongoClient(process.env.DB_URI);

mongo.connect();
// mongo.db(process.env.DB_NAME).command({ping: 1});
const db = mongo.db(process.env.DB_NAME);
const orders = db.collection(cfg.db.orders);
const ledger = db.collection(cfg.db.ledger);
const track = db.collection(cfg.db.track);

// const createRecord
const getOpenOrder = async () => {
  const openOrder = await track.findOne({ status: 'open' }, { timestamp: -1 });
  return openOrder;
};

const newTrackOrder = async (pair, amount, price) => {
  const data = {
    symbol: pair,
    status: 'open',
    amount: amount,
    price: price,
    timestamp: new Date(),
  };
  return await track.insertOne(data);
};

/**
 * Gets Max Price for the tracked order if available in database
 * @param {ObjectID} uid for mongoDB
 * @returns Object with maxPrice if available
 */
const getMaxPrice = async (uid) => {
  return await track.findOne({ _id: uid }, { maxPrice: 1 });
};

/**
 * Updates maxPrice in the mongoDB collection
 * @param {ObjectID} uid for mongoDB
 * @param {Float} price max price to set in database
 * @returns Object of confirmation of update
 */
const setMaxPrice = async (uid, price) => {
  const order = await this.getMaxPrice(uid);
  if (!order.maxPrice || order.maxPrice < price) {
    return await track.updateOne({ _id: uid }, { maxPrice: price }, { upsert: true });
  } else {
    return false;
  }
};

const closeTrackOrder = async (uid) => {
  const data = {
    status: 'closed',
    closeTime: new Date(),
  };
  return await track.updateOne({ _id: uid }, data, { upsert: true });
};

const updateOrder = async (orderId, newDoc) => {
  await orders.deleteOne({ id: orderId });
  const inserted = await orders.insertOne(newDoc);
  if (inserted) return true;
  return false;
};

const createOrder = async (newDoc) => {
  const inserted = await orders.insertOne(newDoc);
  if (inserted) return true;
  return false;
};

const updateLedger = async (amount, transaction) => {
  const data = {
    amount: amount,
    transaction: transaction,
    fees: cfg.exchange.fees * amount,
    timestamp: new Date(),
  };
  const inserted = await ledger.insertOne(data);
  if (inserted) return true;
  return false;
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
};
