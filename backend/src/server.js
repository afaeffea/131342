require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const multer = require('multer');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-secret';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

// ========================
// Multer configuration
// ========================
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.rtf', '.odt', '.ods',
  '.zip', '.rar', '.7z',
  '.mp3', '.mp4', '.wav',
  '.json', '.xml',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024;   // 20 MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;  // 50 MB per request
const MAX_FILE_COUNT = 10;

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const userId = req.session.userId;
    const now = new Date();
    const subDir = `${userId}/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dest = path.join(UPLOADS_ROOT, subDir);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = crypto.randomUUID() + ext;
    cb(null, safeName);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`Тип файла ${ext} не поддерживается`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILE_COUNT },
});

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'FILE_TOO_LARGE', message: `Максимальный размер файла: ${MAX_FILE_SIZE / 1024 / 1024}MB` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'TOO_MANY_FILES', message: `Максимум ${MAX_FILE_COUNT} файлов за раз` });
    }
    return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
  }
  if (err && err.message) {
    return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
  }
  next(err);
}

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

// Static frontend — serve React build (prod) with legacy fallback
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
const legacyDir = path.join(__dirname, '..', '..', 'frontend', 'public');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}
app.use(express.static(legacyDir));

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

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Пользователь не найден' });
    }
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
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
    await db.deleteConversation(conversationId);
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
// Attachment endpoints
// ========================

app.post('/api/uploads', requireAuth, upload.array('files', MAX_FILE_COUNT), handleMulterError, async (req, res) => {
  try {
    const userId = req.session.userId;
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'NO_FILES', message: 'Файлы не выбраны' });
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(413).json({ error: 'TOTAL_SIZE_EXCEEDED', message: `Общий размер файлов превышает ${MAX_TOTAL_SIZE / 1024 / 1024}MB` });
    }

    const results = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const storedName = path.relative(UPLOADS_ROOT, file.path);
      const att = await db.createAttachment(userId, file.originalname, storedName, file.mimetype, file.size, ext);
      results.push({
        id: att.id,
        original_name: att.original_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        url: `/api/attachments/${att.id}`,
      });
    }

    res.json({ attachments: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

app.get('/api/attachments/:id', requireAuth, async (req, res) => {
  try {
    const attachmentId = req.params.id;
    const userId = req.session.userId;

    await db.assertAttachmentOwner(attachmentId, userId);
    const att = await db.getAttachmentById(attachmentId);
    if (!att) {
      return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
    }

    const filePath = path.join(UPLOADS_ROOT, att.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'FILE_NOT_FOUND', message: 'Файл не найден на диске' });
    }

    const isInline = att.mime_type && (att.mime_type.startsWith('image/') || att.mime_type === 'application/pdf');
    const forceDownload = req.query.download === '1';
    const disposition = (isInline && !forceDownload) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(att.original_name)}"`);
    res.setHeader('Content-Length', att.size_bytes);

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND', message: 'Файл не найден или нет доступа' });
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

app.post('/api/chat', requireAuth, upload.array('files', MAX_FILE_COUNT), handleMulterError, async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL_NOT_CONFIGURED' });
  }

  const message = req.body.message;
  const conversationId = req.body.conversationId;
  const files = req.files || [];

  if ((!message || typeof message !== 'string' || !message.trim()) && files.length === 0) {
    return res.status(400).json({ error: 'MESSAGE_REQUIRED', message: 'Текст сообщения или файлы обязательны' });
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

    const messageText = (message || '').trim() || (files.length > 0 ? `[${files.length} файл(ов)]` : '');

    const userMsg = await db.addMessage(convId, userId, 'user', messageText);

    const savedAttachments = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const storedName = path.relative(UPLOADS_ROOT, file.path);
      const att = await db.createAttachment(userId, file.originalname, storedName, file.mimetype, file.size, ext);
      await db.linkAttachmentsToMessage(userMsg.id, [att.id]);
      savedAttachments.push({
        id: att.id,
        original_name: att.original_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        url: `/api/attachments/${att.id}`,
      });
    }

    const history = await db.getHistoryByConversation(convId, 20);

    const n8nAttachments = [];
    for (const att of savedAttachments) {
      const entry = {
        name: att.original_name,
        type: att.mime_type,
        size: att.size_bytes,
      };

      if (att.mime_type && att.mime_type.startsWith('image/')) {
        const dbAtt = await db.getAttachmentById(att.id);
        if (dbAtt) {
          const filePath = path.join(UPLOADS_ROOT, dbAtt.stored_name);
          if (fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            entry.base64 = `data:${att.mime_type};base64,${buf.toString('base64')}`;
          }
        }
      }

      n8nAttachments.push(entry);
    }

    const n8nPayload = {
      message: messageText,
      userId,
      conversationId: convId,
      history,
    };
    if (n8nAttachments.length > 0) {
      n8nPayload.attachments = n8nAttachments;
    }

    const n8nResponse = await axios.post(N8N_WEBHOOK_URL, n8nPayload, {
      timeout: 120_000,
      maxBodyLength: 100 * 1024 * 1024,
    });

    let reply;
    if (n8nResponse.data && typeof n8nResponse.data === 'object') {
      reply = n8nResponse.data.reply || n8nResponse.data.text || JSON.stringify(n8nResponse.data);
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
      const autoTitle = messageText.substring(0, 60);
      await db.setConversationTitle(convId, autoTitle);
    }

    res.json({
      reply,
      userMessage: {
        id: userMsg.id,
        role: 'user',
        content: messageText,
        attachments: savedAttachments,
      },
    });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND', message: 'Диалог не найден или у вас нет доступа' });
    }
    console.error(err.response?.data || err.message || err);
    res.status(500).json({ error: 'N8N_REQUEST_FAILED' });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  const distIndex = path.join(distDir, 'index.html');
  const legacyIndex = path.join(legacyDir, 'index.html');
  const fallback = fs.existsSync(distIndex) ? distIndex : legacyIndex;
  res.sendFile(fallback);
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
  console.log(`🚀 Server is running on port ${PORT}`);
});
