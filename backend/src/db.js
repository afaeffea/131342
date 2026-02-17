const { Pool } = require('pg');

// Support Railway's DATABASE_URL or individual env vars
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'lawyer_chatbot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);
  process.exit(-1);
});

// Initialize database schema
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
        ON conversations(user_id, updated_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_active
        ON conversations(user_id, updated_at DESC) WHERE archived_at IS NULL;
    `);

    // Messages table — check if conversation_id column exists
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'conversation_id'
    `);

    if (colCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE
        );
      `);

      // If table existed before without conversation_id, add it
      const colCheck2 = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'conversation_id'
      `);
      if (colCheck2.rows.length === 0) {
        await client.query(`
          ALTER TABLE messages ADD COLUMN conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE;
        `);
      }
    }

    // Indexes for messages
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, id ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC);
    `);

    await client.query('COMMIT');
    console.log('✅ Database schema initialized');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to initialize schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

initSchema().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// ========================
// User functions
// ========================

async function createUser(email, passwordHash) {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash) 
     VALUES ($1, $2) 
     RETURNING id, email, created_at`,
    [email, passwordHash]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    'SELECT id, email, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

// ========================
// Conversation functions
// ========================

async function createConversation(userId, title) {
  const result = await pool.query(
    `INSERT INTO conversations (user_id, title)
     VALUES ($1, $2)
     RETURNING id, user_id, title, created_at, updated_at`,
    [userId, title || null]
  );
  return result.rows[0];
}

async function listConversations(userId) {
  const result = await pool.query(
    `SELECT
       c.id,
       c.title,
       c.created_at,
       c.updated_at,
       (
         SELECT LEFT(m.content, 80)
         FROM messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.id DESC
         LIMIT 1
       ) AS last_message_preview
     FROM conversations c
     WHERE c.user_id = $1 AND c.archived_at IS NULL
     ORDER BY c.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

async function getConversationById(conversationId) {
  const result = await pool.query(
    'SELECT * FROM conversations WHERE id = $1',
    [conversationId]
  );
  return result.rows[0] || null;
}

async function assertConversationOwner(conversationId, userId) {
  const result = await pool.query(
    'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (result.rows.length === 0) {
    const err = new Error('CONVERSATION_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  return true;
}

async function renameConversation(conversationId, title) {
  const result = await pool.query(
    `UPDATE conversations
     SET title = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, title, updated_at`,
    [conversationId, title]
  );
  return result.rows[0];
}

async function archiveConversation(conversationId) {
  const result = await pool.query(
    `UPDATE conversations
     SET archived_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id, archived_at`,
    [conversationId]
  );
  return result.rows[0];
}

async function updateConversationTimestamp(conversationId) {
  await pool.query(
    'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
    [conversationId]
  );
}

async function setConversationTitle(conversationId, title) {
  await pool.query(
    'UPDATE conversations SET title = $2, updated_at = NOW() WHERE id = $1',
    [conversationId, title]
  );
}

// ========================
// Message functions
// ========================

async function addMessage(conversationId, userId, role, content) {
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, user_id, role, content) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, conversation_id, user_id, role, content, created_at`,
    [conversationId, userId, role, content]
  );
  return result.rows[0];
}

async function getConversationMessages(conversationId, limit = 200) {
  const result = await pool.query(
    `SELECT id, role, content, created_at 
     FROM messages 
     WHERE conversation_id = $1 
     ORDER BY id ASC 
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows;
}

async function getHistoryByConversation(conversationId, limit = 20) {
  const result = await pool.query(
    `SELECT role, content 
     FROM messages 
     WHERE conversation_id = $1 
     ORDER BY id DESC 
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse();
}

async function getMessagesByUser(userId, limit = 100) {
  const result = await pool.query(
    `SELECT id, role, content, created_at 
     FROM messages 
     WHERE user_id = $1 
     ORDER BY id ASC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function getHistory(userId, limit = 10) {
  const result = await pool.query(
    `SELECT role, content 
     FROM messages 
     WHERE user_id = $1 
     ORDER BY id DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.reverse();
}

async function getMessageCount(userId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM messages WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].count);
}

async function getUserCount() {
  const result = await pool.query('SELECT COUNT(*) as count FROM users');
  return parseInt(result.rows[0].count);
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  createUser,
  findUserByEmail,
  findUserById,
  createConversation,
  listConversations,
  getConversationById,
  assertConversationOwner,
  renameConversation,
  archiveConversation,
  updateConversationTimestamp,
  setConversationTitle,
  addMessage,
  getConversationMessages,
  getHistoryByConversation,
  getMessagesByUser,
  getHistory,
  getMessageCount,
  getUserCount,
  closePool,
};
