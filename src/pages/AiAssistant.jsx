import { useState, useRef, useEffect } from 'react';
import { aiAssistantService } from '../services/api';
import { IconSend, IconRefresh } from '../components/icons/Icons';
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
    return <div className="ai-assistant__msg ai-assistant__msg--user">{msg.text}</div>;
  }
  return (
    <div className="ai-assistant__msg ai-assistant__msg--bot">
      {msg.error ? (
        <span className="ai-assistant__error">{msg.text}</span>
      ) : (
        <>
          <div className="ai-assistant__answer">{msg.text}</div>
          <ResultTable columns={msg.columns} rows={msg.rows} />
          {msg.sql?.length > 0 && (
            <div className="ai-assistant__sql">
              <button className="ai-assistant__sql-toggle" onClick={() => setShowSql((s) => !s)}>
                {showSql ? 'Hide' : 'Show'} SQL
              </button>
              {showSql && (
                <pre className="ai-assistant__sql-code">{msg.sql.join(';\n\n')}</pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AiAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (question) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await aiAssistantService.query(q);
      setMessages((m) => [...m, {
        role: 'bot',
        text: res.answer,
        sql: res.sql,
        columns: res.columns,
        rows: res.rows,
      }]);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setMessages((m) => [...m, {
        role: 'bot',
        error: true,
        text: typeof detail === 'string' ? detail : 'Something went wrong answering that.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <div className="ai-assistant">
      <div className="ai-assistant__header">
        <div>
          <h1>AI Assistant</h1>
          <p>Ask questions about your hospital's claims data in plain English.</p>
        </div>
        {messages.length > 0 && (
          <button className="ai-assistant__clear" onClick={() => setMessages([])}>
            <IconRefresh size={16} /> New chat
          </button>
        )}
      </div>

      <div className="ai-assistant__chat" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="ai-assistant__empty">
            <p>Try asking:</p>
            <div className="ai-assistant__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ai-assistant__chip" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
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
    </div>
  );
}
