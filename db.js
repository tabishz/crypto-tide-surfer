const MongoClient = require('mongodb').MongoClient;
const cfg = require('./config');

// const mongo = new MongoClient(process.env.DB_URI, { useUnifiedTopology: true });

// mongo.db(process.env.DB_NAME).command({ping: 1});
var db, orders, ledger, track;
MongoClient.connect(process.env.DB_URI, { useNewUrlParser: true }, function(err, client) {
  if(err) { return console.error(err); }
  db = client.db(process.env.DB_NAME);
  orders = db.collection(cfg.db.orders);
  ledger = db.collection(cfg.db.ledger);
  track = db.collection(cfg.db.track);
});

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
  return await track.updateOne({ _id: uid }, { maxPrice: price }, { upsert: true });
};

const closeTrackOrder = async (uid) => {
  const data = {
    status: 'closed',
    closeTime: new Date(),
  };
  return await track.updateOne({ _id: uid }, data, { upsert: true });
};

/**
 * updates an order in mongoDB by replacing old one
 * @param {ObjectID} orderId 
 * @param {Object} newDoc 
 * @returns Boolean
 */
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

const updateLedger = async (details) => {
  const data = {
    crypto: details.crypto,
    base: details.base,
    cost: details.cost,
    quantity: details.quantity,
    transaction: details.transaction,
    fees: cfg.exchange.fees * details.cost,
    timestamp: new Date(),
  };
  const inserted = await ledger.insertOne(data);
  if (inserted) return true;
  return false;
};

const balance = async () => {
  const balance = await ledger.findOne({balances: true});
  return balance;
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
};
