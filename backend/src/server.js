require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-secret';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

// Middlewares
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// TODO: In production, replace origin: true with a specific allowed origin list
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.set('trust proxy', 1);

app.use(
  session({
    store: new pgSession({
      pool: db.pool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
);

// Static frontend
app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Требуется авторизация' });
  }
  next();
}

// ========================
// Auth routes
// ========================

app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser(email, passwordHash);

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  if (!req.session.userId) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    user: { id: req.session.userId, email: req.session.email },
  });
});

// ========================
// Conversation routes
// ========================

app.post('/api/conversations', requireAuth, async (req, res) => {
  try {
    const { title } = req.body || {};
    const conversation = await db.createConversation(req.session.userId, title || null);
    res.json({ conversationId: conversation.id, conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await db.listConversations(req.session.userId);
    res.json({ conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'INVALID_CONVERSATION_ID' });
    }

    await db.assertConversationOwner(conversationId, req.session.userId);
    const messages = await db.getConversationMessages(conversationId);
    res.json({ messages });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Диалог не найден или у вас нет доступа' });
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.patch('/api/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'INVALID_CONVERSATION_ID' });
    }

    await db.assertConversationOwner(conversationId, req.session.userId);

    const { title } = req.body;
    if (title === undefined) {
      return res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Поле title обязательно' });
    }

    const updated = await db.renameConversation(conversationId, title);
    res.json({ conversation: updated });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Диалог не найден или у вас нет доступа' });
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'INVALID_CONVERSATION_ID' });
    }

    await db.assertConversationOwner(conversationId, req.session.userId);
    await db.archiveConversation(conversationId);
    res.json({ ok: true });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Диалог не найден или у вас нет доступа' });
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ========================
// Chat endpoint
// ========================

app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const messages = await db.getMessagesByUser(req.session.userId, 100);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL_NOT_CONFIGURED' });
  }

  const { message, conversationId } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'MESSAGE_REQUIRED', message: 'Текст сообщения обязателен' });
  }
  if (!conversationId) {
    return res.status(400).json({ error: 'CONVERSATION_ID_REQUIRED', message: 'conversationId обязателен' });
  }

  const convId = parseInt(conversationId);
  if (isNaN(convId)) {
    return res.status(400).json({ error: 'INVALID_CONVERSATION_ID' });
  }

  try {
    const userId = req.session.userId;
    await db.assertConversationOwner(convId, userId);

    await db.addMessage(convId, userId, 'user', message);

    const history = await db.getHistoryByConversation(convId, 20);

    const n8nResponse = await axios.post(
      N8N_WEBHOOK_URL,
      { message, userId, conversationId: convId, history },
      { timeout: 60_000 }
    );

    let reply;
    if (n8nResponse.data && typeof n8nResponse.data === 'object') {
      reply =
        n8nResponse.data.reply ||
        n8nResponse.data.text ||
        JSON.stringify(n8nResponse.data);
    } else {
      reply = String(n8nResponse.data ?? '');
    }

    if (!reply) {
      reply = 'Пустой ответ от n8n.';
    }

    await db.addMessage(convId, userId, 'assistant', reply);
    await db.updateConversationTimestamp(convId);

    const conv = await db.getConversationById(convId);
    if (conv && !conv.title) {
      const autoTitle = message.substring(0, 60);
      await db.setConversationTitle(convId, autoTitle);
    }

    res.json({ reply });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Диалог не найден или у вас нет доступа' });
    }
    console.error(err.response?.data || err.message || err);
    res.status(500).json({ error: 'N8N_REQUEST_FAILED' });
  }
});

// Fallback to index.html for SPA-like routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await db.closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  await db.closePool();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL ? '(Railway)' : process.env.DB_NAME || 'lawyer_chatbot'}`);
});
