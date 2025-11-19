const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const REG_FILE = path.join(__dirname, 'registrations.csv');

// Проверяем, что файл существует, иначе создаём с заголовками
function ensureRegFile() {
  if (!fs.existsSync(REG_FILE)) {
    const header = 'Timestamp;TelegramID;Username;INN;FIO;Phone;Email;Consent\n';
    fs.writeFileSync(REG_FILE, header, 'utf8');
  }
}

ensureRegFile();


function isAlreadyRegistered(phone) {
  return new Promise((resolve, reject) => {
    fs.readFile(REG_FILE, 'utf8', (err, data) => {
      if (err) return reject(err);

      const lines = data.split('\n').filter(Boolean);

      // пропускаем заголовок (первая строка)
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';');
        const rowPhone = (cols[5] || '').trim(); // колонка Phone

        if (rowPhone === phone) {
          return resolve(true);
        }
      }

      resolve(false);
    });
  });
}

function appendRegistrationRow({ telegramId, username, inn, fio, phone, email, consent }) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const line = [
      now,
      String(telegramId),
      username || '',
      inn,
      fio,
      phone,
      email,
      consent || ''
    ].join(';') + '\n';

    fs.appendFile(REG_FILE, line, 'utf8', (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}



// ⬇⬇⬇  токен бота от BotFather
const BOT_TOKEN = '8502274335:AAFUCT5ntVys8dRqjKgLf9k_0LFDYUpSopo';

if (!BOT_TOKEN) {
  console.error('Нет токена бота. Проверь BOT_TOKEN.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Чтобы отслеживать, на каком шаге находится пользователь
const userStates = {};

// Список администраторов (пока пустой, потом заполним)
const ADMINS = [65306522, 411253861, 812556475];

// Проверка прав администратора
function isAdmin(ctx) {
  return ADMINS.includes(ctx.from.id);
}



//меню
async function showMainMenu(ctx) {
  const isAdminUser = isAdmin(ctx);

  const buttons = [
    ['📝 Пройти регистрацию'],
    ['📋 Программа конференции'],
  ];

  if (isAdminUser) {
    buttons.push(['⚙ Админ-панель']);
  }

  await ctx.reply(
    'Выберите действие:',
    Markup.keyboard(buttons).resize().oneTime(false)
  );
}

//панель админов
async function showAdminPanel(ctx) {
  if (!isAdmin(ctx)) {
    return ctx.reply('У вас нет прав администратора.');
  }

  await ctx.reply(
    'Панель администратора:\n\n' +
    '• 📂 Экспорт регистраций — отправлю CSV-файл\n' +
    '• 📣 Рассылка — подскажу, как отправить сообщение всем участникам',
    Markup.inlineKeyboard([
      [Markup.button.callback('📂 Экспорт CSV', 'admin_export')],
      [Markup.button.callback('📣 Как сделать рассылку', 'admin_notify_help')],
    ])
  );
}


// Удаляет кнопки, когда пользователь нажимает gitinline-кнопку
async function clearInlineButtons(ctx) {
  try {
    await ctx.answerCbQuery();
  } catch (e) {
    // иногда Telegram уже ответил — игнорируем
  }

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (e) {
    // если нельзя убрать кнопки — не страшно
  }
}

// Программа конференции
async function sendProgram(ctx) {
  const text =
    '<b>📋 Программа конференции «Производительность у моря»</b>\n\n' +
    '<b>10:00–10:30</b> — Регистрация участников.\n' +
    '<b>10:30–11:00</b> — Торжественное открытие.\n\n' +
    '<b>11:00–13:00 — Пленарная сессия</b>\n' +
    '• Итоги национального проекта\n' +
    '• Задачи федерального проекта\n' +
    '• Меры поддержки предприятий\n' +
    '• Выступления участников проекта\n' +
    '• Награждение\n\n' +
    '<b>13:00–14:00</b> — Кофе-брейк и экскурсия по центру.\n\n' +
    '<b>14:00–17:30 — Деловая программа</b>\n' +
    '<u>Большой зал:</u>\n' +
    '• Круглый стол с экспертами\n' +
    '• Лекция: «Влияние инструментов БП»\n' +
    '• Практикум: «Решение проблем»\n\n' +
    '<u>Малый зал:</u>\n' +
    '• Лекция: «Система обучения БП»\n' +
    '• Лекция: «Матрица компетенций»';

  // Отправка текста
  await ctx.reply(text, { parse_mode: 'HTML' });

  // PDF (если нужен)
  await ctx.replyWithDocument({ source: 'plan.pdf' });

  // Кнопка регистрации
  await ctx.reply(
    'Если вы готовы зарегистрироваться на конференцию — нажмите кнопку ниже:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📝 Пройти регистрацию', 'register')],
    ])
  );
}

//функция начала регистрации
async function startRegistration(ctx) {
  const userId = ctx.from.id;
  await clearInlineButtons(ctx);

  userStates[userId] = {
    step: 'consent',
    data: {}
  };

    await ctx.reply(
    'Для регистрации на конференцию «Производительность у моря» ' +
    'понадобятся ИНН компании, ФИО представителя, номер телефона и адрес электронной почты.\n\n' +
    'Нажимая «Согласен», вы подтверждаете, что даёте согласие на обработку этих персональных данных ' +
    'организаторами конференции исключительно в целях организации и проведения мероприятия ' +
    'в соответствии с <a href="https://xn--25-9kcqjffxnf3b.xn--p1ai/upload/medialibrary/b9c/uglrk8d92ec86zq6lcypwn5s15hdwfn5/Politika-konfidentsialnosti-personalnykh-dannykh-_Prilozhenie-1-k-prikazu-_91-ot-21.12.2023_na-sayt.pdf">Политикой конфиденциальности</a>.',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Согласен', callback_data: 'consent_yes' },
            { text: '❌ Не согласен', callback_data: 'consent_no' }
          ]
        ]
      }
    }
  );

}

//функция экспорта регистраций (для админов)
async function exportRegistrations(ctx) {
  console.log('Команда export от администратора:', ctx.from.id);

  await ctx.reply('Готовлю файл с регистрациями, пожалуйста подождите...');

  try {
    if (!fs.existsSync(REG_FILE)) {
      console.error('Файл регистраций не найден по пути:', REG_FILE);
      return ctx.reply('Файл с регистрациями пока не создан.');
    }

    await ctx.replyWithDocument({
      source: fs.createReadStream(REG_FILE),
      filename: 'registrations.csv',
    });

  } catch (e) {
    console.error('Ошибка при отправке файла регистраций:', e);
    await ctx.reply('Не удалось отправить файл с регистрациями. Сообщите разработчику.');
  }
}


// /start — приветствие + кнопки
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  delete userStates[userId];  // сбрасываем состояние регистрации

  // маленькая "анимация"
  await ctx.reply('Запускаю бота конференции…');
  await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
  await new Promise((resolve) => setTimeout(resolve, 600));

  await ctx.reply(
    'Добро пожаловать в бота конференции «Производительность у моря» 🌊\n\n' +
    'Здесь вы можете зарегистрироваться и посмотреть программу мероприятия.'
  );

  await showMainMenu(ctx);
});


// Начало регистрации
bot.action('register', async (ctx) => {
  await clearInlineButtons(ctx);  
  await startRegistration(ctx);
});


bot.action('consent_yes', async (ctx) => {
  await clearInlineButtons(ctx);

  const userId = ctx.from.id;
  const state = userStates[userId];

  if (!state || state.step !== 'consent') {
    return;
  }

  state.data.consent = 'yes_v1'; // фиксируем версию согласия
  state.step = 'inn';

  await ctx.reply(
    'Спасибо, согласие зафиксировано ✅\n\n' +
    'Введите ИНН вашей компании (10 или 12 цифр):',
    {
      reply_markup: { remove_keyboard: true }
    }
  );
});

bot.action('consent_no', async (ctx) => {
  await clearInlineButtons(ctx);

  const userId = ctx.from.id;
  const state = userStates[userId];

  if (state) {
    delete userStates[userId];
  }

  await ctx.reply(
    'Без согласия на обработку персональных данных я не могу провести регистрацию.\n\n' +
    'Если вы передумаете — нажмите кнопку ниже:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📝 Зарегистрироваться', 'register')],
      [Markup.button.callback('📋 Программа конференции', 'program')],
    ])
  );
});

bot.action('restart', async (ctx) => {
  await clearInlineButtons(ctx);

  const userId = ctx.from.id;
  delete userStates[userId]; // сброс состояния

  userStates[userId] = {
    step: 'consent',
    data: {}
  };

  await ctx.reply(
    'Давайте начнём регистрацию заново.\n\n' +
    'Для регистрации на конференцию «Производительность у моря» ' +
    'мне понадобятся ИНН компании, ФИО представителя, номер телефона и адрес электронной почты.\n\n' +
    'Нажимая «Согласен», вы подтверждаете, что даёте согласие на обработку этих персональных данных.',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Согласен', callback_data: 'consent_yes' },
            { text: '❌ Не согласен', callback_data: 'consent_no' }
          ]
        ]
      }
    }
  );
});


// Вызов программы мероприятия
bot.action('program', async (ctx) => {
  await clearInlineButtons(ctx);
  await sendProgram(ctx);
});

bot.action('admin_export', async (ctx) => {
  await clearInlineButtons(ctx);
  await exportRegistrations(ctx);
});

bot.action('admin_notify_help', async (ctx) => {
  await clearInlineButtons(ctx);
  await ctx.reply(
    'Чтобы сделать рассылку, отправьте команду в этот чат:\n\n' +
    '/notifyall Текст сообщения\n\n' +
    'Например:\n' +
    '/notifyall Напоминаем, что конференция начнётся 26.11 в 10:00, регистрация с 9:00.'
  );
});


//ХЕНДЛЕРЫ
bot.hears('📋 Программа конференции', async (ctx) => {
  await sendProgram(ctx);
});

bot.hears('📝 Пройти регистрацию', async (ctx) => {
  await startRegistration(ctx);
});



bot.command('export', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('У вас нет прав администратора.');
  }
  await exportRegistrations(ctx);
});


bot.command('notifyall', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('У вас нет прав администратора.');
  }

  const parts = ctx.message.text.split(' ');
  const messageText = parts.slice(1).join(' ').trim();

  if (!messageText) {
    return ctx.reply(
      'После команды нужно написать текст рассылки.\n\n' +
      'Например:\n' +
      '/notifyall Напоминаем, что форум «Производительность у моря» состоится 26.11.2025 в 10:00.'
    );
  }

  console.log('Команда /notifyall от администратора:', ctx.from.id);
  await ctx.reply('Начинаю рассылку, пожалуйста подождите...');

  let content;
  try {
    content = fs.readFileSync(REG_FILE, 'utf8');
  } catch (e) {
    console.error('Ошибка чтения файла регистраций:', e);
    return ctx.reply('Не удалось прочитать файл с регистрациями. Сообщите разработчику.');
  }

  const lines = content.trim().split('\n').slice(1); // пропускаем заголовок
  const chatIds = new Set();

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(';');
    const idStr = cols[1]; // TelegramID — второй столбец
    const idNum = Number(idStr);
    if (!Number.isNaN(idNum)) {
      chatIds.add(idNum);
    }
  }

  await ctx.reply(`Получателей в базе: ${chatIds.size}. Начинаю отправку.`);

  let success = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await ctx.telegram.sendMessage(chatId, messageText);
      success++;
    } catch (e) {
      failed++;
      console.error('Ошибка отправки сообщения пользователю', chatId, e.message);
    }
  }

  await ctx.reply(`Рассылка завершена ✅\nУспешно: ${success}\nОшибок: ${failed}`);
});

bot.command('program', async (ctx) => {
  await sendProgram(ctx);
});

//команды для админов
bot.command('admin', async (ctx) => {
  await showAdminPanel(ctx);
});

bot.hears('⚙ Админ-панель', async (ctx) => {
  await showAdminPanel(ctx);
});




// Обработка всех текстовых сообщений от пользователя (для регистрации)
bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim();

  // Команды (/start, /export, /notifyall и т.п.) — не трогаем
  if (text.startsWith('/')) {
    return;
  }

  const userId = ctx.from.id;
  const state = userStates[userId];

  // Если пользователь НЕ в процессе регистрации — тоже пропускаем дальше
  if (!state) {
    return;
  }




  // --- ШАГ 1: ИНН ---
  if (state.step === 'inn') {
    // Проверка ИНН на цифры и длину
    const innRegex = /^\d{10}(\d{2})?$/;

    if (!innRegex.test(text)) {
      return ctx.reply('ИНН должен содержать только цифры и быть длиной 10 или 12 символов. Попробуйте снова:');
    }

    state.data.inn = text;
    state.step = 'fio';

    return ctx.reply('Введите ФИО представителя (полностью):');
  }

// --- ШАГ 2: ФИО ---
if (state.step === 'fio') {
  if (text.length < 5) {
    return ctx.reply('ФИО выглядит слишком коротким. Введите, пожалуйста, полностью:');
  }

  state.data.fio = text;
  state.step = 'phone';

  return ctx.reply(
    'Теперь укажем контактный номер телефона.\n\n' +
    'Вы можете отправить свой номер из Telegram или ввести его вручную в формате +7XXXXXXXXXX:',
    {
      reply_markup: {
        keyboard: [
          [{ text: '📱 Отправить мой контакт', request_contact: true }],
          [{ text: '✏️ Ввести номер вручную' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );
}

// --- ШАГ 3: ТЕЛЕФОН  ---
if (state.step === 'phone') {
  // Если человек нажал "✏️ Ввести номер вручную"
  if (text === '✏️ Ввести номер вручную') {
    return ctx.reply('Введите номер телефона в формате +7XXXXXXXXXX:');
  }

  const phoneRegex = /^\+7\d{10}$/;

  // Если номер некорректный → ошибка + клавиатура
  if (!phoneRegex.test(text)) {
    return ctx.reply(
      'Номер должен быть в формате +7XXXXXXXXXX.\n' +
      'Попробуйте снова или нажмите «📱 Отправить мой контакт».',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📱 Отправить мой контакт', request_contact: true }],
            [{ text: '✏️ Ввести номер вручную' }]
          ],
          resize_keyboard: true
        }
      }
    );
  }

  // 💥 ВАЖНО: СРАЗУ ПРОВЕРЯЕМ ДУБЛИКАТ ПО ТЕЛЕФОНУ!
  const already = await isAlreadyRegistered(text);
if (already) {
  delete userStates[userId];

  await ctx.reply(
    'Похоже, участник с таким номером телефона уже зарегистрирован.\n' +
    'Повторная регистрация не требуется.',
    {
      reply_markup: { remove_keyboard: true }
    }
  );

  await ctx.reply(
    'Вы можете:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🔁 Начать сначала', 'restart')],
      [Markup.button.callback('📋 Программа мероприятия', 'program')]
    ])
  );

  return;
}




  // Если номер новый → сохраняем и идём дальше
  state.data.phone = text;
  state.step = 'email';

  await ctx.reply('Телефон сохранён ✅', {
    reply_markup: { remove_keyboard: true }
  });

  return ctx.reply('Теперь введите адрес электронной почты:');
}


  // --- ШАГ 4: EMAIL ---
  if (state.step === 'email') {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(text)) {
    return ctx.reply(
      'Похоже, адрес электронной почты указан некорректно.\n' +
      'Введите, пожалуйста, действующий email (например: example@mail.ru):'
    );
  }

  state.data.email = text.trim();

  const { inn, fio, phone, email } = state.data;

  try {
    // 1) проверяем, есть ли уже такой телефон в файле
    const already = await isAlreadyRegistered(phone);

    if (already) {
      await ctx.reply(
        'Похоже, участник с таким номером телефона уже зарегистрирован на конференцию.\n' +
        'Повторная регистрация не требуется.'
      );
      delete userStates[userId];
      return;
    }

    // 2) если нет — добавляем строку в CSV
    await appendRegistrationRow({
      telegramId: ctx.from.id,
      username: ctx.from.username || '',
      inn,
      fio,
      phone,
      email,
      consent: state.data.consent || 'yes_v1',
    });


    await ctx.reply('Спасибо! Ваша регистрация на конференцию принята ✅');

  } catch (err) {
    console.error('Ошибка при работе с файлом регистраций:', err);
    await ctx.reply(
      'Произошла техническая ошибка при сохранении данных.\n' +
      'Пожалуйста, попробуйте позже или свяжитесь с организаторами.'
    );
  }

  delete userStates[userId];
  return;
}




});


// Обработка отправки контакта (кнопка "📱 Отправить мой контакт")
bot.on('contact', async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates[userId];

  if (!state || state.step !== 'phone') {
    // Если пользователь не на шаге ввода телефона — игнорируем контакт
    return;
  }

  const contact = ctx.message.contact;

  if (!contact || !contact.phone_number) {
    return ctx.reply('Не удалось получить номер телефона. Попробуйте снова.');
  }

  let phone = contact.phone_number.trim().replace(/\D/g, '');

  if (phone.startsWith('8')) phone = '7' + phone.slice(1);
  if (!phone.startsWith('7')) {
    return ctx.reply('Пожалуйста, введите российский номер вручную (+7...).');
  }

  phone = '+7' + phone.slice(1);

  // 💥 Проверка дублей по номеру!
  const already = await isAlreadyRegistered(phone);
  if (already) {
    delete userStates[userId];

    await ctx.reply(
      'Похоже, участник с таким номером телефона уже зарегистрирован.\n' +
      'Повторная регистрация не требуется.',
      {
        reply_markup: { remove_keyboard: true }
      }
    );

    await ctx.reply(
      'Вы можете:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔁 Начать сначала', 'restart')],
        [Markup.button.callback('📋 Программа мероприятия', 'program')]
      ])
    );

    return;
  }

  // Если номера нет в базе → сохраняем
  state.data.phone = phone;
  state.step = 'email';

  await ctx.reply(`Телефон сохранён: ${phone} ✅`, {
    reply_markup: { remove_keyboard: true }
  });

  return ctx.reply('Теперь введите адрес электронной почты:');
});



// Запуск бота
bot.launch();
console.log('Бот запущен.');

// Аккуратная остановка по Ctrl+C и завершению процесса
process.once('SIGINT', () => {
  console.log('Остановка бота (SIGINT)...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('Остановка бота (SIGTERM)...');
  bot.stop('SIGTERM');
});

