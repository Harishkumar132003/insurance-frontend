import EmptyState from '../components/EmptyState';
import './Pages.scss';

export default function Logs() {
  return (
    <div>
      <div className="page-header">
        <h1>Logs</h1>
        <p>View execution logs</p>
      </div>

      <div className="table-card">
        <EmptyState message="Logs endpoint not available yet. This page will populate once the backend adds a GET /logs endpoint." />
      </div>
    </div>
  );
}
