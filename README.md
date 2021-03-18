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
      DB_URI: 'mongodb://user:password@localhost:27017/dev_botdb',
      PRICE_URL: 'https://www.binance.com/api/v3',
    },
    env_prd: {
      NODE_ENV: 'prd',
      API_KEY: 'secretapikey',
      API_SECRET: 'secretsauce',
      DB_HOST: 'freya',
      DB_NAME: 'botdb',
      DB_URI: 'mongodb://user:password@localhost:27017/botdb',
      PRICE_URL: 'https://www.binance.com/api/v3',
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