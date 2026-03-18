import { useState } from 'react';
import { IconX } from '../icons/Icons';
import './ConfigComponents.scss';

export default function TagInput({ label, tags = [], onChange, placeholder = 'Type and press Enter' }) {
  const [input, setInput] = useState('');

  const addTags = (raw) => {
    // Split by comma, Enter, or space-separated values
    const values = raw
      .split(/[,\n]+/)
      .map((v) => v.trim())
      .filter((v) => v && !tags.includes(v));
    if (values.length > 0) {
      onChange([...tags, ...values]);
    }
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) {
        addTags(input);
      }
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      addTags(pasted);
    }
  };

  const handleRemove = (index) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="tag-input">
      {label && <label className="tag-input__label">{label}</label>}
      <div className="tag-input__box">
        {tags.map((tag, i) => (
          <span className="tag-input__tag" key={i}>
            {tag}
            <button type="button" onClick={() => handleRemove(i)}>
              <IconX size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => { if (input.trim()) addTags(input); }}
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
    </div>
  );
}
