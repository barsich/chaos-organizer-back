const http = require('http');
const Koa = require('koa');
const serve = require('koa-static');
const path = require('path');
const cors = require('@koa/cors');
const Router = require('koa-router');
const WS = require('ws');
const fs = require('fs');
const txtgen = require('txtgen');
const { v4: uuidv4 } = require('uuid');

const app = new Koa();
const router = new Router();

const users = [
  {
    name: 'demo',
    messages: [],
  },
];

const botCommands = {
  coin: ['Орел!', 'Решка!'],
  pic: 'https://picsum.photos/400/300',
  video: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  gif: [
    'https://media0.giphy.com/media/LLWP1seiT4fC/giphy.gif',
    'https://media4.giphy.com/media/gePUWJ4AXHu92/giphy.gif',
    'https://media0.giphy.com/media/10JhviFuU2gWD6/giphy.gif',
    'https://media1.giphy.com/media/1d7F9xyq6j7C1ojbC5/giphy.gif',
    'https://media3.giphy.com/media/eBQqrM0MCGJhu/giphy.gif',
    'https://media2.giphy.com/media/xTiN0CNHgoRf1Ha7CM/giphy.gif',
  ],
  '8ball': [
    'Бесспорно',
    'Предрешено',
    'Никаких сомнений',
    'Определённо да',
    'Можешь быть уверен в этом',
    'Мне кажется — «да»',
    'Вероятнее всего',
    'Хорошие перспективы',
    'Знаки говорят — «да»',
    'Да',
    'Пока не ясно, попробуй снова',
    'Спроси позже',
    'Лучше не рассказывать',
    'Сейчас нельзя предсказать',
    'Сконцентрируйся и спроси опять',
    'Даже не думай',
    'Мой ответ — «нет»',
    'По моим данным — «нет»',
    'Перспективы не очень хорошие',
    'Весьма сомнительно',
  ],
};

(() => {
  const user = users.find((user) => user.name === 'demo');
  let date = Date.now();
  for (let i = 1; i <= 30; i++) {
    const text = txtgen.paragraph();
    user.messages.push({
      id: uuidv4(),
      date,
      tag: 'p',
      value: `№${i}: ${text}`,
      types: ['text'],
      starred: false,
      pinned: false,
    });
    date -= 2200000;
  }
  user.messages.reverse();
})();

const corsOptions = {
  origin: '*',
};

app.use(serve(path.join(__dirname, '/uploads')));

app.use(cors(corsOptions));

app.use(router.routes()).use(router.allowedMethods());

router.get('/download/:type/:filename', (ctx) => {
  const filename = ctx.params.filename;
  const type = ctx.params.type;
  const filepath = path.join(path.join(__dirname, '/uploads'), type, filename);
  const readStream = fs.readFileSync(filepath);
  ctx.response.body = readStream;
});

const port = process.env.PORT || 7070;
const server = http.createServer(app.callback());
const wsServer = new WS.Server({ server });

wsServer.on('connection', (ws) => {
  ws.on('message', (message) => {
    const eventMessage = JSON.parse(message);
    let user = users.find((user) => user.name === eventMessage.data.user);

    if (eventMessage.action === 'login') {
      if (!user) {
        user = { name: eventMessage.data.user, messages: [] };
        users.push(user);
      }

      ws.send(
        JSON.stringify({
          action: 'login',
          status: true,
          user,
        })
      );

      // отдельная отправка прикрепленного сообщения, если оно есть
      const pinned = user.messages.find((message) => message.pinned);
      if (pinned) {
        ws.send(JSON.stringify({ action: 'pin', status: true, message: pinned }));
      }
    } else if (eventMessage.action === 'reconnect') {
      ws.send(
        JSON.stringify({
          action: 'reconnect',
          status: true,
        })
      );
    } else if (eventMessage.action === 'message') {
      const { text, types } = eventMessage.data;
      const message = {
        id: uuidv4(),
        date: Date.now(),
        tag: 'p',
        value: text,
        types,
        starred: false,
        pinned: false,
      };
      user.messages.push(message);

      ws.send(JSON.stringify({ action: 'message', status: true, message }));

      // bot replies
      const isCommand = /^(@chaos: )/.test(text);
      if (isCommand) {
        const command = text
          .replace(/^(@chaos: )/, '')
          .split(' ')[0]
          .trim();

        let value = '';
        let tag = 'p';
        let link = '';

        if (command === 'help') {
          value = `Комманды бота:
          coin – подросить монетку,
          pic – случайная картинка,
          video – замечательное видео,
          gif – (почти) случайная гифка,
          8ball – задать вопрос магическому шару.`;
        } else if (command === 'coin') {
          const random = Math.floor(Math.random() * botCommands.coin.length);
          value = botCommands.coin[random];
        } else if (command === 'pic') {
          tag = 'img';
          link = botCommands.pic;
        } else if (command === 'video') {
          tag = 'video';
          link = botCommands.video;
        } else if (command === 'gif') {
          const random = Math.floor(Math.random() * botCommands.gif.length);
          tag = 'image';
          link = botCommands.gif[random];
        } else if (command === '8ball') {
          const random = Math.floor(Math.random() * botCommands['8ball'].length);
          value = botCommands['8ball'][random];
        }
        const message = {
          id: uuidv4(),
          date: Date.now(),
          tag,
          value,
          link,
          isBot: true,
        };
        user.messages.push(message);
        ws.send(JSON.stringify({ action: 'botMessage', status: true, message }));
      }
    } else if (eventMessage.action === 'search') {
      const { phrase } = eventMessage.data;
      const regex = new RegExp(phrase);
      const findedMessages = [];
      user.messages.forEach((message) => {
        if (regex.test(message.value)) {
          findedMessages.push(message);
        }
      });
      ws.send(JSON.stringify({ action: 'search', status: true, message: findedMessages }));
    } else if (eventMessage.action === 'file') {
      const { file, type, extension } = eventMessage.data;

      const typeArr = type.split('/');
      const regexp = new RegExp(`^data:${typeArr[0]}\/${typeArr[1]};base64,`);
      const data = file.replace(regexp, '');

      let fileMessage;
      const fileName = `${user.name}-${Date.now()}.${extension}`;

      if (typeArr[0] === 'audio' || typeArr[0] === 'image' || typeArr[0] === 'video') {
        // сохранение картинок, аудио, видео
        fs.writeFile(`./uploads/${typeArr[0]}s/${fileName}`, data, 'base64', function (err) {
          if (err) {
            console.log('error: ', err);
          } else {
            console.log('done');
          }
        });
        fileMessage = {
          id: uuidv4(),
          date: Date.now(),
          tag: `${typeArr[0]}`,
          value: '',
          types: [typeArr[0]],
          link: `${typeArr[0]}s/${fileName}`,
          starred: false,
          pinned: false,
        };
      } else {
        // сохранение остальных типов файлов
        fs.writeFile(`./uploads/files/${fileName}`, data, 'base64', function (err) {
          if (err) {
            console.log('error: ', err);
          } else {
            console.log('done');
          }
        });
        fileMessage = {
          id: uuidv4(),
          date: Date.now(),
          tag: 'p',
          value: '',
          types: ['file'],
          link: `${typeArr[0]}s/${fileName}`,
          starred: false,
          pinned: false,
        };
      }
      user.messages.push(fileMessage);
      ws.send(JSON.stringify({ action: 'message', status: true, message: fileMessage }));
    } else if (eventMessage.action === 'star') {
      const message = user.messages.find((message) => message.id === eventMessage.data.id);
      message.starred = !message.starred;
      ws.send(JSON.stringify({ action: 'star', status: true, message }));
    } else if (eventMessage.action === 'pin') {
      user.messages = user.messages.map((message) => {
        if (message.id === eventMessage.data.id && !message.pinned) {
          return { ...message, pinned: true };
        }
        return { ...message, pinned: false };
      });
      const message = user.messages.find((message) => message.id === eventMessage.data.id);
      ws.send(JSON.stringify({ action: 'pin', status: true, message }));
    }
  });
});

server.listen(port);
