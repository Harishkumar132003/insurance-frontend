import { IconInbox } from './icons/Icons';
import './EmptyState.scss';

export default function EmptyState({ message = 'No data available' }) {
  return (
    <div className="empty-state">
      <IconInbox size={48} />
      <p>{message}</p>
    </div>
  );
}
