import { IconPlus, IconX } from '../icons/Icons';
import './ConfigComponents.scss';

export default function KeyValueInput({ label, items = [], onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', keyOptions }) {
  const usedKeys = items.map((item) => item.key).filter(Boolean);

  const handleAdd = () => {
    onChange([...items, { key: '', value: '' }]);
  };

  const handleRemove = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleChange = (index, field, val) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [field]: val } : item
    );
    onChange(updated);
  };

  const allKeysUsed = keyOptions && usedKeys.length >= keyOptions.length;

  return (
    <div className="kv-input">
      {label && <label className="kv-input__label">{label}</label>}
      <div className="kv-input__list">
        {items.map((item, i) => (
          <div className="kv-input__row" key={i}>
            {keyOptions ? (
              <select
                value={item.key}
                onChange={(e) => handleChange(i, 'key', e.target.value)}
              >
                <option value="">-- Select --</option>
                {keyOptions.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={usedKeys.includes(opt.value) && item.key !== opt.value}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder={keyPlaceholder}
                value={item.key}
                onChange={(e) => handleChange(i, 'key', e.target.value)}
              />
            )}
            <input
              type="text"
              placeholder={valuePlaceholder}
              value={item.value}
              onChange={(e) => handleChange(i, 'value', e.target.value)}
            />
            <button type="button" className="kv-input__remove" onClick={() => handleRemove(i)}>
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="kv-input__add" onClick={handleAdd} disabled={allKeysUsed}>
        <IconPlus size={14} /> Add {label || 'Field'}
      </button>
    </div>
  );
}
