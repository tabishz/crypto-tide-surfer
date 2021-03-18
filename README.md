# Crypto Tide Surfer

## PM2 Config
For environment variables. Sample ecosystem.config.js

```js
module.exports = {
  apps : [{
    name: 'myBot',
    script: 'index.js',
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
      DB_URI: 'mongodb://localhost/?poolSize=7',
      PRICE_URL: 'https://www.binance.com/api/v3',
    },
    env_prd: {
      NODE_ENV: 'prd',
      API_KEY: 'secretapikey',
      API_SECRET: 'secretsauce',
      DB_HOST: 'freya',
      DB_NAME: 'botdb',
      DB_URI: 'mongodb://localhost/?poolSize=7',
      PRICE_URL: 'https://www.binance.com/api/v3',
    }
  }],
};
```