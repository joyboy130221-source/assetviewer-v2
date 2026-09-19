import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  KeyRound,
  Building2,
  ChevronDown,
  ExternalLink,
  Gauge,
  LogOut,
  ServerCog,
  ShieldCheck,
  Users,
  Workflow,
  History,
} from "lucide-react";
import { api } from "../services/api";
import type { AdminUser } from "../types";
import { useAppUI } from "./AppUI";

type MenuItem = {
  to: string;
  label: string;
  permission?: string;
  icon: ReactNode;
  end?: boolean;
};

const setup: MenuItem[] = [
  {
    to: "/admin/organizations",
    label: "Organizations / Tenants",
    permission: "organizations",
    icon: <Building2 size={17} />,
  },
  {
    to: "/admin/maximo-environments",
    label: "Maximo API Endpoint",
    permission: "maximoEnvironments",
    icon: <ServerCog size={17} />,
  },
  {
    to: "/admin/external-views",
    label: "External View",
    permission: "externalViews",
    icon: <ExternalLink size={17} />,
  },
  {
    to: "/admin/roles",
    label: "Roles",
    permission: "roles",
    icon: <ShieldCheck size={17} />,
  },
  {
    to: "/admin/users",
    label: "Users",
    permission: "users",
    icon: <Users size={17} />,
  },
];
const integration: MenuItem[] = [
  {
    to: "/admin/authentication-profiles",
    label: "Authentication Profiles",
    permission: "authenticationProfiles",
    icon: <KeyRound size={17} />,
  },
  {
    to: "/admin/integration/form-builder",
    label: "Form Builder Wizards",
    permission: "formBuilder",
    icon: <Workflow size={17} />,
  },
];
const monitoring: MenuItem[] = [
  {
    to: "/admin/workflow-executions",
    label: "Workflow Executions",
    permission: "workflowExecutions",
    icon: <History size={17} />,
  },
  {
    to: "/admin/api-logs",
    label: "API Request Log",
    permission: "apiLogs",
    icon: <Activity size={17} />,
  },
];

export function AdminLayout({
  permission,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  permission?: string;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [denied, setDenied] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useAppUI();

  useEffect(() => {
    api<{ user: AdminUser }>("/api/auth/me", { cache: "no-store" })
      .then((body) => {
        if (permission && !body.user.permissions?.[permission]) setDenied(true);
        else setUser(body.user);
      })
      .catch(() =>
        navigate(
          `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
        ),
      );
  }, [permission]);

  if (denied)
    return (
      <main className="page-shell">
        <section className="state-card error">
          <h2>Access denied</h2>
          <p>Your role does not have permission to open this page.</p>
          <a className="secondary-button" href="/admin">
            Back
          </a>
        </section>
      </main>
    );
  if (!user)
    return (
      <main className="page-shell">
        <section className="state-card">
          <span className="spinner" /> Loading administration…
        </section>
      </main>
    );

  const allowed = (item: MenuItem) =>
    !item.permission || user.permissions?.[item.permission];
  const logout = async () => {
    if (
      await ui.confirm({
        title: "Sign out?",
        message: "Your administration session will be closed.",
        confirmText: "Sign Out",
      })
    ) {
      await fetch("/api/auth/logout", { method: "POST" });
      navigate("/login");
    }
  };
  const group = (label: string, items: MenuItem[]) => {
    const collapsed = Boolean(collapsedGroups[label]);
    return (
      <div className={`nav-group ${collapsed ? "collapsed" : ""}`}>
        <button
          type="button"
          className="nav-group-title"
          aria-expanded={!collapsed}
          onClick={() =>
            setCollapsedGroups((current) => ({
              ...current,
              [label]: !current[label],
            }))
          }
        >
          <span>{label}</span>
          <ChevronDown className="nav-group-chevron" size={14} />
        </button>
        {!collapsed &&
          items.filter(allowed).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
      </div>
    );
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-icon">
            <ServerCog size={20} />
          </span>
          <span>
            Integration Hub <small>Admin Console</small>
          </span>
        </div>
        <nav className="admin-nav">
          <NavLink to="/admin" end>
            <span className="nav-icon">
              <Gauge size={17} />
            </span>
            <span>Dashboards</span>
          </NavLink>
          {group("Setup", setup)}
          {group("Integration", integration)}
          {group("Monitoring", monitoring)}
        </nav>
        <button onClick={logout} className="sidebar-signout">
          <LogOut size={17} />
          Sign Out
        </button>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {subtitle && <p className="subtitle">{subtitle}</p>}
          </div>
          <span className="admin-user-chip">
            {user.name} <small>{user.role}</small>
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
