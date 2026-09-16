import { useEffect,useState,type ReactNode } from 'react';
import { NavLink,useLocation,useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Gauge, LogOut, ServerCog, ShieldCheck, Users } from 'lucide-react';
import { api } from '../services/api';
import type { AdminUser } from '../types';
import { useAppUI } from './AppUI';

type MenuItem={to:string;label:string;permission?:string;icon:ReactNode;end?:boolean};
const setup:MenuItem[]=[
  {to:'/admin/maximo-environments',label:'Maximo API Endpoint',permission:'maximoEnvironments',icon:<ServerCog size={17}/>},
  {to:'/admin/roles',label:'Roles',permission:'roles',icon:<ShieldCheck size={17}/>},
  {to:'/admin/users',label:'Users',permission:'users',icon:<Users size={17}/>}
];
const monitoring:MenuItem[]=[{to:'/admin/api-logs',label:'API Request Log',permission:'apiLogs',icon:<Activity size={17}/>}];

export function AdminLayout({permission,eyebrow,title,subtitle,children}:{permission?:string;eyebrow:string;title:string;subtitle?:ReactNode;children:ReactNode}){
  const [user,setUser]=useState<AdminUser|null>(null),[denied,setDenied]=useState(false);
  const nav=useNavigate(),loc=useLocation(),ui=useAppUI();
  useEffect(()=>{api<{user:AdminUser}>('/api/auth?action=me',{cache:'no-store'}).then(b=>{if(permission&&!b.user.permissions?.[permission])setDenied(true);else setUser(b.user)}).catch(()=>nav(`/login?next=${encodeURIComponent(loc.pathname+loc.search)}`));},[permission]);
  if(denied)return <main className="page-shell"><section className="state-card error"><h2>Access denied</h2><p>Your role does not have permission to open this page.</p><a className="secondary-button" href="/admin">Back</a></section></main>;
  if(!user)return <main className="page-shell"><section className="state-card"><span className="spinner"/> Loading administration…</section></main>;
  const allowed=(x:MenuItem)=>!x.permission||user.permissions?.[x.permission];
  const logout=async()=>{if(await ui.confirm({title:'Sign out?',message:'Your administration session will be closed.',confirmText:'Sign Out'})){await fetch('/api/auth?action=logout',{method:'POST'});nav('/login')}};
  const group=(label:string,items:MenuItem[])=><div className="nav-group"><div className="nav-group-title"><span>{label}</span><ChevronDown size={14}/></div>{items.filter(allowed).map(x=><NavLink key={x.to} to={x.to} end={x.end}><span className="nav-icon">{x.icon}</span><span>{x.label}</span></NavLink>)}</div>;
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="admin-brand"><span className="admin-brand-icon"><ServerCog size={20}/></span><span>Asset Viewer <small>Admin Console</small></span></div><nav className="admin-nav"><NavLink to="/admin" end><span className="nav-icon"><Gauge size={17}/></span><span>Dashboards</span></NavLink>{group('Setup',setup)}{group('Monitoring',monitoring)}</nav><button onClick={logout} className="sidebar-signout"><LogOut size={17}/>Sign Out</button></aside><main className="admin-main"><div className="admin-topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle&&<p className="subtitle">{subtitle}</p>}</div><span className="admin-user-chip">{user.name} <small>{user.role}</small></span></div>{children}</main></div>
}
