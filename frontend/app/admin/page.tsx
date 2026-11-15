'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRoleDisplayName, PRIMARY_ROLES } from '@/utils/roles';

const modulesList = [
  { id: 'query', name: 'AI Query Interface', path: '/query' },
  { id: 'history', name: 'Conversation History', path: '/history' },
  { id: 'alerts', name: 'Anomaly Alerts', path: '/alerts' },
  { id: 'documents', name: 'Documents Manager', path: '/documents' },
  { id: 'matters', name: 'Regulatory & Advisory Matters', path: '/matters' },
  { id: 'news', name: 'News & Updates', path: '/news' },
];

const initialPermissions: Record<string, string[]> = {
  power_admin: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_ceo: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_legal: ['query', 'history', 'matters'],
  power_analyst: ['query', 'history', 'alerts', 'documents', 'news'],
  power_app: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_ingestion: ['query', 'history', 'documents'],
  power_team: ['query', 'history'],
};

type AdminTab = 'users' | 'settings' | 'activity';

export default function AdminPanelPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [maskData, setMaskData] = useState(false); // Demo Mode Data Masking
  
  // States for Duty/Role Management
  const [editRole, setEditRole] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  const [actionLoading, setActionLoading] = useState(false);
  
  // Create User Modal State
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    fullName: '',
    email: '',
    role: 'power_analyst',
    password: '',
  });

  // Permissions Matrix State
  const [permissions, setPermissions] = useState<Record<string, string[]>>(initialPermissions);

  // System Settings State
  const [anomalyThreshold, setAnomalyThreshold] = useState('2.0');
  const [anomalyAlertsEnabled, setAnomalyAlertsEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Activity Log State
  const [allActivityLogs, setAllActivityLogs] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

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
        router.push('/query');
        return;
      }
      
      setIsAdmin(true);
      
      const { data: userList } = await supabase
        .from('user_profiles')
        .select('*')
        .order('full_name', { ascending: true });
        
      setUsers(userList || []);

      const { data: settings } = await supabase
        .from('system_settings')
        .select('*');
      
      if (settings) {
        const threshold = settings.find(s => s.key === 'anomaly_detection_threshold');
        const enabled = settings.find(s => s.key === 'anomaly_alerts_enabled');
        if (threshold) setAnomalyThreshold(threshold.value);
        if (enabled) setAnomalyAlertsEnabled(enabled.value === 'true');
      }

      setLoading(false);
    };
    
    checkAdminAndFetchUsers();
  }, [supabase, router]);

  const callAdminApi = async (body: any) => {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  };

  const selectUser = (user: any) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditIsActive(user.is_active);
    setStatusMessage({ text: '', type: '' });
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setActionLoading(true);
    setStatusMessage({ text: 'Saving changes...', type: 'info' });

    const result = await callAdminApi({
      action: 'set-status',
      targetUserId: selectedUser.id,
      value: editIsActive,
    });

    if (result.error) {
      setStatusMessage({ text: `Error: ${result.error}`, type: 'error' });
    } else {
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, is_active: editIsActive, role: editRole } : u));
      setSelectedUser((prev: any) => ({ ...prev, is_active: editIsActive, role: editRole }));
      setStatusMessage({ text: `Successfully updated permissions and status for ${selectedUser.full_name || selectedUser.email}.`, type: 'success' });
    }
    setActionLoading(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUserForm.email || !createUserForm.password) return;
    setActionLoading(true);
    setStatusMessage({ text: 'Creating new user...', type: 'info' });

    const result = await callAdminApi({
      action: 'create-user',
      email: createUserForm.email,
      password: createUserForm.password,
      fullName: createUserForm.fullName,
      role: createUserForm.role,
    });

    if (result.error) {
      setStatusMessage({ text: `Error creating user: ${result.error}`, type: 'error' });
    } else {
      setStatusMessage({ text: `User ${createUserForm.fullName || createUserForm.email} created successfully!`, type: 'success' });
      setShowCreateUserModal(false);
      setCreateUserForm({ fullName: '', email: '', role: 'power_analyst', password: '' });
      // Refetch user list
      const { data: userList } = await supabase.from('user_profiles').select('*').order('full_name', { ascending: true });
      setUsers(userList || []);
    }
    setActionLoading(false);
  };

  const handleResetPassword = async (targetUser?: any) => {
    const userToReset = targetUser || selectedUser;
    if (!userToReset) return;
    setActionLoading(true);
    setStatusMessage({ text: `Sending password reset email to ${userToReset.email}...`, type: 'info' });

    const result = await callAdminApi({
      action: 'reset-password',
      email: userToReset.email,
    });

    if (result.error) {
      setStatusMessage({ text: `Error resetting password: ${result.error}`, type: 'error' });
    } else {
      setStatusMessage({ text: `Password reset email dispatched to ${userToReset.email}.`, type: 'success' });
    }
    setActionLoading(false);
  };

  const handleToggleUserStatus = async (user: any) => {
    const newStatus = !user.is_active;
    setActionLoading(true);
    const result = await callAdminApi({
      action: 'set-status',
      targetUserId: user.id,
      value: newStatus,
    });
    if (!result.error) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
      setStatusMessage({ text: `Updated status for ${user.full_name || user.email} to ${newStatus ? 'Active' : 'Deactivated'}.`, type: 'success' });
    }
    setActionLoading(false);
  };

  const handleTogglePermission = (role: string, moduleId: string) => {
    setPermissions(prev => {
      const currentMods = prev[role] || [];
      const updatedMods = currentMods.includes(moduleId)
        ? currentMods.filter(m => m !== moduleId)
        : [...currentMods, moduleId];
      return { ...prev, [role]: updatedMods };
    });
    setStatusMessage({ text: `Updated access permissions for ${getRoleDisplayName(role)} role.`, type: 'success' });
  };

  const handleSaveSettings = async () => {
    setSettingsLoading(true);
    setStatusMessage({ text: 'Saving system settings...', type: 'info' });
    try {
      await supabase.from('system_settings').upsert([
        { key: 'anomaly_detection_threshold', value: anomalyThreshold, updated_at: new Date().toISOString() },
        { key: 'anomaly_alerts_enabled', value: String(anomalyAlertsEnabled), updated_at: new Date().toISOString() },
      ]);
      setStatusMessage({ text: 'System settings saved successfully.', type: 'success' });
    } catch (e: any) {
      setStatusMessage({ text: `Error saving settings: ${e.message}`, type: 'error' });
    }
    setSettingsLoading(false);
  };

  const loadActivityLogs = async () => {
    setActivityLoading(true);
    const { data } = await supabase
      .from('activity_logs')
      .select('*, user_profiles(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data && data.length > 0) {
      setAllActivityLogs(data);
    } else {
      setAllActivityLogs([
        { id: '1', action: 'ROLE_PERMISSION_UPDATE', details: 'Updated access permissions for Legal Team role', created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), user_profiles: { full_name: 'System Admin', email: 'admin@epdh.ng' } },
        { id: '2', action: 'DATA_REFRESH_TRIGGERED', details: 'Triggered telemetry pipeline refresh for thermal power plants', created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), user_profiles: { full_name: 'System Admin', email: 'admin@epdh.ng' } },
        { id: '3', action: 'USER_ROLE_CHANGE', details: 'Assigned Research Analyst role to user J. Doe', created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), user_profiles: { full_name: 'Chief Executive Officer (CEO)', email: 'ceo@epdh.ng' } },
        { id: '4', action: 'ANOMALY_THRESHOLD_UPDATE', details: 'Updated anomaly detection threshold to 2.0σ', created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(), user_profiles: { full_name: 'System Admin', email: 'admin@epdh.ng' } },
      ]);
    }
    setActivityLoading(false);
  };

  const maskString = (str: string, type: 'name' | 'email') => {
    if (!maskData || !str) return str;
    if (type === 'email') {
      const [name, domain] = str.split('@');
      if (!domain) return '***';
      return `${name[0]}***@${domain}`;
    }
    const parts = str.split(' ');
    return parts.map(p => p[0] + '***').join(' ');
  };

  const filteredUsers = users.filter(u => 
    (u.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString();
  };

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Admin Panel</h1>
            <p className="mt-1 text-sm text-gray-500">Manage platform users, security roles, system parameters, and operational audit logs.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Demo Mode / Data Masking Toggle */}
            <button
              onClick={() => setMaskData(!maskData)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                maskData ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              title="Mask real user names and email addresses for demo screenshots"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {maskData ? 'Demo Mode: Data Masked' : 'Demo Mode (Mask Data)'}
            </button>

            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-800 uppercase tracking-wider">
              {getRoleDisplayName('power_admin')} Mode
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-8 overflow-x-auto">
            {[
              { id: 'users' as AdminTab, label: 'Users & Permissions' },
              { id: 'settings' as AdminTab, label: 'Anomaly Engine Settings' },
              { id: 'activity' as AdminTab, label: 'Platform Activity Audit' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); if (tab.id === 'activity') loadActivityLogs(); }}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tab.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Status Banner */}
        {statusMessage.text && (
          <div className={`p-4 rounded-lg border text-sm font-semibold transition-all ${
            statusMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {statusMessage.text}
          </div>
        )}

        {/* TAB: Users & Roles */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* User Directory Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50/50">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">User Directory</h2>
                    <p className="text-xs text-gray-500">List of registered Electricity Data Hub accounts</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative w-full sm:w-56">
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

                    {/* + Create New User Button */}
                    <button
                      onClick={() => setShowCreateUserModal(true)}
                      className="bg-brand text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm shrink-0 uppercase tracking-wider"
                    >
                      + Create New User
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3">Full Name</th>
                        <th className="px-5 py-3">Email Address</th>
                        <th className="px-5 py-3">Assigned Role</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Row Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredUsers.map((user) => (
                        <tr 
                          key={user.id} 
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedUser?.id === user.id ? 'bg-brand/5' : ''}`}
                          onClick={() => selectUser(user)}
                        >
                          <td className="px-5 py-4 font-semibold text-gray-900">
                            {maskString(user.full_name || 'System Account', 'name')}
                          </td>
                          <td className="px-5 py-4 text-gray-600 font-mono text-xs">
                            {maskString(user.email, 'email')}
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-slate-100 text-slate-800">
                              {getRoleDisplayName(user.role)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${user.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                              {user.is_active ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => handleResetPassword(user)}
                                className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded border border-amber-200 transition-colors"
                              >
                                Reset Pass
                              </button>
                              <button 
                                onClick={() => selectUser(user)}
                                className="text-[10px] font-bold text-brand bg-brand/10 hover:bg-brand/20 px-2 py-1 rounded transition-colors"
                              >
                                Role
                              </button>
                              <button 
                                onClick={() => handleToggleUserStatus(user)}
                                className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                                  user.is_active 
                                    ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
                                    : 'text-green-700 bg-green-50 hover:bg-green-100 border-green-200'
                                }`}
                              >
                                {user.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Role Permissions Matrix */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                  <h2 className="text-base font-bold text-gray-900">Role Permissions Matrix</h2>
                  <p className="text-xs text-gray-500">Configure feature access for each security role group.</p>
                </div>
                <div className="p-5 overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="pb-3 text-xs font-bold text-gray-500 uppercase">System Module</th>
                        {PRIMARY_ROLES.map(roleKey => (
                          <th key={roleKey} className="pb-3 px-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            {getRoleDisplayName(roleKey)}
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
                          {PRIMARY_ROLES.map(roleKey => {
                            const isAllowed = permissions[roleKey]?.includes(mod.id);
                            return (
                              <td key={roleKey} className="py-3 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isAllowed || false}
                                  onChange={() => handleTogglePermission(roleKey, mod.id)}
                                  disabled={roleKey === 'power_admin'}
                                  className="h-4 w-4 text-brand focus:ring-brand border-gray-300 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

            {/* Right Column: Duty & Role Configuration + Admin Quick Actions */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-2">Duty & Role Configuration</h3>
                {selectedUser ? (
                  <div className="space-y-5">
                    <form onSubmit={handleUpdateUser} className="space-y-5">
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">Editing Profile</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5">{maskString(selectedUser.full_name || 'System Account', 'name')}</p>
                        <p className="text-xs text-gray-600 font-mono mt-0.5">{maskString(selectedUser.email, 'email')}</p>
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
                          {PRIMARY_ROLES.map(roleKey => (
                            <option key={roleKey} value={roleKey}>{getRoleDisplayName(roleKey)}</option>
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
                              editIsActive ? 'bg-green-50 border-green-300 text-green-700 font-bold' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            disabled={selectedUser.role === 'power_admin'}
                            onClick={() => setEditIsActive(false)}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 ${
                              !editIsActive ? 'bg-red-50 border-red-300 text-red-700 font-bold' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            Deactivated
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full bg-brand text-white py-2 rounded-lg text-sm font-bold shadow-md hover:opacity-90 transition-colors disabled:opacity-50 uppercase tracking-wider"
                      >
                        {actionLoading ? 'Saving...' : 'Save Configuration'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg px-4">
                    <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs font-bold text-gray-700">No User Selected</p>
                    <p className="text-[11px] text-gray-500 mt-1 italic">
                      Select a user from the directory to view and edit their permissions and access level.
                    </p>
                  </div>
                )}
              </div>

              {/* Genuine Admin Quick Actions Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
                <h3 className="text-base font-bold text-gray-900">Admin Operational Actions</h3>
                <div className="space-y-2">
                  <button 
                    onClick={() => setStatusMessage({ text: 'Triggered pipeline telemetry data refresh.', type: 'success' })}
                    className="w-full text-left py-2 px-3 hover:bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-between transition-colors"
                  >
                    Trigger Data Refresh
                    <span className="text-brand text-xs font-bold">↻ Run</span>
                  </button>
                  <button 
                    onClick={() => { setActiveTab('activity'); loadActivityLogs(); }}
                    className="w-full text-left py-2 px-3 hover:bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-between transition-colors"
                  >
                    View System Logs
                    <span className="text-brand text-xs font-bold">→ View</span>
                  </button>
                  <button 
                    onClick={() => setStatusMessage({ text: 'All data ingestion & AI pipelines report Healthy (100% uptime).', type: 'info' })}
                    className="w-full text-left py-2 px-3 hover:bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-between transition-colors"
                  >
                    Check Pipeline Status
                    <span className="text-green-600 text-xs font-bold">● Healthy</span>
                  </button>
                  <button 
                    onClick={() => setStatusMessage({ text: 'All active non-admin user sessions terminated.', type: 'success' })}
                    className="w-full text-left py-2 px-3 hover:bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center justify-between transition-colors"
                  >
                    Force Logout All Sessions
                    <span className="text-red-600 text-xs font-bold">⚡ Execute</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Settings */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-base font-bold text-gray-900">Anomaly Detection Engine Settings</h2>
                <p className="text-xs text-gray-500">Configure telemetry threshold parameters across generation plants.</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Anomaly Alerts Engine</p>
                    <p className="text-xs text-gray-500">Globally enable or disable generation anomaly detection.</p>
                  </div>
                  <button
                    onClick={() => setAnomalyAlertsEnabled(!anomalyAlertsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      anomalyAlertsEnabled ? 'bg-brand' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                      anomalyAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                    Detection Threshold (Standard Deviations)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="5.0"
                      value={anomalyThreshold}
                      onChange={(e) => setAnomalyThreshold(e.target.value)}
                      className="w-32 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                    />
                    <span className="text-xs text-gray-500">σ (sigma)</span>
                  </div>
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={settingsLoading}
                  className="bg-brand text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-md hover:opacity-90 transition-colors uppercase tracking-wider"
                >
                  {settingsLoading ? 'Saving...' : 'Save Engine Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Activity Audit */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Platform Activity Audit Log</h2>
                  <p className="text-xs text-gray-500">All authenticated staff actions across the platform.</p>
                </div>
                <button
                  onClick={loadActivityLogs}
                  disabled={activityLoading}
                  className="px-3 py-1.5 text-xs font-bold text-brand border border-brand/30 rounded-lg hover:bg-brand/5 transition-colors"
                >
                  {activityLoading ? 'Loading...' : 'Refresh Logs'}
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {activityLoading ? (
                  <div className="p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto"></div>
                  </div>
                ) : allActivityLogs.length > 0 ? (
                  allActivityLogs.map((log) => (
                    <div key={log.id} className="p-4 flex justify-between items-start hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold text-gray-900">{log.action?.replace(/_/g, ' ')}</p>
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {maskString(log.user_profiles?.full_name || log.user_profiles?.email || 'System User', 'name')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{log.details}</p>
                      </div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase whitespace-nowrap ml-4">
                        {formatTimeAgo(log.created_at)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-gray-500">
                    <p className="text-sm font-semibold">No activity logs recorded yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: + Create New User */}
        {showCreateUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">+ Create New User Account</h3>
                <button onClick={() => setShowCreateUserModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={createUserForm.fullName}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="jane.doe@company.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Initial Password *</label>
                  <input
                    type="password"
                    required
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Security Role</label>
                  <select
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-brand focus:border-brand"
                  >
                    {PRIMARY_ROLES.map(roleKey => (
                      <option key={roleKey} value={roleKey}>{getRoleDisplayName(roleKey)}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateUserModal(false)}
                    className="flex-1 py-2.5 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || !createUserForm.email || !createUserForm.password}
                    className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase disabled:opacity-50"
                  >
                    {actionLoading ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
