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
  IconClaimList,
  IconFormEdit,
  IconMail,
  IconQuery,
  IconLogs,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
} from './icons/Icons';
import oasysLogo from '../assets/oasys.svg';
import './Sidebar.scss';

const { SUPER_ADMIN, HOSPITAL_ADMIN } = ROLES;

const menuItems = [
  { path: '/', label: 'Dashboard', icon: IconDashboard, feature: 'dashboard', roles: [SUPER_ADMIN, HOSPITAL_ADMIN] },
  { path: '/hospitals', label: 'Hospitals', icon: IconHospital, feature: 'hospitals', roles: [SUPER_ADMIN] },
  { path: '/users', label: 'Users', icon: IconUsers, feature: 'users', roles: [SUPER_ADMIN] },
  { path: '/configurations', label: 'Configurations', icon: IconConfig, feature: 'configurations', roles: [SUPER_ADMIN] },
  { path: '/prompts', label: 'Prompts', icon: IconPrompt, feature: 'prompts', roles: [SUPER_ADMIN] },
  { path: '/summary-prompts', label: 'Summary Prompts', icon: IconPrompt, feature: 'summary_prompts', roles: [SUPER_ADMIN] },
  { path: '/policy-providers', label: 'Policy Providers', icon: IconShield, feature: 'policy_providers', roles: [SUPER_ADMIN] },
  { path: '/claim-list', label: 'PreAuth List', icon: IconClaimList, feature: 'preauth_list', roles: [HOSPITAL_ADMIN] },
  { path: '/query-management', label: 'Query Management', icon: IconQuery, feature: 'query_management', roles: [HOSPITAL_ADMIN] },
  { path: '/pre-auth', label: 'Pre Auth Form', icon: IconFormEdit, feature: 'preauth_form', roles: [HOSPITAL_ADMIN] },
  { path: '/manage-users', label: 'Manage Users', icon: IconUsers, feature: 'manage_users', roles: [HOSPITAL_ADMIN] },
  { path: '/hospital-info', label: 'Hospital Info', icon: IconHospital, feature: 'hospital_info', roles: [HOSPITAL_ADMIN] },
  // { path: '/run-workflow', label: 'Patient Lookup', icon: IconPlay, feature: 'run_workflow', roles: [HOSPITAL_ADMIN] },
  // { path: '/logs', label: 'Logs', icon: IconLogs, feature: 'logs', roles: [SUPER_ADMIN] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, hasFeature } = useAuth();

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user?.role) && hasFeature(item.feature)
  );

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img
          src={oasysLogo}
          alt="OASYS"
          className={`sidebar__logo-image ${collapsed ? 'sidebar__logo-image--collapsed' : ''}`}
        />
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
