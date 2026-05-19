import { NavLink, useLocation } from 'react-router-dom';
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
import oasysLogo from '../assets/oasys.png';
import './Sidebar.scss';

const { SUPER_ADMIN, HOSPITAL_ADMIN, INSURANCE_PROVIDER } = ROLES;

const menuItems = [
  { path: '/', label: 'Dashboard', icon: IconDashboard, feature: 'dashboard', roles: [SUPER_ADMIN, HOSPITAL_ADMIN] },
  { path: '/hospitals', label: 'Hospitals', icon: IconHospital, feature: 'hospitals', roles: [SUPER_ADMIN] },
  { path: '/users', label: 'Users', icon: IconUsers, feature: 'users', roles: [SUPER_ADMIN] },
  { path: '/configurations', label: 'Configurations', icon: IconConfig, feature: 'configurations', roles: [SUPER_ADMIN] },
  { path: '/prompts', label: 'Prompts', icon: IconPrompt, feature: 'prompts', roles: [SUPER_ADMIN] },
  { path: '/summary-prompts', label: 'Summary Prompts', icon: IconPrompt, feature: 'summary_prompts', roles: [SUPER_ADMIN] },
  { path: '/policy-providers', label: 'Policy Providers', icon: IconShield, feature: 'policy_providers', roles: [SUPER_ADMIN] },
  { path: '/claim-list', label: 'PreAuth List', icon: IconClaimList, feature: 'preauth_list', roles: [HOSPITAL_ADMIN] },
  { path: '/claims', label: 'Claims', icon: IconClaimList, feature: 'preauth_list', roles: [HOSPITAL_ADMIN] },
  { path: '/query-management', label: 'Email Inbox', icon: IconQuery, feature: 'query_management', roles: [HOSPITAL_ADMIN] },
  { path: '/pre-auth', label: 'Pre Auth Form', icon: IconFormEdit, feature: 'preauth_form', roles: [HOSPITAL_ADMIN] },
  { path: '/manage-users', label: 'Manage Users', icon: IconUsers, feature: 'manage_users', roles: [HOSPITAL_ADMIN] },
  { path: '/hospital-info', label: 'Hospital Info', icon: IconHospital, feature: 'hospital_info', roles: [HOSPITAL_ADMIN] },
  { path: '/claim-list', label: 'Pre Auth', icon: IconClaimList, roles: [INSURANCE_PROVIDER], activePaths: ['/claim-list', '/provider-queue'] },
  // { path: '/run-workflow', label: 'Patient Lookup', icon: IconPlay, feature: 'run_workflow', roles: [HOSPITAL_ADMIN] },
  // { path: '/logs', label: 'Logs', icon: IconLogs, feature: 'logs', roles: [SUPER_ADMIN] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, hasFeature } = useAuth();
  const location = useLocation();

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user?.role) && hasFeature(item.feature)
  );

  const isItemActive = (item) => {
    const paths = item.activePaths;
    if (!paths) return null; // let NavLink handle it
    return paths.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <img
          src={oasysLogo}
          alt="OASYS"
          className={`sidebar__logo-image ${collapsed ? 'sidebar__logo-image--collapsed' : ''}`}
        />
      </div>

      <button
        className="sidebar__toggle"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <span style={{ display: 'inline-flex', marginRight: -6 }}><IconChevronRight size={14} /><IconChevronRight size={14} /></span>
          : <span style={{ display: 'inline-flex', marginRight: -6 }}><IconChevronLeft size={14} /><IconChevronLeft size={14} /></span>}
      </button>

      <nav className="sidebar__nav">
        {filteredItems.map((item) => {
          const override = isItemActive(item);
          return (
            <NavLink
              key={`${item.path}-${item.label}`}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => {
                const active = override !== null ? override : isActive;
                return `sidebar__link ${active ? 'sidebar__link--active' : ''}`;
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="sidebar__icon" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
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
    </aside>
  );
}
