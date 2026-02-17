import { useState, useRef, useEffect } from 'react';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

function isPdf(mimeType) {
  return mimeType === 'application/pdf';
}

function Attachments({ attachments }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="msg-attachments">
      {attachments.map((att) => {
        if (isImage(att.mime_type)) {
          return (
            <a
              key={att.id}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="att-image-link"
            >
              <img
                src={att.url}
                alt={att.original_name}
                className="att-image-preview"
              />
            </a>
          );
        }

        if (isPdf(att.mime_type)) {
          return (
            <div key={att.id} className="att-file">
              <svg className="att-file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="att-file-info">
                <span className="att-file-name">{att.original_name}</span>
                <span className="att-file-size">{formatSize(att.size_bytes)}</span>
              </div>
              <div className="att-file-actions">
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="att-link">
                  Открыть
                </a>
                <a href={att.url + '?download=1'} className="att-link">
                  Скачать
                </a>
              </div>
            </div>
          );
        }

        return (
          <div key={att.id} className="att-file">
            <svg className="att-file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6e6e80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="att-file-info">
              <span className="att-file-name">{att.original_name}</span>
              <span className="att-file-size">{formatSize(att.size_bytes)}</span>
            </div>
            <a href={att.url + '?download=1'} className="att-link">
              Скачать
            </a>
          </div>
        );
      })}
    </div>
  );
}

export default function ChatWindow({
  messages,
  isSending,
  isLoadingMessages,
  onSendMessage,
}) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || isSending) return;
    onSendMessage(text, pendingFiles);
    setInput('');
    setPendingFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files || []);
    setPendingFiles((prev) => {
      const combined = [...prev, ...newFiles];
      return combined.slice(0, 10);
    });
    e.target.value = '';
  }

  function removePendingFile(index) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const showWelcome = !isLoadingMessages && messages.length === 0;
  const canSend = (input.trim() || pendingFiles.length > 0) && !isSending;

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
              <div key={msg.id || i} className={`message ${msg.role}`}>
                <div className="message-content">
                  <div className="avatar">
                    {msg.role === 'user' ? 'Вы' : 'LX'}
                  </div>
                  <div className="message-body">
                    <div className="message-text">{msg.content}</div>
                    <Attachments attachments={msg.attachments} />
                  </div>
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
        {pendingFiles.length > 0 && (
          <div className="pending-files">
            {pendingFiles.map((file, i) => (
              <div key={i} className="pending-file">
                <span className="pending-file-name">{file.name}</span>
                <span className="pending-file-size">{formatSize(file.size)}</span>
                <button
                  type="button"
                  className="pending-file-remove"
                  onClick={() => removePendingFile(i)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        <form className="chat-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <button
              type="button"
              className="attach-button"
              title="Прикрепить файл"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="file-input-hidden"
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.zip,.rar,.7z,.mp3,.mp4,.wav,.json,.xml"
            />
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
              disabled={!canSend}
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
