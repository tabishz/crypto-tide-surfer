const mongoose = require('mongoose');
const config = require('./config');

mongoose
  .connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    poolSize: 5,
  })
  .then(() => {
    log('Connected to MongoDB');
  })
  .catch((error) => {
    log('Unable to connect to MongoDB '+ JSON.stringify(error));
  });

const ledgerSchema = new mongoose.Schema(
  {
    crypto: String,
    base: String,
    cost: Number,
    priceBought: Number,
    priceSold: Number,
    price: Number,
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
    datetime: Date,
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

const trackSchema = new mongoose.Schema({
  id: Number,
  orderId: String,
  mode: String,
  symbol: String,
  purchasePrice: Number,
  maxPrice: Number,
  quantity: Number,
  remaining: Number,
  purchased: Number,
  balance: Number,
},
{
  collection: config.db.track,
  timestamps: true,
});

const Ledger = new mongoose.model('Ledger', ledgerSchema);
const Order = new mongoose.model('Order', orderSchema);
const Tracker = new mongoose.model('Tracker', trackSchema);

const checkTracker = async (symbol) => {
  try {
    const order = await Tracker.findOne({id: 1, symbol: symbol}).exec();
    if (order) {
      return order.toObject();
    } else {
      const newTrack = new Tracker({id: 1, symbol: symbol, mode: 'new'});
      await newTrack.save();
    }
    return order;
  } catch (error) {
    log(`Unable to get Tracker Order. ${JSON.stringify(error)}`);
    throw error;
  }
}

const updateTracker = async (updates) => {
  try {
    await Tracker.updateOne({id: 1}, updates);
    return true;
  } catch (error) {
    log(`Unable to update Tracker Order. ${JSON.stringify(error)}`);
    throw error;
  }
}

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
    priceBought: details.priceBought,
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
    return balance;
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
  checkTracker,
  updateTracker,
  updateOrder,
  updateLedger,
  createOrder,
  balance,
  lastBalance,
};
