import { useState } from 'react';
import { login, register } from '../api';

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(m) {
    setMode(m);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Заполните email и пароль');
      return;
    }

    setLoading(true);
    try {
      const fn = mode === 'login' ? login : register;
      const data = await fn(email.trim(), password);
      onLogin({ id: data.id, email: data.email });
    } catch (err) {
      if (err.code === 'INVALID_CREDENTIALS') {
        setError('Неверный email или пароль');
      } else if (err.code === 'EMAIL_ALREADY_EXISTS') {
        setError('Пользователь с таким email уже существует');
      } else {
        setError(err.message || 'Ошибка');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-view">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Legal Expert</h1>
            <p>Юридический ассистент</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              className={`tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 6 : undefined}
                placeholder="••••••••"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? 'Загрузка…'
                : mode === 'login'
                  ? 'Войти'
                  : 'Зарегистрироваться'}
            </button>
            <p className="form-hint">
              {mode === 'login' ? (
                <>
                  Нет аккаунта?{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('register'); }}>
                    Зарегистрироваться
                  </a>
                </>
              ) : (
                <>
                  Уже есть аккаунт?{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>
                    Войти
                  </a>
                </>
              )}
            </p>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    </section>
  );
}
