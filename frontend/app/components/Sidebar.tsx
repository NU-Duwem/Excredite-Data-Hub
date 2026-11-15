'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

import { getRoleDisplayName } from '@/utils/roles';

const navItems = [
  {
    href: '/',
    label: 'Overview',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v2a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zm0 7a1 1 0 011-1h5a1 1 0 011 1v7a1 1 0 01-1 1h-5a1 1 0 01-1-1v-7zm-9 3a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" />
    ),
  },
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
    href: '/documents',
    label: 'Documents',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
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
    href: '/matters',
    label: 'Regulatory & Advisory Matters',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
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

// Pre-login screens render full-bleed, without the navigation tile.
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

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

  if (AUTH_ROUTES.includes(pathname)) {
    return null;
  }


  return (
    <aside
      className={`${collapsed ? 'w-[76px]' : 'w-64'} bg-surface rounded-2xl hidden md:flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out shadow-[0_1px_2px_rgba(10,58,34,0.06)]`}
    >
      {/* Brand */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-2 pt-5 pb-3' : 'justify-between px-5 pt-5 pb-3'} gap-2`}>
        <Link href="/" className="flex flex-col min-w-0" aria-label="Excredite Electricity Data Hub — Overview">
          {collapsed ? (
            <Image src="/excredite-mark.png" alt="" width={40} height={40} className="h-10 w-10" priority />
          ) : (
            <Image src="/excredite-wordmark.png" alt="" width={140} height={27} className="h-auto w-[140px]" priority />
          )}
          {!collapsed && (
            <span className="mt-1.5 text-[11px] font-semibold text-gray-600 tracking-wide">
              Electricity Data Hub
            </span>
          )}
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        className={`${collapsed ? 'mx-auto' : 'ml-auto mr-4'} mb-2 h-9 w-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900`}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>

      <nav aria-label="Main" className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => item.href !== '/admin' || userRole === 'power_admin')
          .map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex items-center justify-between ${collapsed ? 'px-0 justify-center' : 'px-3'} min-h-11 text-sm rounded-xl transition-colors duration-200 ${
                  isActive
                    ? 'bg-brand text-white font-semibold'
                    : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center min-w-0">
                  <svg
                    className={`shrink-0 h-5 w-5 ${collapsed ? '' : 'mr-3'} transition-colors duration-200 ${
                      isActive ? 'text-accent' : 'text-gray-500 group-hover:text-brand'
                    }`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </svg>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>

                {item.badge && alertCount > 0 && (
                  <span
                    aria-label={`${alertCount} open alerts`}
                    className={`inline-flex items-center justify-center font-bold leading-none bg-accent text-brand rounded-full ${
                      collapsed ? 'absolute top-1.5 right-2 h-2.5 w-2.5' : 'px-2 py-1 ml-2 text-[11px]'
                    }`}
                  >
                    {collapsed ? '' : alertCount}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>

      {/* Account */}
      <div className={`flex-shrink-0 flex flex-col ${collapsed ? 'p-2' : 'p-3'} gap-2`}>
        <div
          className={`flex items-center ${collapsed ? 'justify-center p-1' : 'p-2.5'} rounded-xl bg-gray-100`}
          title={collapsed ? `${userName} (${getRoleDisplayName(userRole)})` : undefined}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-brand text-sm font-bold leading-none">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
              <p className="text-[11px] font-medium text-gray-600 truncate">
                {getRoleDisplayName(userRole)}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} min-h-10 text-sm font-semibold text-red-700 hover:bg-red-50 rounded-xl transition-colors w-full`}
          aria-label={collapsed ? 'Log out' : undefined}
          title={collapsed ? 'Log out' : undefined}
        >
          <svg className={`${collapsed ? '' : 'mr-3'} h-4 w-4`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && 'Log out'}
        </button>
      </div>
    </aside>
  );
}
