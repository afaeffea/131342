## Юридический чат-бот с n8n под капотом

Простой full-stack пример: frontend с интерфейсом чата в стиле LLM, backend на Node.js/Express, авторизация по логину/паролю, хранение пользователей и сообщений в SQLite, проксирование запросов в n8n webhook.

### Стек

- **Backend**: Node.js, Express, better-sqlite3, express-session, connect-sqlite3, axios
- **Frontend**: Чистый HTML/CSS/JS (без фреймворков)
- **База**: SQLite (файловая), автоматическое создание таблиц

### Структура проекта

- `package.json` — зависимости и скрипты
- `backend/src/server.js` — HTTP-сервер, API, авторизация, чат
- `backend/src/db.js` — инициализация SQLite и таблиц (`users`, `messages`)
- `frontend/public/index.html` — UI логина/регистрации и чата
- `frontend/public/styles.css` — стили (чат как у LLM)
- `frontend/public/app.js` — фронтенд-логика работы с API
- `.env.example` — пример конфигурации окружения

### Установка

1. Установите зависимости:

   ```bash
   cd /Users/vadimcybikov/Downloads/2
   npm install
   ```

2. Создайте файл `.env` на основе `.env.example`:

   ```bash
   cp .env.example .env
   ```

3. В `.env` укажите:

   - `SESSION_SECRET` — любая достаточно длинная случайная строка
   - `N8N_WEBHOOK_URL` — URL вашего n8n webhook, который обрабатывает сообщения

### Ожидаемый формат ответа от n8n

Backend отправляет на `N8N_WEBHOOK_URL` JSON:

```json
{
  "message": "Текст вопроса пользователя",
  "userId": 1,
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Ожидается, что n8n вернёт одно из:

- `{ "reply": "Текст ответа ассистента" }`
- `{ "text": "Текст ответа ассистента" }`
- или любой JSON / текст, который будет преобразован в строку

### Запуск

В режиме разработки:

```bash
npm run dev
```

Или в "продакшен"-режиме:

```bash
npm start
```

По умолчанию сервер стартует на `http://localhost:3000`.

### Как это работает

- При первом запуске автоматически создаются таблицы:
  - `users (id, email, password_hash, created_at)`
  - `messages (id, user_id, role, content, created_at)`
- Сессии хранятся в отдельном SQLite-файле через `connect-sqlite3`.
- Хэши паролей создаются через `bcryptjs`.

### Основные API-эндпоинты

- `POST /api/register` — регистрация (`{ email, password }`)
- `POST /api/login` — вход (`{ email, password }`)
- `POST /api/logout` — выход, уничтожение сессии
- `GET /api/session` — проверить, авторизован ли пользователь
- `GET /api/messages` — последние сообщения текущего пользователя
- `POST /api/chat` — отправка сообщения в чат (под капотом запрос в n8n webhook)

### UI

Фронтенд — одна страница:

- В неавторизованном состоянии показывается карточка **Вход / Регистрация**.
- После входа отображается:
  - **чат в стиле LLM** (баблы слева/справа, сохранение истории),
  - кнопка **"Новый диалог"** (очищает текущий чат на фронте),
  - боковая панель с подсказками.

Frontend всегда обращается к backend по относительным путям `/api/...`, поэтому при деплое достаточно проксировать всё через один домен.

