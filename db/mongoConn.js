const dbDriver = require('mongodb');
let database = {};
let dbClient = dbDriver.MongoClient(process.env.DB_URI, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
});

let dbo = false;
database.getObjectId = (id) => {
  return dbDriver.ObjectID(id);
};

database.connect = () => {
  return new Promise(async (resolve, reject) => {
    try {
      await dbClient.connect();
      dbo = dbClient.db(process.env.DB_NAME);
      if (!dbo) throw new Error('Unable to connect to database');
      else resolve(dbo);
    } catch (e) {
      reject(e);
    }
  });
};

database.get = () => dbo;

database.close = () => {
  return new Promise(async (resolve, reject) => {
    try {
      await dbClient.close();
      resolve();
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = database;
