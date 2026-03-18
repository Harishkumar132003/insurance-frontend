import { useAuth } from '../context/AuthContext';
import { IconHospital, IconUsers, IconPlay, IconLogs } from '../components/icons/Icons';
import './Dashboard.scss';

export default function Dashboard() {
  const { user, isSuperAdmin } = useAuth();

  const statCards = [
    ...(isSuperAdmin
      ? [
          { label: 'Hospitals', value: '—', icon: IconHospital, color: '#4f46e5' },
          { label: 'Users', value: '—', icon: IconUsers, color: '#10b981' },
        ]
      : []),
    { label: 'Workflows Run', value: '—', icon: IconPlay, color: '#f59e0b' },
    { label: 'Logs', value: '—', icon: IconLogs, color: '#3b82f6' },
  ];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.email || 'User'}</p>
      </div>

      <div className="dashboard__stats">
        {statCards.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-card__icon" style={{ background: `${stat.color}15`, color: stat.color }}>
              <stat.icon size={24} />
            </div>
            <div className="stat-card__info">
              <span className="stat-card__value">{stat.value}</span>
              <span className="stat-card__label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
