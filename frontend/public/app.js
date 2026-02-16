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

  getMessages() {
    return this.request('/api/messages', { method: 'GET' });
  },

  sendMessage(message) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};

// UI
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const toRegister = document.getElementById('to-register');
const toLogin = document.getElementById('to-login');
const authError = document.getElementById('auth-error');
const userEmailLabel = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatError = document.getElementById('chat-error');
const newChatBtn = document.getElementById('new-chat-btn');

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
  userEmailLabel.textContent = '';
}

function showChat(email) {
  authView.classList.add('hidden');
  chatView.classList.remove('hidden');
  userEmailLabel.textContent = email || '';
}

function appendMessage({ role, content }) {
  const container = document.createElement('div');
  container.className = `message ${role === 'user' ? 'user' : 'assistant'}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'Вы' : 'LX';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = role === 'user' ? 'Вы' : 'Legal Expert';

  const text = document.createElement('div');
  text.className = 'text';
  text.textContent = content;

  bubble.appendChild(meta);
  bubble.appendChild(text);
  container.appendChild(avatar);
  container.appendChild(bubble);

  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearChat() {
  chatMessages.innerHTML = '';
  appendMessage({
    role: 'assistant',
    content:
      'Новый диалог. Кратко опиши свой запрос: что за ситуация, какие документы есть и какой результат для тебя приоритетен.',
  });
}

async function loadInitialState() {
  try {
    const session = await api.getSession();
    if (session.loggedIn) {
      showChat(session.user.email);
      // Load messages
      try {
        const data = await api.getMessages();
        if (data.messages?.length) {
          data.messages.forEach((m) => appendMessage(m));
        }
      } catch (e) {
        console.warn('Cannot load messages', e);
      }
    } else {
      showAuth();
    }
  } catch (e) {
    console.error(e);
    showAuth();
  }
}

// Event listeners
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
  showAuth();
});

newChatBtn.addEventListener('click', () => {
  clearChat();
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  chatError.textContent = '';
  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage({ role: 'user', content: message });
  chatInput.value = '';

  appendMessage({ role: 'assistant', content: 'Думаю над ответом…' });
  const loadingBubble = chatMessages.lastElementChild;

  try {
    const { reply } = await api.sendMessage(message);
    // Replace loading bubble text
    const textNode = loadingBubble.querySelector('.text');
    textNode.textContent = reply;
  } catch (err) {
    loadingBubble.remove();
    chatError.textContent = 'Не удалось отправить запрос. Попробуйте ещё раз.';
    console.error(err);
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Init
loadInitialState();

