'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

const roleDisplayNames: Record<string, string> = {
  power_admin: 'System Admin',
  power_ceo: 'CEO',
  power_legal: 'Legal Expert',
  power_analyst: 'Research Analyst',
  power_app: 'IT Expert',
  power_ingestion: 'Ingestion Operator',
  power_team: 'Team Member',
  power_ai: 'AI Assistant',
};

const navItems = [
  {
    href: '/query',
    label: 'AI Query Interface',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    ),
  },
  {
    href: '/history',
    label: 'Conversation History',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  {
    href: '/alerts',
    label: 'Anomaly Alerts',
    badge: true,
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    ),
  },
  {
    href: '/documents',
    label: 'Documents',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    ),
  },
  {
    href: '/forecasts',
    label: 'Forecasts',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    ),
  },
  {
    href: '/matters',
    label: 'Legal Matters',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    ),
  },
  {
    href: '/news',
    label: 'News & Updates',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    ),
  },
  {
    href: '/admin',
    label: 'Admin Panel',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    ),
  },
  {
    href: '/profile',
    label: 'Profile & Settings',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('User');
  const [userInitials, setUserInitials] = useState('U');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const supabase = createClient();

  // Restore collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };
  
  useEffect(() => {
    const getUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use full_name from user_metadata or fallback to email
        const fullName = (user.user_metadata?.full_name || user.email?.split('@')[0] || 'User').trim();
        setUserName(fullName);
        
        // Generate initials
        const initials = fullName
          .split(/\s+/)
          .map((n: string) => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2);
        setUserInitials(initials || 'U');

        // Fetch user role from user_profiles in DB for reliability
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setUserRole(profile.role);
        } else {
          setUserRole(user.user_metadata?.role || 'power_team');
        }
      }
    };

    const getAlertCount = async () => {
      const { count } = await supabase
        .from('anomaly_alerts')
        .select('*', { count: 'exact', head: true })
        .in('status', ['UNREVIEWED', 'ASSIGNED']);
      
      setAlertCount(count || 0);

      // Realtime subscription
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'anomaly_alerts'
          },
          () => {
            getAlertCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    getUserData();
    getAlertCount();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (pathname === '/login') {
    return null;
  }

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-52'} bg-white border-r border-gray-200 hidden md:flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out`}
    >
      {/* Header with logo + brand */}
      <div className={`${collapsed ? 'h-20' : 'h-32'} flex flex-col items-center justify-center gap-1 px-2 border-b border-gray-200 text-center relative transition-all duration-300`}>
        <Image
          src="/Excredite_logo.png"
          alt="Excredite Electricity Data Hub logo"
          width={collapsed ? 36 : 88}
          height={collapsed ? 36 : 88}
          className="object-contain shrink-0 transition-all duration-300"
          style={{ height: 'auto' }}
          priority
        />
        {!collapsed && (
          <span className="max-w-40 text-xs font-bold leading-tight text-gray-900 tracking-tight uppercase">
            Electricity Data Hub
          </span>
        )}
      </div>

      {/* Collapse toggle button */}
      <button
        onClick={toggleCollapsed}
        className="mx-auto my-2 p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
      
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => item.href !== '/admin' || userRole === 'power_admin')
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center justify-between ${collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2'} text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'text-gray-900 bg-gray-100'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center">
                  <svg
                    className={`shrink-0 h-5 w-5 ${collapsed ? '' : 'mr-3'} ${
                      isActive ? 'text-gray-500' : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {item.icon}
                  </svg>
                  {!collapsed && item.label}
                </div>
                
                {item.badge && alertCount > 0 && (
                  <span className={`inline-flex items-center justify-center ${collapsed ? 'absolute top-0.5 right-0.5' : 'px-2 py-0.5 ml-2'} text-[10px] font-bold leading-none text-white bg-red-600 rounded-full ${collapsed ? 'h-4 w-4' : ''}`}>
                    {collapsed ? '' : alertCount}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>
      
      <div className={`flex-shrink-0 flex flex-col border-t border-gray-200 ${collapsed ? 'p-2' : 'p-4'} gap-4`}>
        {collapsed ? (
          /* Collapsed: just avatar */
          <div className="flex items-center justify-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white text-sm font-bold shadow-sm leading-none" title={`${userName} (${roleDisplayNames[userRole || ''] || 'Loading...'})`}>
              {userInitials}
            </div>
          </div>
        ) : (
          /* Expanded: avatar + name */
          <div className="flex items-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white text-sm font-bold shadow-sm leading-none">
              {userInitials}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                {roleDisplayNames[userRole || ''] || 'Loading...'}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-md transition-colors w-full border border-red-100`}
          title={collapsed ? 'Logout' : undefined}
        >
          <svg className={`${collapsed ? '' : 'mr-3'} h-4 w-4`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && 'LOGOUT'}
        </button>
      </div>
    </aside>
  );
}
