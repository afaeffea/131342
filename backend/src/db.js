const path = require('path');
const fs = require('fs');

const dbFile = process.env.DATABASE_FILE || path.join(__dirname, '..', '..', 'data.json');

// Ensure directory exists
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

function load() {
  if (!fs.existsSync(dbFile)) {
    return { users: [], messages: [], _nextUserId: 1, _nextMessageId: 1 };
  }
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const data = JSON.parse(raw || '{}');
    return {
      users: Array.isArray(data.users) ? data.users : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
      _nextUserId: data._nextUserId || 1,
      _nextMessageId: data._nextMessageId || 1,
    };
  } catch (e) {
    console.error('Failed to read DB file, starting fresh', e);
    return { users: [], messages: [], _nextUserId: 1, _nextMessageId: 1 };
  }
}

function save(state) {
  fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), 'utf8');
}

function createUser(email, passwordHash) {
  const state = load();
  if (state.users.find((u) => u.email === email)) {
    const err = new Error('EMAIL_ALREADY_EXISTS');
    err.code = 'EMAIL_ALREADY_EXISTS';
    throw err;
  }
  const id = state._nextUserId++;
  const user = {
    id,
    email,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
  };
  state.users.push(user);
  save(state);
  return user;
}

function findUserByEmail(email) {
  const state = load();
  return state.users.find((u) => u.email === email) || null;
}

function addMessage(userId, role, content) {
  const state = load();
  const id = state._nextMessageId++;
  const msg = {
    id,
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString(),
  };
  state.messages.push(msg);
  save(state);
  return msg;
}

function getMessagesByUser(userId, limit = 100) {
  const state = load();
  return state.messages
    .filter((m) => m.user_id === userId)
    .sort((a, b) => a.id - b.id)
    .slice(-limit);
}

function getHistory(userId, limit = 10) {
  const state = load();
  return state.messages
    .filter((m) => m.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .reverse()
    .map(({ role, content }) => ({ role, content }));
}

module.exports = {
  createUser,
  findUserByEmail,
  addMessage,
  getMessagesByUser,
  getHistory,
};

