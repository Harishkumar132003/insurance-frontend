import { useState } from 'react';
import { IconChevronRight } from '../icons/Icons';
import './ConfigComponents.scss';

export default function CollapsibleCard({ title, children, defaultOpen = true, actions }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-card ${open ? 'collapsible-card--open' : ''}`}>
      <div className="collapsible-card__header" onClick={() => setOpen(!open)}>
        <div className="collapsible-card__title-row">
          <IconChevronRight size={16} className={`collapsible-card__chevron ${open ? 'collapsible-card__chevron--open' : ''}`} />
          <h3>{title}</h3>
        </div>
        {actions && (
          <div className="collapsible-card__actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && <div className="collapsible-card__body">{children}</div>}
    </div>
  );
}
