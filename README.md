## Юридический чат-бот с n8n под капотом

Full-stack приложение: React-фронтенд с интерфейсом чата в стиле ChatGPT, backend на Node.js/Express, авторизация по логину/паролю, хранение пользователей, сессий и истории чатов в PostgreSQL, проксирование запросов в n8n webhook.

### Стек

- **Backend**: Node.js, Express, PostgreSQL, express-session, connect-pg-simple, axios
- **Frontend**: React 18 + Vite (без UI-библиотек, чистый CSS)
- **База данных**: PostgreSQL

### Структура проекта

- `package.json` — зависимости backend и скрипты
- `backend/src/server.js` — HTTP-сервер, API, авторизация, чат
- `backend/src/db.js` — подключение к PostgreSQL, инициализация схемы, CRUD операции
- `backend/src/migrations/001_init_schema.sql` — базовая SQL миграция
- `backend/src/migrations/002_conversations.sql` — миграция: добавление диалогов (conversations)
- `frontend/package.json` — зависимости фронтенда (React, Vite)
- `frontend/vite.config.js` — конфиг Vite с proxy на backend
- `frontend/src/` — React-компоненты, стили, API-клиент
- `frontend/legacy/` — старый vanilla JS фронтенд (не используется)
- `.env.example` — пример конфигурации окружения

### Установка

1. Установите зависимости backend:

```bash
npm install
```

2. Установите зависимости frontend:

```bash
cd frontend && npm install
```

3. Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

4. В `.env` укажите данные PostgreSQL и n8n webhook URL.

### Подключение к PostgreSQL

Поддерживаются два варианта:

- **DATABASE_URL** (Railway, Render, и т.д.) — `DATABASE_URL=postgresql://user:pass@host:5432/dbname`
- **Отдельные переменные** — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Запуск (разработка)

Нужно два терминала:

**Терминал 1 — backend:**

```bash
npm run dev
```

**Терминал 2 — frontend (Vite dev server):**

```bash
cd frontend && npm run dev
```

Фронтенд будет доступен на `http://localhost:5173`, все `/api` запросы проксируются на backend (порт 3000).

### Запуск (production)

1. Соберите React-фронтенд:

```bash
cd frontend && npm run build
```

2. Запустите сервер:

```bash
npm start
```

Backend раздаёт собранные файлы из `frontend/dist` и обрабатывает SPA-роутинг.

### Миграции

При первом запуске автоматически создадутся таблицы: `users`, `conversations`, `messages`, `user_sessions`.

Если обновляете существующую базу (уже есть `messages` без `conversation_id`):

```bash
psql -U postgres -d lawyer_chatbot -f backend/src/migrations/002_conversations.sql
```

Миграция безопасна и идемпотентна. Старые данные не теряются.

### API-эндпоинты

**Авторизация:**
- `POST /api/register` — регистрация
- `POST /api/login` — вход
- `POST /api/logout` — выход
- `GET /api/session` — статус сессии
- `GET /api/me` — текущий пользователь (401 если не авторизован)

**Диалоги:**
- `POST /api/conversations` — создать диалог
- `GET /api/conversations` — список диалогов
- `GET /api/conversations/:id/messages` — сообщения диалога
- `PATCH /api/conversations/:id` — переименовать
- `DELETE /api/conversations/:id` — архивировать

**Чат:**
- `POST /api/chat` — `{ message, conversationId }` → `{ reply }`

### Деплой на Railway

1. Создайте проект на [railway.app](https://railway.app)
2. Добавьте сервис **PostgreSQL**
3. Добавьте сервис из GitHub-репозитория
4. Railway автоматически подставит `DATABASE_URL`
5. Добавьте переменные окружения: `SESSION_SECRET`, `N8N_WEBHOOK_URL`, `NODE_ENV=production`
6. Перед деплоем соберите фронтенд: `cd frontend && npm run build`
7. Деплой произойдёт автоматически

### Формат n8n payload

```json
{
  "message": "Текст вопроса",
  "userId": 1,
  "conversationId": 42,
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```
