const config = require('../config');
const TG = require('telegram-bot-api');

if (!config.telegram.token) {
  console.error('Opps, you need to define your BOT TOKEN');
}
if (config.telegram.enabled) {
  const telegram = new TG({
    token: config.telegram.token,
  });
  
  telegram.setMessageProvider(new TG.GetUpdateMessageProvider());
  telegram
    .start()
    .then(() => {
      console.log('Telegram BOT API is started.');
    })
    .catch(console.err);
  
  telegram.getMe().then(console.log).catch(console.err);
  
  const message = {
    reply: async function (received, crypto) {
      const user = received.from.username;
      const chatId = received.chat.id;
      const args = received.text.split(' ');
      if (this.authenticate(user)) {
        switch (args[0].toLowerCase()) {
          case 'sup':
            let additional;
            if (crypto.mode === 'buy' || crypto.mode === 'start') {
              additional = `| change: ${crypto.change}, overallChange: ${crypto.overallChange}`;
            }
            if (crypto.mode === 'sell') {
              additional = `| purchase price: ${crypto.purchasePrice.toFixed(4)} | `+
                `StopLoss @ ${crypto.stopLossPrice.toFixed(4)} ${crypto.base}`;
            }
            this.send(chatId, `Current Price of ${crypto.crypto} is ${crypto.currentPrice}`+
              `${crypto.base} (mode: ${crypto.mode}) ${additional}`);
            break;
          case 'update':
            if (args[1] == 'crypto' && crypto.mode == 'sell') {
              this.send(chatId, `Currency \*${crypto.crypto}* is locked right now `+
                `(mode: ${crypto.mode}).`);
            } else if (args[1] == 'base' && crypto.mode == 'sell') {
              this.send(chatId, `Base \*${crypto.base}* is locked right now `+
                `(mode: ${crypto.mode}).`);
            } else {
              await crypto.updateEnv(args[1], args[2]);
              this.send(chatId, `Updating \*${args[1]}*: ${args[2]} in the environment.`);
            }
            break;
          default:
            this.send(
              chatId,
              `I got your message \*${received.from.first_name}*, but I got nothing to say.`
            );
        }
      } else {
        this.send(
          chatId,
          `I got your message \*${received.from.first_name}*, but I don't recognize you.`
        );
      }
      return;
    },
    authenticate: function (sender) {
      if (config.telegram.allowed.includes(sender)) return true;
      return false;
    },
    send: function (chatId, text) {
      telegram.sendMessage({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      });
    },
  };
  
  module.exports = {
    telegram,
    message,
  };
} else {
  // When telegram is disabled
  const message = {
    send: function () { return false; },
    reply: function () { return false; },
  }
  const telegram = {
    getMe: function () { return false; },
    on: function () { return false; },
  }
  module.exports = { telegram, message, }
}
