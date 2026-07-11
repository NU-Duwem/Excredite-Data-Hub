'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const roleDisplayNames: Record<string, string> = {
  power_admin: 'System Admin',
  power_ceo: 'Chief Executive',
  power_legal: 'Legal Expert',
  power_analyst: 'Research Analyst',
  power_app: 'IT Expert',
  power_ingestion: 'Ingestion Operator',
  power_team: 'Team Member',
};

const modulesList = [
  { id: 'query', name: 'AI Query Interface', path: '/query' },
  { id: 'history', name: 'Conversation History', path: '/history' },
  { id: 'briefing', name: 'Briefing Notes', path: '/briefing' },
  { id: 'alerts', name: 'Anomaly Alerts', path: '/alerts' },
  { id: 'documents', name: 'Documents Manager', path: '/documents' },
  { id: 'forecasts', name: 'Forecasts & Models', path: '/forecasts' },
  { id: 'matters', name: 'Legal Matters Monitor', path: '/matters' },
];

// Initial mock permission matrix (Role -> Modules they can access)
const initialPermissions: Record<string, string[]> = {
  power_admin: ['query', 'history', 'briefing', 'alerts', 'documents', 'forecasts', 'matters'],
  power_ceo: ['query', 'history', 'briefing', 'alerts', 'documents', 'forecasts', 'matters'],
  power_legal: ['query', 'history', 'matters'],
  power_analyst: ['query', 'history', 'briefing', 'alerts', 'documents', 'forecasts'],
  power_app: ['query', 'history', 'briefing', 'alerts', 'documents', 'forecasts', 'matters'],
  power_ingestion: ['query', 'history', 'documents'],
  power_team: ['query', 'history', 'briefing'],
};

export default function AdminPanelPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  
  // States for Duty/Role Management
  const [editRole, setEditRole] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  
  // Permissions Matrix State
  const [permissions, setPermissions] = useState<Record<string, string[]>>(initialPermissions);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const checkAdminAndFetchUsers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
      if (!profile || profile.role !== 'power_admin') {
        // Not admin, redirect to query page
        router.push('/query');
        return;
      }
      
      setIsAdmin(true);
      
      const { data: userList } = await supabase
        .from('user_profiles')
        .select('*')
        .order('full_name', { ascending: true });
        
      setUsers(userList || []);
      setLoading(false);
    };
    
    checkAdminAndFetchUsers();
  }, [supabase, router]);

  const selectUser = (user: any) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditIsActive(user.is_active);
    setStatusMessage({ text: '', type: '' });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setStatusMessage({ text: 'Saving changes...', type: 'info' });
    
    // Simulate updating in DB (for visual demo, updates local state)
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: editRole, is_active: editIsActive } : u));
    setSelectedUser(prev => ({ ...prev, role: editRole, is_active: editIsActive }));
    
    setTimeout(() => {
      setStatusMessage({ text: 'User permissions and role updated successfully! (Staged in UI)', type: 'success' });
    }, 800);
  };

  const handleTogglePermission = (role: string, moduleId: string) => {
    setPermissions(prev => {
      const current = prev[role] || [];
      const updated = current.includes(moduleId)
        ? current.filter(id => id !== moduleId)
        : [...current, moduleId];
      return { ...prev, [role]: updated };
    });
    
    setStatusMessage({ text: `Updated access permissions for ${roleDisplayNames[role]} role.`, type: 'success' });
    setTimeout(() => setStatusMessage({ text: '', type: '' }), 3000);
  };

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Operations Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Manage user directory access, roles, and duty distribution matrix.</p>
        </div>

        {/* Top Status Banner */}
        {statusMessage.text && (
          <div className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
            statusMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {statusMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* User Directory Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50/50">
                <div>
                  <h2 className="text-base font-bold text-gray-900">User Directory</h2>
                  <p className="text-xs text-gray-500">List of registered Excredite Power Data Hub users</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                  />
                  <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm divide-y divide-gray-200">
                  <thead className="bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Full Name</th>
                      <th className="px-6 py-3">Email Address</th>
                      <th className="px-6 py-3">Assigned Role</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {filteredUsers.map((user) => (
                      <tr 
                        key={user.id} 
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedUser?.id === user.id ? 'bg-brand/5' : ''}`}
                        onClick={() => selectUser(user)}
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {user.full_name || 'System Account'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-mono text-xs">
                          {user.email}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                            user.role === 'power_admin' ? 'bg-red-50 text-red-800' :
                            user.role === 'power_ceo' ? 'bg-purple-50 text-purple-800' :
                            user.role === 'power_legal' ? 'bg-blue-50 text-blue-800' :
                            user.role === 'power_analyst' ? 'bg-emerald-50 text-emerald-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {roleDisplayNames[user.role] || user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            {user.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={(e) => { e.stopPropagation(); selectUser(user); }}
                            className="text-xs text-brand hover:underline font-bold"
                          >
                            Configure
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                          No users found matching "{searchQuery}"
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Duty Distribution & Module Permissions Matrix */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-base font-bold text-gray-900">Role Permissions Matrix</h2>
                <p className="text-xs text-gray-500">Configure what modules and features are accessible by each role group.</p>
              </div>
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-3 text-xs font-bold text-gray-500 uppercase">System Module</th>
                      {Object.keys(roleDisplayNames).map(roleKey => (
                        <th key={roleKey} className="pb-3 px-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          {roleDisplayNames[roleKey].split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {modulesList.map((mod) => (
                      <tr key={mod.id} className="hover:bg-gray-50/50">
                        <td className="py-3 font-semibold text-gray-900 text-xs">
                          {mod.name}
                          <span className="block text-[10px] text-gray-400 font-normal">{mod.path}</span>
                        </td>
                        {Object.keys(roleDisplayNames).map(roleKey => {
                          const isAllowed = permissions[roleKey]?.includes(mod.id);
                          return (
                            <td key={roleKey} className="py-3 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={isAllowed || false}
                                onChange={() => handleTogglePermission(roleKey, mod.id)}
                                disabled={roleKey === 'power_admin'} // Admin has absolute access
                                className="h-4 w-4 text-brand focus:ring-brand border-gray-300 rounded disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Configuration Form Column */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-gray-900 mb-2">Duty & Role Configuration</h3>
              {selectedUser ? (
                <form onSubmit={handleUpdateUser} className="space-y-5">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">Editing Profile</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">{selectedUser.full_name || 'System Account'}</p>
                    <p className="text-xs text-gray-600 font-mono mt-0.5">{selectedUser.email}</p>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                      Assigned Security Role
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                    >
                      {Object.entries(roleDisplayNames).map(([key, value]) => (
                        <option key={key} value={key}>{value} ({key})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                      Account Status
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditIsActive(true)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-all ${
                          editIsActive 
                            ? 'bg-green-50 border-green-300 text-green-700 font-bold' 
                            : 'bg-white border-gray-200 text-gray-600'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        disabled={selectedUser.role === 'power_admin'} // Prevent self-suspension
                        onClick={() => setEditIsActive(false)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          !editIsActive 
                            ? 'bg-red-50 border-red-300 text-red-700 font-bold' 
                            : 'bg-white border-gray-200 text-gray-600'
                        }`}
                      >
                        Suspended
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full bg-brand text-white py-2 rounded-lg text-sm font-bold shadow-md hover:bg-[#a38020] transition-colors"
                    >
                      Save Configuration
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
                  <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs font-semibold">No User Selected</p>
                  <p className="text-[10px] text-gray-400 mt-1 max-w-[200px] mx-auto">Select a user from the directory to configure their active duties and role level.</p>
                </div>
              )}
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2.5">
                <button 
                  onClick={() => router.push('/query')}
                  className="w-full text-left py-2 px-3 hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-between transition-colors"
                >
                  Go to AI Query Dashboard
                  <span className="text-gray-400">→</span>
                </button>
                <button 
                  onClick={() => router.push('/profile')}
                  className="w-full text-left py-2 px-3 hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-between transition-colors"
                >
                  Manage My Settings
                  <span className="text-gray-400">→</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </main>
  );
}
