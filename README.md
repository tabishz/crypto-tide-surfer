# Crypto Tide Surfer

## PM2 Config
For environment variables. Sample ecosystem.config.js

```js
module.exports = {
  apps : [{
    name: 'myBot',
    script: 'app.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '386M',
    env: {
      NODE_ENV: 'dev',
      API_KEY: '',
      API_SECRET: '',
      DB_HOST: 'localhost',
      DB_NAME: 'dev_botdb',
      DB_URI: 'mongodb://root:secretpass@localhost:27017/dev_botdb',
      PRICE_URL: 'https://www.binance.com/api/v3',
      MIN_AMOUNT: 10,
      MAX_AMOUNT: 50,
      INIT_STOP_LOSS: 0.015,
      RUN_STOP_LOSS: 0.018,
      SELL_THRESHOLD: 0.0015,
      BUY_THRESHOLD: 0.0015,
      RUNNING_INTERVAL: 10, // seconds
      FOLLOW_INTERVAL: 15, // seconds
      COOLOFF_PERIOD: 2, // minutes
      MIN_CHANGE: 0.008,
      MIN_OVERALL_CHANGE: 0.008,
      SATISFY_BOTH: 0, // 0 for False, 1 for True
      EVAL_TIME: '1m', // 1m, 3m, 5m, 10m, 15m, 30m, 1h
      EVAL_LIMIT: 6, // # of evaluation candles
      ORDER_WAIT: 3000,
      ORDER_INTERVALS: 6,
    },
    env_prd: {
      NODE_ENV: 'prd',
      API_KEY: 'secretapikey',
      API_SECRET: 'secretsauce',
      DB_HOST: 'freya',
      DB_NAME: 'botdb',
      DB_URI: 'mongodb://root:secretpass@localhost:27017/botdb',
      PRICE_URL: 'https://www.binance.com/api/v3',
      MIN_AMOUNT: 10,
      MAX_AMOUNT: 50,
      INIT_STOP_LOSS: 0.015,
      RUN_STOP_LOSS: 0.018,
      SELL_THRESHOLD: 0.0015,
      BUY_THRESHOLD: 0.0015,
      RUNNING_INTERVAL: 10, // seconds
      FOLLOW_INTERVAL: 15, // seconds
      COOLOFF_PERIOD: 2, // minutes
      MIN_CHANGE: 0.008,
      MIN_OVERALL_CHANGE: 0.008,
      SATISFY_BOTH: 0, // 0 for False, 1 for True
      EVAL_TIME: '1m', // 1m, 3m, 5m, 10m, 15m, 30m, 1h
      EVAL_LIMIT: 6, // # of evaluation candles
      ORDER_WAIT: 3000,
      ORDER_INTERVALS: 6,
    }
  }],
};
```

## MongoDB
Docker-compose.yaml

```yaml
version: '3.7'

services:
  mongodb:
    image: mongo:4.4.4
    restart: unless-stopped
    environment:
      MONGO_INITDB_DATABASE: cryptodb
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: secretpass
    volumes:
      - mongo_data:/data/db
    ports:
      - 27017-27019:27017-27019

volumes:
  mongo_data:
```

#### Useful MongoDB Queries

```js
var total=0;
db.getCollection('ledger').find({PnL: {$exists:true}}).forEach(doc => {
    total = total + doc.PnL;
    print(`${doc.crypto}/${doc.base}\t${new Date(doc.timestamp).toLocaleString()}\t${doc.PnL}`);
});
print(`Total: ${total.toFixed(3)}%`);
```