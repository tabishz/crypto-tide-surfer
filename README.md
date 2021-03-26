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
      PORT: 9024,
      APP_NAME: 'botapi',
      TELEGRAM_ENABLE: 1, // 1 - true, 0 - false
      TELEGRAM_API: 'telegram-bot-api-key',
      TELEGRAM_CHAT: 123, // Telegram chat ID to announce to
      TELEGRAM_ALLOW: 'user1,user2', // Users in allow list
    }
  }],
};
```

### Environment Variables
| ENV Variable | Description |
| ------------ | ----------- |
| **NODE_ENV**   | 'dev' dry run, 'prd' real transtions |
| **API_KEY**    | Exchange API Key |
| **API_SECRET** | Exchange API Secret |
| **DB_HOST**    | Database hostname or IP |
| **DB_NAME**    | Database Name in MongoDB |
| **DB_URI**     | Database URI |
| **PRICE_URL**  | Price API Base URL |
| **MIN_AMOUNT** | Minimum Amount to spend for a buy order |
| **MAX_AMOUNT** | Maximum Amount to spend for a buy order |
| **INIT_STOP_LOSS** | Initial Stop Loss in Decimal % |
| **RUN_STOP_LOSS** | Running Stop Loss (once price goes over purchase price) |
| **SELL_THRESHOLD** | Decimal % decrease room to make sure sell order goes through |
| **BUY_THRESHOLD** | Decimal % increase room to make sure buy order goes through |
| **RUNNING_INTERVAL** | Number of seconds between price pull when looking to sell |
| **FOLLOW_INTERVAL** | Number of seconds between price pull when looking to purchase |
| **COOLOFF_PERIOD** | # of Minutes wait before buying again after selling  |
| **MIN_CHANGE** | Minimum Decimal % positive change to buy |
| **MIN_OVERALL_CHANGE** | Minimum Decimal % positive change over period to buy |
| **SATISFY_BOTH** | Whether to satisfy both minimums in *MIN_CHANGE* and *MIN_OVERALL_CHANGE* |
| **EVAL_TIME** | Evaluation candle period size |
| **EVAL_LIMIT** | Number of Candles to Evaluate |
| **ORDER_WAIT** | Milliseconds wait between checking if order got processed |
| **ORDER_INTERVALS** | Numbers of times to check order status before cancelling it |
| **PORT** | REST API Port |
| **APP_NAME** | Name of REST API App |
| **TELEGRAM_ENABLE** | Whether to enable Telegram or not (1: yes, 0: no) |
| **TELEGRAM_API** | Telegram Bot API Key |
| **TELEGRAM_CHAT** | Chat ID of Telegram chat, to announce to |
| **TELEGRAM_ALLOW** | Comma separated list of users in the allow list |

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
var total=0, totalP=0;
db.getCollection('ledger').find({crypto: 'CAKE', PnL: {$exists:true}}).forEach(doc => {
    const d = new Date(doc.timestamp);
    const dstamp = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
    const amountPnL = doc.PnL.toFixed(2);
    const percPnL = (doc.PnL / doc.cost) * 100;
    total = total + doc.PnL;
    totalP = totalP + percPnL;
    print(`${doc.crypto}/${doc.base}\t${dstamp}\t$${amountPnL}\t${percPnL.toFixed(2)}%\t$${total.toFixed(2)}\t${totalP.toFixed(2)}%`);
});
```