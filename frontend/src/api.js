async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
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
    const err = new Error(data?.message || data?.error || data || 'Ошибка запроса');
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }

  return data;
}

export function getMe() {
  return request('/api/me');
}

export function login(email, password) {
  return request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(email, password) {
  return request('/api/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request('/api/logout', { method: 'POST' });
}

export function listConversations() {
  return request('/api/conversations');
}

export function createConversation() {
  return request('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getMessages(conversationId) {
  return request(`/api/conversations/${conversationId}/messages`);
}

export function renameConversation(conversationId, title) {
  return request(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function archiveConversation(conversationId) {
  return request(`/api/conversations/${conversationId}`, { method: 'DELETE' });
}

export function sendMessage(message, conversationId) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId }),
  });
}
