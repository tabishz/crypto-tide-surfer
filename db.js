const {MongoClient} = require('mongodb');
const mongo = new MongoClient(process.env.DB_URI);

mongo.connect();
mongo.db(process.env.DB_NAME).command({ping: 1});

const createRecord


module.exports = {

};