import { useState, useRef, useEffect, useCallback } from 'react';
import { aiAssistantService } from '../services/api';
import { toast } from '../components/Toast';
import { IconSend, IconPlus, IconTrash } from '../components/icons/Icons';
import './AiAssistant.scss';

const SUGGESTIONS = [
  'How many pre-auth cases do we have, broken down by status?',
  'Which insurance providers have the most claim cases?',
  'List the cases still awaiting the insurer.',
  'What is the total settled amount this month?',
];

function ResultTable({ columns, rows }) {
  if (!columns?.length || !rows?.length) return null;
  return (
    <div className="ai-assistant__table-wrap">
      <table className="ai-assistant__table">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{row[c] === null || row[c] === undefined ? '—' : String(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <p className="ai-assistant__table-note">Showing 50 of {rows.length} rows.</p>
      )}
    </div>
  );
}

function Message({ msg }) {
  const [showSql, setShowSql] = useState(false);
  if (msg.role === 'user') {
    return <div className="ai-assistant__msg ai-assistant__msg--user">{msg.content}</div>;
  }
  return (
    <div className="ai-assistant__msg ai-assistant__msg--bot">
      {msg.error ? (
        <span className="ai-assistant__error">{msg.content}</span>
      ) : (
        <>
          <div className="ai-assistant__answer">{msg.content}</div>
          <ResultTable columns={msg.columns} rows={msg.rows} />
          {msg.sql?.length > 0 && (
            <div className="ai-assistant__sql">
              <button className="ai-assistant__sql-toggle" onClick={() => setShowSql((s) => !s)}>
                {showSql ? 'Hide' : 'Show'} SQL
              </button>
              {showSql && <pre className="ai-assistant__sql-code">{msg.sql.join(';\n\n')}</pre>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AiAssistant() {
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);     // sending a message
  const [loadingChat, setLoadingChat] = useState(false);
  const scrollRef = useRef(null);

  const refreshChats = useCallback(async () => {
    try { setChats(await aiAssistantService.listChats()); } catch { /* toast handles */ }
  }, []);

  useEffect(() => { refreshChats(); }, [refreshChats]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const openChat = async (id) => {
    if (id === activeId) return;
    setActiveId(id);
    setMessages([]);
    setLoadingChat(true);
    try {
      const chat = await aiAssistantService.getChat(id);
      setMessages(chat.messages || []);
    } catch {
      toast.error('Could not load chat');
    } finally {
      setLoadingChat(false);
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput('');
  };

  const removeChat = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await aiAssistantService.deleteChat(id);
      setChats((c) => c.filter((x) => x.id !== id));
      if (id === activeId) newChat();
    } catch {
      toast.error('Could not delete chat');
    }
  };

  const ask = async (question) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setLoading(true);

    // Optimistically show the user's message.
    setMessages((m) => [...m, { role: 'user', content: q }]);
    try {
      let chatId = activeId;
      if (!chatId) {
        const created = await aiAssistantService.createChat();
        chatId = created.id;
        setActiveId(chatId);
      }
      const assistant = await aiAssistantService.sendMessage(chatId, q);
      setMessages((m) => [...m, assistant]);
      refreshChats();   // title / ordering may have changed
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setMessages((m) => [...m, {
        role: 'assistant',
        error: true,
        content: typeof detail === 'string' ? detail : 'Something went wrong answering that.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  };

  return (
    <div className="ai-assistant">
      {/* Left rail: chat list */}
      <aside className="ai-assistant__rail">
        <button className="ai-assistant__new" onClick={newChat}>
          <IconPlus size={16} /> New chat
        </button>
        <div className="ai-assistant__chat-list">
          {chats.length === 0 && <p className="ai-assistant__rail-empty">No chats yet</p>}
          {chats.map((c) => (
            <button
              key={c.id}
              className={`ai-assistant__chat-item ${c.id === activeId ? 'is-active' : ''}`}
              onClick={() => openChat(c.id)}
              title={c.title}
            >
              <span className="ai-assistant__chat-title">{c.title}</span>
              <span className="ai-assistant__chat-del" onClick={(e) => removeChat(e, c.id)} aria-label="Delete chat">
                <IconTrash size={14} />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right: conversation */}
      <section className="ai-assistant__main">
        <div className="ai-assistant__head">
          <h1>AI Assistant</h1>
          <p>Ask questions about your hospital's claims data in plain English.</p>
        </div>

        <div className="ai-assistant__chat" ref={scrollRef}>
          {!loadingChat && messages.length === 0 && (
            <div className="ai-assistant__empty">
              <p>Try asking:</p>
              <div className="ai-assistant__suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="ai-assistant__chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {loadingChat && <div className="ai-assistant__empty"><p>Loading…</p></div>}
          {messages.map((msg, i) => <Message key={msg.id ?? `tmp-${i}`} msg={msg} />)}
          {loading && (
            <div className="ai-assistant__msg ai-assistant__msg--bot ai-assistant__thinking">
              <span /> <span /> <span />
            </div>
          )}
        </div>

        <div className="ai-assistant__input-bar">
          <textarea
            className="ai-assistant__input"
            rows={1}
            placeholder="Ask about pre-auths, claims, providers, settlements…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button
            className="ai-assistant__send"
            onClick={() => ask()}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <IconSend size={18} />
          </button>
        </div>
      </section>
    </div>
  );
}
