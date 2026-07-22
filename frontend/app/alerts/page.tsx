'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface Alert {
  id: string;
  plant_id: string | null;
  plant_name: string;
  plant_type: 'Thermal' | 'Hydro' | 'Solar';
  category: 'GENCOs' | 'Thermal Plants' | 'Hydro Plants' | 'IPPs';
  alert_date: string;
  actual_output_mwh: number | null;
  expected_output_mwh: number | null;
  deviation_sigma: number;
  alert_type: 'HIGH_OUTPUT' | 'LOW_OUTPUT' | 'ZERO_OUTPUT' | 'CURTAILMENT_SPIKE';
  explanation: string;
  status: 'UNREVIEWED' | 'REVIEWED' | 'DISMISSED';
  reviewed_at: string | null;
  created_at: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('UNREVIEWED');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const supabase = createClient();

  const mockAlerts: Alert[] = [
    {
      id: '1',
      plant_id: 'p-1',
      plant_name: 'Egbin Thermal Power Station',
      plant_type: 'Thermal',
      category: 'Thermal Plants',
      alert_date: '2026-07-21',
      actual_output_mwh: 120,
      expected_output_mwh: 300,
      deviation_sigma: -2.8,
      alert_type: 'LOW_OUTPUT',
      explanation: 'Generation dropped 2.8σ below the 30-day rolling baseline due to ELPS gas line pressure reduction at NGC supply terminal.',
      status: 'UNREVIEWED',
      reviewed_at: null,
      created_at: '2026-07-21T08:30:00Z',
    },
    {
      id: '2',
      plant_id: 'p-2',
      plant_name: 'Shiroro Hydro Station',
      plant_type: 'Hydro',
      category: 'Hydro Plants',
      alert_date: '2026-07-20',
      actual_output_mwh: 0,
      expected_output_mwh: 240,
      deviation_sigma: -4.1,
      alert_type: 'ZERO_OUTPUT',
      explanation: 'Unscheduled zero output event logged during peak evening dispatch. Spillway maintenance triggered emergency shutdown.',
      status: 'UNREVIEWED',
      reviewed_at: null,
      created_at: '2026-07-20T14:15:00Z',
    },
    {
      id: '3',
      plant_id: 'p-3',
      plant_name: 'Azura-Edo IPP',
      plant_type: 'Thermal',
      category: 'IPPs',
      alert_date: '2026-07-19',
      actual_output_mwh: 480,
      expected_output_mwh: 420,
      deviation_sigma: +2.1,
      alert_type: 'HIGH_OUTPUT',
      explanation: 'Output exceeded baseline dispatch by 2.1σ following successful completion of turbine GT14 major overhaul.',
      status: 'REVIEWED',
      reviewed_at: '2026-07-20T09:00:00Z',
      created_at: '2026-07-19T11:00:00Z',
    },
    {
      id: '4',
      plant_id: 'p-4',
      plant_name: 'Kainji Hydro Electric',
      plant_type: 'Hydro',
      category: 'Hydro Plants',
      alert_date: '2026-07-18',
      actual_output_mwh: 150,
      expected_output_mwh: 310,
      deviation_sigma: -3.2,
      alert_type: 'CURTAILMENT_SPIKE',
      explanation: 'TCN National Control Centre (NCC) forced curtailment instruction issued due to 330kV Osogbo transmission bottleneck.',
      status: 'UNREVIEWED',
      reviewed_at: null,
      created_at: '2026-07-18T16:45:00Z',
    },
  ];

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      const { data, error } = await supabase
        .from('anomaly_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        const formatted: Alert[] = data.map((a: any) => ({
          id: a.id,
          plant_id: a.plant_id,
          plant_name: a.plant_name || 'Egbin Thermal',
          plant_type: a.plant_type || 'Thermal',
          category: a.category || 'GENCOs',
          alert_date: a.alert_date || new Date(a.created_at).toISOString().split('T')[0],
          actual_output_mwh: a.actual_output_mwh ?? 140,
          expected_output_mwh: a.expected_output_mwh ?? 300,
          deviation_sigma: a.deviation_stddev ?? -2.2,
          alert_type: ['HIGH_OUTPUT', 'LOW_OUTPUT', 'ZERO_OUTPUT', 'CURTAILMENT_SPIKE'].includes(a.alert_type) ? a.alert_type : 'LOW_OUTPUT',
          explanation: a.explanation || 'Generation anomaly detected against 30-day rolling baseline.',
          status: ['UNREVIEWED', 'REVIEWED', 'DISMISSED'].includes(a.status) ? a.status : 'UNREVIEWED',
          reviewed_at: a.reviewed_at,
          created_at: a.created_at,
        }));
        setAlerts(formatted);
      } else {
        setAlerts(mockAlerts);
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

  const updateStatus = async (id: string, newStatus: 'UNREVIEWED' | 'REVIEWED' | 'DISMISSED') => {
    try {
      await supabase
        .from('anomaly_alerts')
        .update({ status: newStatus, reviewed_at: newStatus !== 'UNREVIEWED' ? new Date().toISOString() : null })
        .eq('id', id);
    } catch (e) {
      console.error('Error updating alert status:', e);
    }

    setAlerts(prev => prev.map(a => a.id === id ? {
      ...a,
      status: newStatus,
      reviewed_at: newStatus !== 'UNREVIEWED' ? new Date().toISOString() : null
    } : a));
  };

  const filteredAlerts = alerts.filter(a => {
    const matchesStatus = filterStatus === 'ALL' || a.status === filterStatus;
    const matchesCategory = filterCategory === 'ALL' || 
      (filterCategory === 'GENCOs' && (a.category === 'GENCOs' || a.category === 'Thermal Plants' || a.category === 'Hydro Plants')) ||
      (filterCategory === 'Thermal Plants' && a.plant_type === 'Thermal') ||
      (filterCategory === 'Hydro Plants' && a.plant_type === 'Hydro') ||
      (filterCategory === 'IPPs' && a.category === 'IPPs');
    return matchesStatus && matchesCategory;
  });

  // KPI Calculations
  const unreviewedCount = alerts.filter(a => a.status === 'UNREVIEWED').length;
  const zeroOutputCount = alerts.filter(a => a.alert_type === 'ZERO_OUTPUT').length;
  const curtailmentCount = alerts.filter(a => a.alert_type === 'CURTAILMENT_SPIKE').length;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'HIGH_OUTPUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 ring-1 ring-green-600/20">HIGH OUTPUT</span>;
      case 'LOW_OUTPUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 ring-1 ring-amber-600/20">LOW OUTPUT</span>;
      case 'ZERO_OUTPUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 ring-1 ring-red-600/20">ZERO OUTPUT</span>;
      case 'CURTAILMENT_SPIKE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 ring-1 ring-purple-600/20">CURTAILMENT SPIKE</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-700">{type}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UNREVIEWED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase">UNREVIEWED</span>;
      case 'REVIEWED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">REVIEWED</span>;
      case 'DISMISSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200 uppercase">DISMISSED</span>;
      default:
        return null;
    }
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
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Anomaly Alerts</h1>
            <p className="mt-1 text-sm text-gray-500 italic">
              AI-generated alerts for unusual generation patterns detected across active power plants
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border-gray-200 py-1.5 pl-3 pr-8 text-xs font-bold border focus:ring-brand focus:border-brand uppercase bg-white"
            >
              <option value="ALL">All Plants</option>
              <option value="GENCOs">GENCOs</option>
              <option value="Thermal Plants">Thermal Plants</option>
              <option value="Hydro Plants">Hydro Plants</option>
              <option value="IPPs">IPPs</option>
            </select>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border-gray-200 py-1.5 pl-3 pr-8 text-xs font-bold border focus:ring-brand focus:border-brand uppercase bg-white"
            >
              <option value="UNREVIEWED">Unreviewed</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="DISMISSED">Dismissed</option>
              <option value="ALL">All Alerts</option>
            </select>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Unreviewed Alerts</p>
            <p className="text-2xl font-bold text-red-600">{unreviewedCount}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">Requires advisory attention</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Zero Output Events</p>
            <p className="text-2xl font-bold text-amber-600">{zeroOutputCount}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">Total plant capacity drop</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Curtailment Spikes</p>
            <p className="text-2xl font-bold text-purple-600">{curtailmentCount}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">Grid dispatch bottleneck events</p>
          </div>
        </div>

        {/* Alerts Table */}
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Generation Anomaly Log</h2>
          </div>

          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-sm font-semibold text-gray-700 italic max-w-md mx-auto">
                No generation data has been loaded yet. Alerts will appear automatically once the TCN daily report ingestion pipeline is active.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Power Plant</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Plant Type</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Deviation (σ)</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Expected (MWh)</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Actual (MWh)</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="py-3.5 pl-3 pr-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider sm:pr-6">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredAlerts.map((alert) => (
                    <React.Fragment key={alert.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-bold text-gray-900">
                          <div className="flex items-center">
                            {alert.status === 'UNREVIEWED' && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse mr-2.5 shrink-0" />}
                            {alert.plant_name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-gray-600">{alert.plant_type}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-500 font-medium">{alert.alert_date}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs">{getTypeBadge(alert.alert_type)}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs font-bold">
                          <span className={alert.deviation_sigma < 0 ? 'text-red-600' : 'text-green-600'}>
                            {alert.deviation_sigma > 0 ? `+${alert.deviation_sigma}σ` : `${alert.deviation_sigma}σ`}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-gray-500">
                          {alert.expected_output_mwh !== null ? `${alert.expected_output_mwh} MWh` : 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs font-bold text-gray-900">
                          {alert.actual_output_mwh !== null ? `${alert.actual_output_mwh} MWh` : 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-xs">{getStatusBadge(alert.status)}</td>
                        <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-xs font-bold sm:pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {alert.status === 'UNREVIEWED' && (
                              <>
                                <button
                                  onClick={() => updateStatus(alert.id, 'REVIEWED')}
                                  className="px-2.5 py-1 bg-brand text-white text-[10px] font-bold rounded hover:opacity-90 transition-all uppercase"
                                >
                                  Mark Reviewed
                                </button>
                                <button
                                  onClick={() => updateStatus(alert.id, 'DISMISSED')}
                                  className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded hover:bg-gray-200 transition-all uppercase border border-gray-200"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                              className="text-gray-400 hover:text-brand transition-colors p-1"
                              title="Toggle AI Analysis"
                            >
                              <svg className={`h-4 w-4 transition-transform ${expandedId === alert.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === alert.id && (
                        <tr className="bg-slate-50">
                          <td colSpan={9} className="px-6 py-4 border-y border-gray-100">
                            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2">
                              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                                AI Analysis (Plain English Explanation)
                              </h4>
                              <p className="text-xs text-gray-700 leading-relaxed font-medium">
                                {alert.explanation}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
