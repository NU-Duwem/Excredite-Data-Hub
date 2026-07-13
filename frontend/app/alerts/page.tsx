'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Alert {
  id: string;
  plant_id: string | null;
  alert_date: string;
  actual_output_mwh: number | null;
  expected_output_mwh: number | null;
  deviation_stddev: number;
  alert_type: string;
  explanation: string | null;
  status: 'UNREVIEWED' | 'ASSIGNED' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';
  reviewed_at: string | null;
  created_at: string;
  source_type: string;
  assigned_to: string | null;
  document_id: string | null;
  matter_id: string | null;
  news_id: string | null;
  // Joined data
  plant_name?: string;
  assigned_user_name?: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('UNREVIEWED');
  const [filterSource, setFilterSource] = useState('ALL');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // Fetch alerts
      const { data, error } = await supabase
        .from('anomaly_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setAlerts(data);
      } else {
        // Fallback: mock data
        setAlerts([
          {
            id: '1', plant_id: 'mock-1', alert_date: '2026-05-11', actual_output_mwh: 120, expected_output_mwh: 300,
            deviation_stddev: 2.2, alert_type: 'LOW_OUTPUT',
            explanation: 'Output dropped 2.2 standard deviations below 30-day rolling average. Likely caused by NGC gas pressure drop at the Escravos-Lagos Pipeline System (ELPS). This drop represents a significant risk to grid stability in the Lagos region.',
            status: 'UNREVIEWED', reviewed_at: null, created_at: '2026-05-11T10:00:00Z',
            source_type: 'GENERATION', assigned_to: null, document_id: null, matter_id: null, news_id: null,
            plant_name: 'Egbin Thermal',
          },
          {
            id: '2', plant_id: 'mock-2', alert_date: '2026-05-10', actual_output_mwh: 200, expected_output_mwh: 280,
            deviation_stddev: 1.5, alert_type: 'LOW_OUTPUT',
            explanation: 'Unscheduled capacity reduction detected. No TCN outage report matched. Historical patterns suggest potential reservoir management issues.',
            status: 'UNREVIEWED', reviewed_at: null, created_at: '2026-05-10T08:00:00Z',
            source_type: 'GENERATION', assigned_to: null, document_id: null, matter_id: null, news_id: null,
            plant_name: 'Shiroro Hydro',
          },
          {
            id: '3', plant_id: 'mock-3', alert_date: '2026-05-08', actual_output_mwh: 470, expected_output_mwh: 400,
            deviation_stddev: 1.2, alert_type: 'HIGH_OUTPUT',
            explanation: 'Output increased above typical dispatch instruction band. Efficiency gains noted following recent turbine overhaul.',
            status: 'REVIEWED', reviewed_at: '2026-05-09T14:00:00Z', created_at: '2026-05-08T12:00:00Z',
            source_type: 'GENERATION', assigned_to: null, document_id: null, matter_id: null, news_id: null,
            plant_name: 'Azura-Edo IPP',
          },
          {
            id: '4', plant_id: null, alert_date: '2026-05-07', actual_output_mwh: null, expected_output_mwh: null,
            deviation_stddev: 3.0, alert_type: 'DOCUMENT_DISCREPANCY',
            explanation: 'Conflicting generation figures detected between the TCN Quarterly Report Q1 2026 and the NERC Enforcement Notice issued on 2026-04-30.',
            status: 'UNREVIEWED', reviewed_at: null, created_at: '2026-05-07T09:00:00Z',
            source_type: 'DOCUMENT', assigned_to: null, document_id: 'doc-1', matter_id: null, news_id: null,
          },
        ]);
      }
      setLoading(false);
    };

    fetchAlerts();

    // Realtime subscription
    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anomaly_alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const updateStatus = async (id: string, newStatus: 'REVIEWED' | 'RESOLVED' | 'DISMISSED') => {
    // Update in DB
    await supabase
      .from('anomaly_alerts')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', id);

    // Update local state
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, reviewed_at: new Date().toISOString() } : a));
    setExpandedId(null);
  };

  const assignToMe = async (id: string) => {
    if (!currentUserId) return;
    
    await supabase
      .from('anomaly_alerts')
      .update({ assigned_to: currentUserId, status: 'ASSIGNED' })
      .eq('id', id);

    setAlerts(prev => prev.map(a => a.id === id ? { ...a, assigned_to: currentUserId, status: 'ASSIGNED' } : a));
  };

  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filterStatus === 'ALL' || a.status === filterStatus;
    const matchesSource = filterSource === 'ALL' || a.source_type === filterSource;
    return matchesStatus && matchesSource;
  });

  const getSourceBadge = (sourceType: string) => {
    switch (sourceType) {
      case 'GENERATION': return { color: 'bg-blue-50 text-blue-700 ring-blue-600/20', label: 'Generation' };
      case 'DOCUMENT': return { color: 'bg-purple-50 text-purple-700 ring-purple-600/20', label: 'Document' };
      case 'LEGAL_MATTER': return { color: 'bg-orange-50 text-orange-700 ring-orange-600/20', label: 'Legal' };
      case 'NEWS': return { color: 'bg-teal-50 text-teal-700 ring-teal-600/20', label: 'News' };
      default: return { color: 'bg-gray-50 text-gray-700 ring-gray-600/20', label: sourceType };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UNREVIEWED': return 'text-red-700 border-red-200 bg-red-50';
      case 'ASSIGNED': return 'text-yellow-700 border-yellow-200 bg-yellow-50';
      case 'REVIEWED': return 'text-blue-700 border-blue-200 bg-blue-50';
      case 'RESOLVED': return 'text-green-700 border-green-200 bg-green-50';
      case 'DISMISSED': return 'text-gray-600 border-gray-200 bg-gray-50';
      default: return 'text-gray-600 border-gray-200 bg-gray-50';
    }
  };

  const getEntityName = (alert: Alert) => {
    if (alert.plant_name) return alert.plant_name;
    if (alert.source_type === 'DOCUMENT') return 'Document Discrepancy';
    if (alert.source_type === 'LEGAL_MATTER') return 'Legal Matter Conflict';
    if (alert.source_type === 'NEWS') return 'News Conflict';
    return 'Unknown Entity';
  };

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Anomaly Alerts</h1>
            <p className="mt-1 text-sm text-gray-500">AI-generated alerts for unusual patterns across generation, documents, legal matters, and news.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">From:</label>
              <input type="date" className="rounded-md border-gray-200 py-1 px-2 text-xs border focus:ring-brand focus:border-brand" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">To:</label>
              <input type="date" className="rounded-md border-gray-200 py-1 px-2 text-xs border focus:ring-brand focus:border-brand" />
            </div>
            <select 
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="rounded-md border-gray-200 py-1.5 pl-3 pr-8 text-xs font-semibold border focus:ring-brand focus:border-brand uppercase"
            >
              <option value="ALL">All Sources</option>
              <option value="GENERATION">Generation</option>
              <option value="DOCUMENT">Documents</option>
              <option value="LEGAL_MATTER">Legal</option>
              <option value="NEWS">News</option>
            </select>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border-gray-200 py-1.5 pl-3 pr-8 text-xs font-semibold border focus:ring-brand focus:border-brand uppercase"
            >
              <option value="UNREVIEWED">Unreviewed Only</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="ALL">All Alerts</option>
            </select>
          </div>
        </div>

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Entity / Source</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Deviation (σ)</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-gray-500 italic">No alerts found for the selected criteria.</td>
                </tr>
              ) : filteredAlerts.map((alert) => {
                const sourceBadge = getSourceBadge(alert.source_type);
                return (
                  <React.Fragment key={alert.id}>
                    <tr 
                      onClick={() => toggleExpand(alert.id)}
                      className={`cursor-pointer transition-colors ${
                        alert.status === 'UNREVIEWED' ? 'hover:bg-gray-50' :
                        alert.status === 'ASSIGNED' ? 'bg-yellow-50/30 hover:bg-yellow-50/50' :
                        'bg-gray-50/50'
                      }`}
                    >
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900">
                        <div className="flex items-center">
                          {alert.status === 'UNREVIEWED' && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse mr-2.5"></span>}
                          {getEntityName(alert)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{alert.alert_date}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${sourceBadge.color}`}>
                          {sourceBadge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                          alert.deviation_stddev >= 2 ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-green-50 text-green-700 ring-green-600/20'
                        }`}>
                          {alert.alert_type.includes('LOW') || alert.alert_type.includes('ZERO') ? '-' : '+'}{alert.deviation_stddev}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusBadge(alert.status)}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-bold sm:pr-6">
                        <span className="text-brand flex items-center justify-end">
                          {expandedId === alert.id ? 'Hide Details' : 'View Details'}
                          <svg className={`ml-1.5 h-4 w-4 transition-transform ${expandedId === alert.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </td>
                    </tr>
                    {expandedId === alert.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-6">
                          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-inner">
                            <div className="flex justify-between items-start mb-4">
                              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Detailed AI Analysis</h4>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusBadge(alert.status)}`}>
                                Status: {alert.status}
                              </span>
                            </div>

                            {/* Source-specific info */}
                            {alert.source_type !== 'GENERATION' && (
                              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Anomaly Source</p>
                                <p className="text-xs text-gray-700 mt-1">
                                  {alert.source_type === 'DOCUMENT' && 'Discrepancy identified within uploaded documents.'}
                                  {alert.source_type === 'LEGAL_MATTER' && 'Conflict flagged from legal matter records.'}
                                  {alert.source_type === 'NEWS' && 'Conflict surfaced from news and updates.'}
                                </p>
                              </div>
                            )}

                            <p className="text-sm text-gray-700 leading-relaxed mb-6 whitespace-pre-wrap">
                              {alert.explanation}
                            </p>

                            {/* Assignment info */}
                            {alert.assigned_to && (
                              <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                <p className="text-xs font-bold text-yellow-800">
                                  Assigned to: {alert.assigned_user_name || alert.assigned_to}
                                </p>
                              </div>
                            )}

                            {(alert.status === 'UNREVIEWED' || alert.status === 'ASSIGNED') && (
                              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 flex-wrap">
                                {!alert.assigned_to && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); assignToMe(alert.id); }}
                                    className="px-4 py-2 text-xs font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded hover:bg-yellow-100 transition-all"
                                  >
                                    ASSIGN TO ME
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); updateStatus(alert.id, 'REVIEWED'); }}
                                  className="px-4 py-2 text-xs font-bold text-white bg-brand rounded hover:opacity-90 transition-all shadow-sm"
                                >
                                  MARK AS REVIEWED
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); updateStatus(alert.id, 'RESOLVED'); }}
                                  className="px-4 py-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-all"
                                >
                                  MARK RESOLVED
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); updateStatus(alert.id, 'DISMISSED'); }}
                                  className="px-4 py-2 text-xs font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-all"
                                >
                                  DISMISS ALERT
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
