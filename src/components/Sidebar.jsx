import { NavLink } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import {
  IconDashboard,
  IconHospital,
  IconUsers,
  IconConfig,
  IconPrompt,
  IconShield,
  IconPlay,
  IconLogs,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
} from './icons/Icons';
import './Sidebar.scss';

const { SUPER_ADMIN, HOSPITAL_ADMIN } = ROLES;

const menuItems = [
  { path: '/', label: 'Dashboard', icon: IconDashboard, roles: [SUPER_ADMIN, HOSPITAL_ADMIN] },
  { path: '/hospitals', label: 'Hospitals', icon: IconHospital, roles: [SUPER_ADMIN] },
  { path: '/users', label: 'Users', icon: IconUsers, roles: [SUPER_ADMIN] },
  { path: '/configurations', label: 'Configurations', icon: IconConfig, roles: [SUPER_ADMIN] },
  { path: '/prompts', label: 'Prompts', icon: IconPrompt, roles: [SUPER_ADMIN] },
  { path: '/policy-providers', label: 'Policy Providers', icon: IconShield, roles: [SUPER_ADMIN] },
  { path: '/run-workflow', label: 'Patient Lookup', icon: IconPlay, roles: [HOSPITAL_ADMIN] },
  // { path: '/logs', label: 'Logs', icon: IconLogs, roles: [SUPER_ADMIN] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user?.role)
  );

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        {!collapsed && <span className="sidebar__logo">OASYS</span>}
        {collapsed && <span className="sidebar__logo sidebar__logo--sm">O</span>}
      </div>

      <nav className="sidebar__nav">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="sidebar__icon" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        {!collapsed && user && (
          <div className="sidebar__user">
            <div className="sidebar__avatar">
              {user.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{user.email}</span>
              <span className="sidebar__user-role">{user.role?.replace('_', ' ')}</span>
            </div>
          </div>
        )}
        <button className="sidebar__link sidebar__logout" onClick={logout} title="Logout">
          <IconLogout className="sidebar__icon" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      <button className="sidebar__toggle" onClick={onToggle}>
        {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
      </button>
    </aside>
  );
}
