import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aiAssistantService } from '../services/api';
import { toast } from '../components/Toast';
import { IconSend, IconPlus, IconTrash } from '../components/icons/Icons';
import './AiAssistant.scss';

// Easy, verified-working examples (validated end-to-end against the agent).
const SUGGESTIONS = [
  'How many pre-auth cases are there in total?',
  'What is the total approved amount this year?',
  'How many pre-auths were raised this month?',
  'How many cases are awaiting the insurer?',
  'Break down cases by pre-auth outcome.',
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
          <div className="ai-assistant__answer">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
          <ResultTable columns={msg.columns} rows={msg.rows} />
          {msg.sql?.length > 0 && (
            <div className="ai-assistant__sql">
              <button className="ai-assistant__sql-toggle" onClick={() => setShowSql((s) => !s)}>
                {showSql ? 'Hide' : 'Show'} query
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
  const [status, setStatus] = useState('');          // live progress line while loading
  const [loadingChat, setLoadingChat] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

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
    setStatus('Understanding your question…');

    // Optimistically show the user's message.
    setMessages((m) => [...m, { role: 'user', content: q }]);

    const ac = new AbortController();
    abortRef.current = ac;

    // Progress is driven off the planner's step purposes (e.g. "Find the
    // patient" → "Retrieve recent claims"); fall back to a tool label.
    const progress = { purposes: [], idx: 0 };
    const toolLabel = (action) =>
      action === 'get_schema' ? 'Looking up the data structure…'
        : action === 'run_query' ? 'Querying the database…'
          : 'Working on it…';

    let settled = false;
    try {
      let chatId = activeId;
      if (!chatId) {
        const created = await aiAssistantService.createChat();
        chatId = created.id;
        setActiveId(chatId);
      }

      await aiAssistantService.sendMessageStream(chatId, q, {
        signal: ac.signal,
        onStatus: (event, data) => {
          if (event === 'status') {
            setStatus(data.stage === 'planning' ? 'Understanding your question…' : 'Working on it…');
          } else if (event === 'plan') {
            progress.purposes = (data.steps || []).map((s) => s.purpose).filter(Boolean);
            progress.idx = 0;
            if (progress.purposes.length) setStatus(progress.purposes[0]);
          } else if (event === 'step' && data.status === 'running') {
            const next = progress.purposes[progress.idx + 1];
            if (next) { progress.idx += 1; setStatus(next); }
            else setStatus(toolLabel(data.action));
          }
          // `clarification` arrives here too; the matching `done` renders it.
        },
        onDone: (data) => {
          settled = true;
          setMessages((m) => [...m, {
            role: 'assistant',
            content: data.answer ?? '',
            sql: data.sql || [],
            columns: data.columns || [],
            rows: data.rows || [],
            id: data.id,
            created_at: data.created_at,
          }]);
          refreshChats();   // title / ordering may have changed
        },
        onError: (data) => {
          settled = true;
          setMessages((m) => [...m, {
            role: 'assistant',
            error: true,
            content: typeof data?.detail === 'string' ? data.detail : 'Something went wrong answering that.',
          }]);
        },
      });

      if (!settled) {
        setMessages((m) => [...m, {
          role: 'assistant', error: true,
          content: 'The assistant did not return an answer. Please try again.',
        }]);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setMessages((m) => [...m, {
          role: 'assistant',
          error: true,
          content: 'Something went wrong answering that.',
        }]);
      }
    } finally {
      setLoading(false);
      setStatus('');
      abortRef.current = null;
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
              {status ? (
                <span className="ai-assistant__status">
                  <span className="ai-assistant__status-dot" />
                  <span className="ai-assistant__status-text">{status}</span>
                </span>
              ) : (
                <><span /> <span /> <span /></>
              )}
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
