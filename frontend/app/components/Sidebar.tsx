'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

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
    href: '/briefing',
    label: 'Briefing Notes',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  
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
      }
    };

    const getAlertCount = async () => {
      // In a real scenario, this would query unreviewed alerts
      const { count } = await supabase
        .from('anomaly_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'UNREVIEWED');
      
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
    <aside className="w-52 bg-white border-r border-gray-200 hidden md:flex flex-col h-full shrink-0">
      <div className="h-28 flex flex-col items-center justify-center gap-1 px-4 border-b border-gray-200 text-center">
        <Image
          src="/Excredite_logo.png"
          alt="Excredite Power Data logo"
          width={72}
          height={72}
          className="object-contain shrink-0"
          style={{ height: 'auto' }}
          priority
        />
        <span className="max-w-40 text-xs font-bold leading-tight text-gray-900 tracking-tight uppercase">
          Power Data Hub
        </span>
      </div>
      
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'text-gray-900 bg-gray-100'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center">
                <svg
                  className={`mr-3 shrink-0 h-5 w-5 ${
                    isActive ? 'text-gray-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {item.icon}
                </svg>
                {item.label}
              </div>
              
              {item.badge && alertCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 ml-2 text-[10px] font-bold leading-none text-white bg-red-600 rounded-full">
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      
      <div className="flex-shrink-0 flex flex-col border-t border-gray-200 p-4 gap-4">
        <div className="flex items-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white text-sm font-bold shadow-sm leading-none">
            {userInitials}
          </div>
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Internal Admin</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-md transition-colors w-full border border-red-100"
        >
          <svg className="mr-3 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          LOGOUT
        </button>
      </div>
    </aside>
  );
}
