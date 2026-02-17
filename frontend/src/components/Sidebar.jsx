export default function Sidebar({
  conversations,
  activeConversationId,
  userEmail,
  onSelectConversation,
  onNewChat,
  onRename,
  onDelete,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <button className="new-chat-btn" onClick={onNewChat}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 1V17M1 9H17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Новый чат
      </button>

      <div className="sidebar-content">
        <div className="sidebar-section">
          <div className="sidebar-header">Диалоги</div>
          <div className="chat-history">
            {conversations.length === 0 ? (
              <div className="conv-empty">Нет диалогов</div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conv-item${conv.id === activeConversationId ? ' active' : ''}`}
                  onClick={() => onSelectConversation(conv.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    onRename(conv.id, conv.title);
                  }}
                >
                  <span className="conv-item-title">
                    {conv.title || 'Новый чат'}
                  </span>
                  <div className="conv-item-actions">
                    <button
                      className="conv-action-btn rename"
                      title="Переименовать"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(conv.id, conv.title);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                    <button
                      className="conv-action-btn delete"
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-info">
          <span className="user-email">{userEmail}</span>
        </div>
        <button className="logout-btn" onClick={onLogout}>Выйти</button>
      </div>
    </aside>
  );
}
