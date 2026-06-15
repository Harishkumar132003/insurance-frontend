import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
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
  IconSparkles,
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
  // activePaths so isItemActive() can decide highlighting on /claim/:id
  // (the Raise Claim page), which doesn't start with /claim-list.
  { path: '/claim-list', label: 'PreAuth List', icon: IconClaimList, feature: 'preauth_list', roles: [HOSPITAL_ADMIN], activePaths: ['/claim-list'] },
  // /claims/:id is also used as the detail view when drilling in from the
  // Raise Invoice tab — the active-state logic below uses location.state.from
  // to decide which of these two items should light up.
  { path: '/claims', label: 'Claims', icon: IconClaimList, feature: 'preauth_list', roles: [HOSPITAL_ADMIN], activePaths: ['/claims'] },
  // activePaths is intentionally only ['/invoices'] — the /claims/:id branch
  // in isItemActive() below handles the case where the user drilled into a
  // case from this tab via location.state.from.
  // { path: '/invoices', label: 'Raise Invoice', icon: IconClaimList, roles: [HOSPITAL_ADMIN], activePaths: ['/invoices'] },
  { path: '/query-management', label: 'Email Inbox', icon: IconQuery, feature: 'query_management', roles: [HOSPITAL_ADMIN], hasUnreadIndicator: true },
  { path: '/ai-assistant', label: 'AI Assistant', icon: IconSparkles, roles: [HOSPITAL_ADMIN] },
  { path: '/settlements', label: 'Settlements', icon: IconClaimList, roles: [HOSPITAL_ADMIN], activePaths: ['/settlements'] },
  { path: '/pre-auth', label: 'Pre Auth Form', icon: IconFormEdit, feature: 'preauth_form', roles: [HOSPITAL_ADMIN] },
  { path: '/manage-users', label: 'Manage Users', icon: IconUsers, feature: 'manage_users', roles: [HOSPITAL_ADMIN] },
  { path: '/provider-onboarding', label: 'Provider Onboarding', icon: IconShield, roles: [HOSPITAL_ADMIN] },
  { path: '/hospital-info', label: 'Hospital Info', icon: IconHospital, feature: 'hospital_info', roles: [HOSPITAL_ADMIN] },
  { path: '/claim-list', label: 'Pre Auth', icon: IconClaimList, roles: [INSURANCE_PROVIDER], activePaths: ['/claim-list', '/provider-queue'] },
  { path: '/claims', label: 'Claims', icon: IconClaimList, roles: [INSURANCE_PROVIDER], activePaths: ['/claims'] },
  // { path: '/run-workflow', label: 'Patient Lookup', icon: IconPlay, feature: 'run_workflow', roles: [HOSPITAL_ADMIN] },
  // { path: '/logs', label: 'Logs', icon: IconLogs, feature: 'logs', roles: [SUPER_ADMIN] },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, hasFeature } = useAuth();
  const location = useLocation();
  // Unread counts keyed by route path. Sourced from NotificationsContext,
  // which fetches an initial count on mount and bumps it via SSE when a new
  // RECEIVED email lands. Non-hospital-admin roles get 0 (no provider work).
  const { unreadCount } = useNotifications();
  const unreadByPath = { '/query-management': unreadCount };

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user?.role) && hasFeature(item.feature)
  );

  const isItemActive = (item) => {
    const paths = item.activePaths;
    if (!paths) return null; // let NavLink handle it

    // The provider "Pre Auth" and "Claims" tabs both drill into
    // /provider-queue/:id, so the URL alone can't tell them apart. Use the
    // route we navigated from (set via location.state.from on the card click)
    // to highlight the correct tab. On a hard reload (no state) we fall back
    // to "Pre Auth".
    if (location.pathname.startsWith('/provider-queue')) {
      const cameFromClaims = location.state?.from === '/claims';
      if (item.path === '/claims') return cameFromClaims;
      if (item.path === '/claim-list') return !cameFromClaims;
    }

    // /claims/:id is shared between the Claims tracker and the Raise Invoice
    // drill-down. `state.from` (set on card click + carried through any
    // /claim/:id round-trip) tells us which sidebar item to light up — any
    // path that starts with `/invoices` counts as the Raise Invoice trail.
    if (location.pathname.startsWith('/claims/')) {
      const cameFromInvoices = typeof location.state?.from === 'string'
        && location.state.from.startsWith('/invoices');
      if (item.path === '/invoices') return cameFromInvoices;
      if (item.path === '/claims') return !cameFromInvoices;
      if (item.path === '/claim-list') return false;
    }

    // /claim/:id (Raise Claim / View Claim page) — reached from a case detail
    // page, which itself may have been reached from /invoices. We get:
    //   state.from   = '/claims/:id' or '/claim-list/:id'  (the detail page)
    //   state.origin = '/invoices'   (when the detail page came from Invoices)
    // Light up whichever tab is the *root* of the trail. Fall back to
    // PreAuth List on hard reload / deep link (no state).
    if (location.pathname.startsWith('/claim/')) {
      const from = location.state?.from;
      const origin = location.state?.origin;
      const cameFromInvoices = typeof origin === 'string' && origin.startsWith('/invoices');
      const cameFromClaimsTracker = !cameFromInvoices
        && typeof from === 'string' && from.startsWith('/claims/');
      const cameFromPreAuthList = !cameFromInvoices && !cameFromClaimsTracker;
      if (item.path === '/invoices') return cameFromInvoices;
      if (item.path === '/claims') return cameFromClaimsTracker;
      if (item.path === '/claim-list') return cameFromPreAuthList;
    }

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
              {item.hasUnreadIndicator && unreadByPath[item.path] > 0 && (
                <span className="sidebar__unread-badge" aria-label={`${unreadByPath[item.path]} unread`}>
                  {unreadByPath[item.path] > 99 ? '99+' : unreadByPath[item.path]}
                </span>
              )}
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
