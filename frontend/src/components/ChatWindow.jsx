import { useState, useRef, useEffect } from 'react';

export default function ChatWindow({
  messages,
  isSending,
  isLoadingMessages,
  onSendMessage,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    onSendMessage(text);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  const showWelcome = !isLoadingMessages && messages.length === 0;

  return (
    <main className="chat-main">
      <div className="chat-messages">
        {isLoadingMessages ? (
          <div className="chat-loader">
            <div className="loader-spinner" />
            <p>Загрузка сообщений…</p>
          </div>
        ) : showWelcome ? (
          <div className="welcome-container">
            <div className="welcome-icon">⚖️</div>
            <h1>Legal Expert</h1>
            <p>Как я могу помочь вам сегодня?</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-content">
                  <div className="avatar">
                    {msg.role === 'user' ? 'Вы' : 'LX'}
                  </div>
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="message assistant loading">
                <div className="message-content">
                  <div className="avatar">LX</div>
                  <div className="message-text">Думаю над ответом…</div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form className="chat-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              rows="1"
              placeholder="Сообщение Legal Expert..."
              maxLength={2000}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
            />
            <button
              type="submit"
              className="send-button"
              disabled={!input.trim() || isSending}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M16.5 1.5L8.25 9.75M16.5 1.5L10.5 16.5L8.25 9.75M16.5 1.5L1.5 7.5L8.25 9.75"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
