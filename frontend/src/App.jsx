import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from './api';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import RenameModal from './components/RenameModal';
import ConfirmModal from './components/ConfirmModal';

export default function App() {
  const [authState, setAuthState] = useState('unknown');
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState('');

  const [renameModal, setRenameModal] = useState({
    open: false,
    conversationId: null,
    currentTitle: '',
  });
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    conversationId: null,
  });

  const activeIdRef = useRef(null);

  // ------ Auth ------

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    setAuthState('loading');
    try {
      const data = await api.getMe();
      setUser(data.user);
      setAuthState('logged_in');
    } catch {
      setAuthState('logged_out');
    }
  }

  function handleLogin(userData) {
    setUser(userData);
    setAuthState('logged_in');
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch { /* ignore */ }
    setUser(null);
    setConversations([]);
    setActiveConversationId(null);
    activeIdRef.current = null;
    setMessages([]);
    setAuthState('logged_out');
  }

  // ------ Conversations ------

  useEffect(() => {
    if (authState === 'logged_in') {
      initChat();
    }
  }, [authState]);

  async function initChat() {
    try {
      const data = await api.listConversations();
      const convs = data.conversations || [];
      setConversations(convs);

      if (convs.length > 0) {
        await selectConversation(convs[0].id);
      } else {
        await createAndSelect();
      }
    } catch (err) {
      console.error('Failed to init chat', err);
    }
  }

  async function refreshConversations() {
    try {
      const data = await api.listConversations();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to refresh conversations', err);
    }
  }

  async function selectConversation(id) {
    if (activeIdRef.current === id) return;

    activeIdRef.current = id;
    setActiveConversationId(id);
    setMessages([]);
    setIsLoadingMessages(true);

    try {
      const data = await api.getMessages(id);
      if (activeIdRef.current === id) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      if (activeIdRef.current === id) {
        setIsLoadingMessages(false);
      }
    }
  }

  async function createAndSelect() {
    try {
      const data = await api.createConversation();
      const newConv = data.conversation || {
        id: data.conversationId,
        title: null,
      };
      setConversations((prev) => [newConv, ...prev]);
      activeIdRef.current = newConv.id;
      setActiveConversationId(newConv.id);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  }

  async function handleNewChat() {
    await createAndSelect();
  }

  // ------ Send message ------

  async function handleSendMessage(text) {
    let convId = activeIdRef.current;

    if (!convId) {
      try {
        const data = await api.createConversation();
        const newConv = data.conversation || {
          id: data.conversationId,
          title: null,
        };
        setConversations((prev) => [newConv, ...prev]);
        convId = newConv.id;
        activeIdRef.current = convId;
        setActiveConversationId(convId);
      } catch {
        setError('Не удалось создать диалог');
        return;
      }
    }

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsSending(true);
    setError('');

    try {
      const data = await api.sendMessage(text, convId);
      if (activeIdRef.current === convId) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply },
        ]);
      }
      await refreshConversations();
    } catch {
      setError('Не удалось отправить сообщение. Попробуйте ещё раз.');
    } finally {
      setIsSending(false);
    }
  }

  // ------ Rename ------

  const openRenameModal = useCallback((conversationId, currentTitle) => {
    setRenameModal({
      open: true,
      conversationId,
      currentTitle: currentTitle || '',
    });
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameModal({ open: false, conversationId: null, currentTitle: '' });
  }, []);

  async function handleRename(newTitle) {
    const { conversationId } = renameModal;
    closeRenameModal();
    try {
      await api.renameConversation(conversationId, newTitle);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, title: newTitle } : c,
        ),
      );
    } catch (err) {
      console.error('Failed to rename', err);
      setError('Не удалось переименовать диалог');
    }
  }

  // ------ Delete ------

  const openDeleteModal = useCallback((conversationId) => {
    setConfirmModal({ open: true, conversationId });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setConfirmModal({ open: false, conversationId: null });
  }, []);

  async function handleDelete() {
    const { conversationId } = confirmModal;
    closeDeleteModal();

    try {
      await api.archiveConversation(conversationId);
      const remaining = conversations.filter((c) => c.id !== conversationId);
      setConversations(remaining);

      if (activeIdRef.current === conversationId) {
        if (remaining.length > 0) {
          await selectConversation(remaining[0].id);
        } else {
          activeIdRef.current = null;
          setActiveConversationId(null);
          await createAndSelect();
        }
      }
    } catch (err) {
      console.error('Failed to delete', err);
      setError('Не удалось удалить диалог');
    }
  }

  // ------ Render ------

  if (authState === 'unknown' || authState === 'loading') {
    return (
      <div className="app-loader">
        <div className="loader-spinner" />
        <p>Загрузка…</p>
      </div>
    );
  }

  if (authState === 'logged_out') {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <section className="chat-view">
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          userEmail={user?.email || ''}
          onSelectConversation={selectConversation}
          onNewChat={handleNewChat}
          onRename={openRenameModal}
          onDelete={openDeleteModal}
          onLogout={handleLogout}
        />
        <ChatWindow
          messages={messages}
          isSending={isSending}
          isLoadingMessages={isLoadingMessages}
          onSendMessage={handleSendMessage}
        />
      </section>

      {error && (
        <div className="toast-error">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError('')}>
            &times;
          </button>
        </div>
      )}

      <RenameModal
        isOpen={renameModal.open}
        currentTitle={renameModal.currentTitle}
        onSave={handleRename}
        onClose={closeRenameModal}
      />
      <ConfirmModal
        isOpen={confirmModal.open}
        message="Удалить этот диалог? Это действие нельзя отменить."
        onConfirm={handleDelete}
        onClose={closeDeleteModal}
      />
    </div>
  );
}
