'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const roleDisplayNames: Record<string, string> = {
  power_admin: 'System Admin',
  power_ceo: 'CEO',
  power_legal: 'Legal Expert',
  power_analyst: 'Research Analyst',
  power_app: 'IT Expert',
  power_ingestion: 'Ingestion Operator',
  power_team: 'Team Member',
};

const modulesList = [
  { id: 'query', name: 'AI Query Interface', path: '/query' },
  { id: 'history', name: 'Conversation History', path: '/history' },
  { id: 'alerts', name: 'Anomaly Alerts', path: '/alerts' },
  { id: 'documents', name: 'Documents Manager', path: '/documents' },
  { id: 'forecasts', name: 'Forecasts & Models', path: '/forecasts' },
  { id: 'matters', name: 'Legal Matters Monitor', path: '/matters' },
  { id: 'news', name: 'News & Updates', path: '/news' },
];

// Initial mock permission matrix (Role -> Modules they can access)
const initialPermissions: Record<string, string[]> = {
  power_admin: ['query', 'history', 'alerts', 'documents', 'forecasts', 'matters', 'news'],
  power_ceo: ['query', 'history', 'alerts', 'documents', 'forecasts', 'matters', 'news'],
  power_legal: ['query', 'history', 'matters'],
  power_analyst: ['query', 'history', 'alerts', 'documents', 'forecasts', 'news'],
  power_app: ['query', 'history', 'alerts', 'documents', 'forecasts', 'matters', 'news'],
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
  
  // States for Duty/Role Management
  const [editRole, setEditRole] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  const [actionLoading, setActionLoading] = useState(false);
  
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

      // Fetch system settings
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

  // Admin API helper
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

    // Update role and status via API
    const result = await callAdminApi({
      action: 'set-status',
      targetUserId: selectedUser.id,
      value: editIsActive,
    });

    if (result.error) {
      setStatusMessage({ text: `Error: ${result.error}`, type: 'error' });
    } else {
      // Update local state
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: editRole, is_active: editIsActive } : u));
      setSelectedUser((prev: any) => ({ ...prev, role: editRole, is_active: editIsActive }));
      setStatusMessage({ text: 'User permissions and role updated successfully!', type: 'success' });
    }
    setActionLoading(false);
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setStatusMessage({ text: 'Resetting password...', type: 'info' });

    const result = await callAdminApi({
      action: 'reset-password',
      targetUserId: selectedUser.id,
    });

    if (result.error) {
      setStatusMessage({ text: `Error: ${result.error}`, type: 'error' });
    } else {
      setStatusMessage({ text: result.message, type: 'success' });
    }
    setActionLoading(false);
  };

  const handleForceLogout = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setStatusMessage({ text: 'Forcing logout...', type: 'info' });

    const result = await callAdminApi({
      action: 'force-logout',
      targetUserId: selectedUser.id,
    });

    if (result.error) {
      setStatusMessage({ text: `Error: ${result.error}`, type: 'error' });
    } else {
      setStatusMessage({ text: result.message, type: 'success' });
    }
    setActionLoading(false);
  };

  const handleSaveSettings = async () => {
    setSettingsLoading(true);
    setStatusMessage({ text: 'Saving settings...', type: 'info' });

    const [thresholdResult, enabledResult] = await Promise.all([
      callAdminApi({ action: 'update-setting', key: 'anomaly_detection_threshold', settingValue: anomalyThreshold }),
      callAdminApi({ action: 'update-setting', key: 'anomaly_alerts_enabled', settingValue: String(anomalyAlertsEnabled) }),
    ]);

    if (thresholdResult.error || enabledResult.error) {
      setStatusMessage({ text: `Error saving settings: ${thresholdResult.error || enabledResult.error}`, type: 'error' });
    } else {
      setStatusMessage({ text: 'Anomaly detection settings saved successfully!', type: 'success' });
    }
    setSettingsLoading(false);
    setTimeout(() => setStatusMessage({ text: '', type: '' }), 4000);
  };

  const loadActivityLogs = async () => {
    setActivityLoading(true);
    const result = await callAdminApi({ action: 'get-all-activity' });
    if (result.data) {
      setAllActivityLogs(result.data);
    }
    setActivityLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'activity' && allActivityLogs.length === 0) {
      loadActivityLogs();
    }
  }, [activeTab]);

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

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

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
          <p className="text-sm text-gray-500 mt-1">Manage user directory access, roles, system settings, and activity logs.</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-6">
            {[
              { id: 'users' as AdminTab, label: 'Users & Roles' },
              { id: 'settings' as AdminTab, label: 'Anomaly Settings' },
              { id: 'activity' as AdminTab, label: 'Activity Logs' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
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

        {/* ============================================ */}
        {/* TAB: Users & Roles */}
        {/* ============================================ */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* User Directory Column */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50/50">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">User Directory</h2>
                    <p className="text-xs text-gray-500">List of registered Electricity Data Hub users</p>
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
                            No users found matching &quot;{searchQuery}&quot;
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
                  <div className="space-y-5">
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
                          disabled={actionLoading}
                          className="w-full bg-brand text-white py-2 rounded-lg text-sm font-bold shadow-md hover:bg-[#a38020] transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? 'Saving...' : 'Save Configuration'}
                        </button>
                      </div>
                    </form>

                    {/* Admin Quick Actions for selected user */}
                    <div className="pt-4 border-t border-gray-100 space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Admin Actions</p>
                      <button
                        onClick={handleResetPassword}
                        disabled={actionLoading}
                        className="w-full text-left py-2 px-3 hover:bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-bold text-yellow-700 flex items-center justify-between transition-colors disabled:opacity-50"
                      >
                        Reset User Password
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                      </button>
                      <button
                        onClick={handleForceLogout}
                        disabled={actionLoading}
                        className="w-full text-left py-2 px-3 hover:bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-orange-700 flex items-center justify-between transition-colors disabled:opacity-50"
                      >
                        Force Logout User
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      </button>
                    </div>
                  </div>
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
        )}

        {/* ============================================ */}
        {/* TAB: Anomaly Settings */}
        {/* ============================================ */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-base font-bold text-gray-900">Anomaly Detection Settings</h2>
                <p className="text-xs text-gray-500">Configure the anomaly detection engine parameters used across the platform.</p>
              </div>
              <div className="p-6 space-y-6">
                {/* Global Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Anomaly Alerts Engine</p>
                    <p className="text-xs text-gray-500">Globally enable or disable the anomaly detection system.</p>
                  </div>
                  <button
                    onClick={() => setAnomalyAlertsEnabled(!anomalyAlertsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      anomalyAlertsEnabled ? 'bg-brand' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        anomalyAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Threshold Input */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                    Detection Threshold (Standard Deviations)
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Alerts trigger when data deviates beyond this many standard deviations from the rolling average. Lower values = more sensitive.
                  </p>
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
                  <div className="mt-3 flex gap-2">
                    {['1.0', '1.5', '2.0', '2.5', '3.0'].map(val => (
                      <button
                        key={val}
                        onClick={() => setAnomalyThreshold(val)}
                        className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                          anomalyThreshold === val ? 'bg-brand/10 border-brand text-brand' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {val}σ
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={settingsLoading}
                  className="bg-brand text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-md hover:bg-[#a38020] transition-colors disabled:opacity-50"
                >
                  {settingsLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TAB: Activity Logs */}
        {/* ============================================ */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Platform Activity Logs</h2>
                  <p className="text-xs text-gray-500">All user actions across the Electricity Data Hub.</p>
                </div>
                <button
                  onClick={loadActivityLogs}
                  disabled={activityLoading}
                  className="px-3 py-1.5 text-xs font-bold text-brand border border-brand/30 rounded-lg hover:bg-brand/5 transition-colors disabled:opacity-50"
                >
                  {activityLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {activityLoading ? (
                  <div className="p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto"></div>
                    <p className="text-xs text-gray-500 mt-3">Loading activity logs...</p>
                  </div>
                ) : allActivityLogs.length > 0 ? (
                  allActivityLogs.map((log) => (
                    <div key={log.id} className="p-4 flex justify-between items-start hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold text-gray-900">{log.action?.replace(/_/g, ' ')}</p>
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {log.user_profiles?.full_name || log.user_profiles?.email || 'Unknown'}
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
                    <p className="text-sm font-semibold">No activity logs found</p>
                    <p className="text-xs text-gray-400 mt-1">Activity will appear here as users interact with the platform.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
