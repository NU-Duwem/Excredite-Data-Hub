'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('User');
  const [newPassword, setNewPassword] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
        setUserEmail(user.email || '');
        setUserRole(user.user_metadata?.role || 'power_analyst');
      } else {
        router.push('/login');
      }
      setLoading(false);
    };
    fetchUser();
  }, [supabase, router]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    
    setUpdateStatus('Updating...');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      setUpdateStatus('Error: ' + error.message);
    } else {
      setUpdateStatus('Password updated successfully!');
      setNewPassword('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const initials = userName
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your profile and security preferences.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Overview */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
              <div className="mx-auto h-20 w-20 rounded-full bg-brand flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-inner">
                {initials}
              </div>
              <h2 className="text-lg font-bold text-gray-900">{userName}</h2>
              <p className="text-sm text-gray-500 mb-6">{userEmail}</p>
              
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold uppercase tracking-wider">
                {userRole.replace('_', ' ')}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <button 
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 border border-red-100 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Session Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Joined</span>
                  <span className="text-gray-900 font-medium">{new Date(user?.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Auth Method</span>
                  <span className="text-gray-900 font-medium">Supabase Auth</span>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Security Section */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-base font-bold text-gray-900">Security & Privacy</h3>
                <p className="text-xs text-gray-500">Keep your account secure with a strong password.</p>
              </div>
              <div className="p-6">
                <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                      New Password
                    </label>
                    <input 
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent transition-all outline-none"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-[#a38020] transition-colors"
                  >
                    Update Password
                  </button>
                  {updateStatus && (
                    <p className={`text-xs mt-2 font-medium ${updateStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                      {updateStatus}
                    </p>
                  )}
                </form>
              </div>
            </section>

            {/* Notifications Section (Mock) */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-base font-bold text-gray-900">Notification Preferences</h3>
                <p className="text-xs text-gray-500">Manage how you receive alerts and summaries.</p>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { id: 'n1', label: 'Email Anomaly Alerts', desc: 'Get notified immediately when grid anomalies are detected.' },
                  { id: 'n2', label: 'Weekly Briefing Digest', desc: 'Receive a summary of sector performance every Monday.' },
                  { id: 'n3', label: 'Legal Matter Updates', desc: 'Notifications for upcoming deadlines in your matters.' },
                ].map((item) => (
                  <div key={item.id} className="flex items-start">
                    <div className="flex items-center h-5">
                      <input 
                        id={item.id}
                        type="checkbox"
                        defaultChecked
                        className="h-4 w-4 text-brand focus:ring-brand border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-3 text-sm">
                      <label htmlFor={item.id} className="font-bold text-gray-900">{item.label}</label>
                      <p className="text-gray-500 text-xs">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity (Mock) */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-base font-bold text-gray-900">Recent Activity</h3>
                <p className="text-xs text-gray-500">A log of your recent interactions with the hub.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { action: 'AI Query', target: 'Latest tariff orders for IBEDC', time: '2 hours ago' },
                  { action: 'Briefing Generated', target: 'Grid Performance Q1 2026', time: '5 hours ago' },
                  { action: 'Document Uploaded', target: 'NERC_Enforcement_EGBIN.pdf', time: 'Yesterday' },
                  { action: 'Login', target: 'Successful login from Abuja, NG', time: 'Yesterday' },
                ].map((activity, idx) => (
                  <div key={idx} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">{activity.target}</p>
                    </div>
                    <span className="text-[10px] font-medium text-gray-400 uppercase">{activity.time}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
