// ========================
// API client
// ========================
const api = {
  async request(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const errMsg = data?.error || data || 'Ошибка запроса';
      throw new Error(errMsg);
    }
    return data;
  },

  getSession() {
    return this.request('/api/session', { method: 'GET' });
  },

  login(payload) {
    return this.request('/api/login', { method: 'POST', body: JSON.stringify(payload) });
  },

  register(payload) {
    return this.request('/api/register', { method: 'POST', body: JSON.stringify(payload) });
  },

  logout() {
    return this.request('/api/logout', { method: 'POST' });
  },

  // Conversations
  getConversations() {
    return this.request('/api/conversations', { method: 'GET' });
  },

  createConversation(title) {
    return this.request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: title || null }),
    });
  },

  getConversationMessages(conversationId) {
    return this.request(`/api/conversations/${conversationId}/messages`, { method: 'GET' });
  },

  renameConversation(conversationId, title) {
    return this.request(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },

  deleteConversation(conversationId) {
    return this.request(`/api/conversations/${conversationId}`, { method: 'DELETE' });
  },

  sendMessage(message, conversationId) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    });
  },
};

// ========================
// State
// ========================
let currentConversationId = null;
let conversations = [];

// ========================
// DOM elements
// ========================
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const toRegister = document.getElementById('to-register');
const toLogin = document.getElementById('to-login');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatError = document.getElementById('chat-error');
const newChatBtn = document.getElementById('new-chat-btn');
const sendButton = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');

// ========================
// Auth UI
// ========================
function switchAuthMode(mode) {
  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.add('visible');
    registerForm.classList.remove('visible');
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.add('visible');
    loginForm.classList.remove('visible');
  }
  authError.textContent = '';
}

function showAuth() {
  authView.classList.remove('hidden');
  chatView.classList.add('hidden');
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = '';
}

function showChat(email) {
  authView.classList.add('hidden');
  chatView.classList.remove('hidden');
  const emailEl = document.getElementById('user-email');
  if (emailEl) {
    emailEl.textContent = email || '';
  }
}

// ========================
// Message rendering
// ========================
function appendMessage({ role, content, isLoading = false }) {
  const welcome = chatMessages.querySelector('.welcome-container');
  if (welcome) {
    welcome.remove();
  }

  const container = document.createElement('div');
  container.className = `message ${role === 'user' ? 'user' : 'assistant'}${isLoading ? ' loading' : ''}`;

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'Вы' : 'LX';

  const text = document.createElement('div');
  text.className = 'message-text';
  text.textContent = content;

  messageContent.appendChild(avatar);
  messageContent.appendChild(text);
  container.appendChild(messageContent);

  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return container;
}

function showWelcome() {
  chatMessages.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.className = 'welcome-container';
  welcome.innerHTML = `
    <div class="welcome-icon">⚖️</div>
    <h1>Legal Expert</h1>
    <p>Как я могу помочь вам сегодня?</p>
  `;
  chatMessages.appendChild(welcome);
}

function clearChat() {
  showWelcome();
}

// ========================
// Conversations sidebar
// ========================
function renderConversations() {
  chatHistory.innerHTML = '';

  if (conversations.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 12px; font-size: 13px; color: #9ca3af; text-align: center;';
    empty.textContent = 'Нет диалогов';
    chatHistory.appendChild(empty);
    return;
  }

  conversations.forEach((conv) => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === currentConversationId ? ' active' : '');
    item.dataset.id = conv.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'conv-item-title';
    titleSpan.textContent = conv.title || 'Новый чат';

    const actions = document.createElement('div');
    actions.className = 'conv-item-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'conv-action-btn rename';
    renameBtn.title = 'Переименовать';
    renameBtn.innerHTML = '✏️';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRenameConversation(conv.id, conv.title);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'conv-action-btn delete';
    deleteBtn.title = 'Удалить';
    deleteBtn.innerHTML = '🗑';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteConversation(conv.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(titleSpan);
    item.appendChild(actions);

    item.addEventListener('click', () => {
      selectConversation(conv.id);
    });

    item.addEventListener('dblclick', (e) => {
      e.preventDefault();
      handleRenameConversation(conv.id, conv.title);
    });

    chatHistory.appendChild(item);
  });
}

async function loadConversations() {
  try {
    const data = await api.getConversations();
    conversations = data.conversations || [];
    renderConversations();
    return conversations;
  } catch (e) {
    console.error('Cannot load conversations', e);
    return [];
  }
}

async function selectConversation(conversationId) {
  if (currentConversationId === conversationId) return;

  currentConversationId = conversationId;
  renderConversations();

  chatMessages.innerHTML = '';
  const loadingEl = appendMessage({ role: 'assistant', content: 'Загрузка сообщений…', isLoading: true });

  try {
    const data = await api.getConversationMessages(conversationId);
    chatMessages.innerHTML = '';
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach((m) => appendMessage(m));
    } else {
      showWelcome();
    }
  } catch (e) {
    console.error('Cannot load messages', e);
    loadingEl.remove();
    showWelcome();
  }
}

async function createAndSelectConversation() {
  try {
    const data = await api.createConversation();
    const newConv = data.conversation || { id: data.conversationId, title: null };
    conversations.unshift(newConv);
    currentConversationId = newConv.id;
    renderConversations();
    showWelcome();
    chatInput.focus();
    return newConv;
  } catch (e) {
    console.error('Cannot create conversation', e);
    return null;
  }
}

async function handleRenameConversation(conversationId, currentTitle) {
  const newTitle = prompt('Название диалога:', currentTitle || '');
  if (newTitle === null) return;

  try {
    await api.renameConversation(conversationId, newTitle);
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) conv.title = newTitle;
    renderConversations();
  } catch (e) {
    console.error('Cannot rename conversation', e);
  }
}

async function handleDeleteConversation(conversationId) {
  if (!confirm('Удалить этот диалог?')) return;

  try {
    await api.deleteConversation(conversationId);
    conversations = conversations.filter((c) => c.id !== conversationId);

    if (currentConversationId === conversationId) {
      if (conversations.length > 0) {
        await selectConversation(conversations[0].id);
      } else {
        await createAndSelectConversation();
      }
    } else {
      renderConversations();
    }
  } catch (e) {
    console.error('Cannot delete conversation', e);
  }
}

// ========================
// Initial state loader
// ========================
async function loadInitialState() {
  try {
    const session = await api.getSession();
    if (session.loggedIn) {
      showChat(session.user.email);

      const convs = await loadConversations();

      if (convs.length > 0) {
        await selectConversation(convs[0].id);
      } else {
        await createAndSelectConversation();
      }
    } else {
      showAuth();
    }
  } catch (e) {
    console.error(e);
    showAuth();
  }
}

// ========================
// Event listeners
// ========================

tabLogin.addEventListener('click', () => switchAuthMode('login'));
tabRegister.addEventListener('click', () => switchAuthMode('register'));
toRegister.addEventListener('click', (e) => {
  e.preventDefault();
  switchAuthMode('register');
});
toLogin.addEventListener('click', (e) => {
  e.preventDefault();
  switchAuthMode('login');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const formData = new FormData(loginForm);
  const payload = {
    email: formData.get('email').trim(),
    password: formData.get('password'),
  };
  try {
    const user = await api.login(payload);
    showChat(user.email);
    chatMessages.innerHTML = '';
    currentConversationId = null;
    conversations = [];
    await loadInitialState();
  } catch (err) {
    authError.textContent =
      err.message === 'INVALID_CREDENTIALS'
        ? 'Неверный email или пароль'
        : `Ошибка: ${err.message}`;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const formData = new FormData(registerForm);
  const payload = {
    email: formData.get('email').trim(),
    password: formData.get('password'),
  };
  if (!payload.email || !payload.password) {
    authError.textContent = 'Заполните email и пароль';
    return;
  }
  try {
    const user = await api.register(payload);
    showChat(user.email);
    chatMessages.innerHTML = '';
    currentConversationId = null;
    conversations = [];
    await loadInitialState();
  } catch (err) {
    if (err.message === 'EMAIL_ALREADY_EXISTS') {
      authError.textContent = 'Пользователь с таким email уже существует';
    } else {
      authError.textContent = `Ошибка: ${err.message}`;
    }
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api.logout();
  } catch (e) {
    console.warn(e);
  }
  currentConversationId = null;
  conversations = [];
  chatHistory.innerHTML = '';
  showAuth();
});

newChatBtn.addEventListener('click', async () => {
  await createAndSelectConversation();
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  chatError.textContent = '';
  const message = chatInput.value.trim();
  if (!message) return;

  if (!currentConversationId) {
    const conv = await createAndSelectConversation();
    if (!conv) {
      chatError.textContent = 'Не удалось создать диалог.';
      return;
    }
  }

  appendMessage({ role: 'user', content: message });
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendButton.disabled = true;

  const loadingMessage = appendMessage({ role: 'assistant', content: 'Думаю над ответом…', isLoading: true });

  try {
    const { reply } = await api.sendMessage(message, currentConversationId);
    const textNode = loadingMessage.querySelector('.message-text');
    textNode.textContent = reply;
    loadingMessage.classList.remove('loading');

    await loadConversations();
  } catch (err) {
    loadingMessage.remove();
    chatError.textContent = 'Не удалось отправить запрос. Попробуйте ещё раз.';
    console.error(err);
  } finally {
    sendButton.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
  sendButton.disabled = !chatInput.value.trim();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim() && !sendButton.disabled) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  }
});

// ========================
// Init
// ========================
loadInitialState();
