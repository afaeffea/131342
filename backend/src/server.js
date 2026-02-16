require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
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
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(
  session({
    // Для MVP используем in-memory store (подходит для одного инстанса / dev)
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Static frontend
app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
}

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = db.createUser(email, passwordHash);

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({ id: user.id, email: user.email });
  } catch (err) {
    if (err.code === 'EMAIL_ALREADY_EXISTS') {
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

    const user = db.findUserByEmail(email);
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

// Get last messages for current user
app.get('/api/messages', requireAuth, (req, res) => {
  try {
    const messages = db.getMessagesByUser(req.session.userId, 100);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Chat endpoint: proxy to n8n webhook
app.post('/api/chat', requireAuth, async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL_NOT_CONFIGURED' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
  }

  try {
    // Save user message
    const userId = req.session.userId;
    db.addMessage(userId, 'user', message);

    // Fetch short history (optional, you can pass to n8n)
    const history = db.getHistory(userId, 10);

    // Call n8n webhook
    const n8nResponse = await axios.post(
      N8N_WEBHOOK_URL,
      {
        message,
        userId,
        history,
      },
      {
        timeout: 60_000,
      }
    );

    // Assume n8n returns { reply: "..." } or plain text
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

    // Save assistant message
    db.addMessage(userId, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error(err.response?.data || err.message || err);
    res.status(500).json({ error: 'N8N_REQUEST_FAILED' });
  }
});

// Fallback to index.html for SPA-like routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

