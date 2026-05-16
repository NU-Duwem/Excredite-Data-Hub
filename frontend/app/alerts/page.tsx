'use client';

import { useState } from 'react';

interface Alert {
  id: number;
  plant: string;
  date: string;
  deviation: string;
  desc: string;
  status: 'UNREVIEWED' | 'REVIEWED' | 'DISMISSED';
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([
    { id: 1, plant: 'Egbin Thermal', date: '2026-05-11', deviation: '-2.2', desc: 'Output dropped 2.2 standard deviations below 30-day rolling average. Likely caused by NGC gas pressure drop at the Escravos-Lagos Pipeline System (ELPS). This drop represents a significant risk to grid stability in the Lagos region.', status: 'UNREVIEWED' },
    { id: 2, plant: 'Shiroro Hydro', date: '2026-05-10', deviation: '-1.5', desc: 'Unscheduled capacity reduction detected. No TCN outage report matched. Historical patterns suggest potential reservoir management issues or undeclared maintenance on Unit 3.', status: 'UNREVIEWED' },
    { id: 3, plant: 'Azura-Edo IPP', date: '2026-05-08', deviation: '+1.2', desc: 'Output increased above typical dispatch instruction band. Efficiency gains noted following recent turbine overhaul.', status: 'REVIEWED' },
  ]);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState('UNREVIEWED');

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const updateStatus = (id: number, newStatus: 'REVIEWED' | 'DISMISSED') => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    setExpandedId(null);
  };

  const filteredAlerts = alerts.filter(a => {
    if (filterStatus === 'UNREVIEWED') return a.status === 'UNREVIEWED';
    return true;
  });

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Anomaly Alerts</h1>
            <p className="mt-1 text-sm text-gray-500">AI-generated alerts for unusual generation or grid patterns.</p>
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
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border-gray-200 py-1.5 pl-3 pr-8 text-xs font-semibold border focus:ring-brand focus:border-brand uppercase"
            >
              <option value="UNREVIEWED">Unreviewed Only</option>
              <option value="ALL">All Alerts</option>
            </select>
          </div>
        </div>

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Plant / Entity</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Deviation (σ)</th>
                <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">AI Analysis Preview</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-gray-500 italic">No alerts found for the selected criteria.</td>
                </tr>
              ) : filteredAlerts.map((alert) => (
                <React.Fragment key={alert.id}>
                  <tr 
                    onClick={() => toggleExpand(alert.id)}
                    className={`cursor-pointer transition-colors ${
                      alert.status !== 'UNREVIEWED' ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900">
                      <div className="flex items-center">
                        {alert.status === 'UNREVIEWED' && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse mr-2.5"></span>}
                        {alert.plant}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{alert.date}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                        alert.deviation.startsWith('-') ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-green-50 text-green-700 ring-green-600/20'
                      }`}>
                        {alert.deviation}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500 max-w-xs truncate">{alert.desc}</td>
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
                      <td colSpan={5} className="px-4 py-6">
                        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-inner">
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Detailed AI Analysis</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                              alert.status === 'UNREVIEWED' ? 'text-red-700 border-red-200 bg-red-50' : 'text-gray-600 border-gray-200 bg-gray-50'
                            }`}>
                              Status: {alert.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed mb-6 whitespace-pre-wrap">
                            {alert.desc}
                          </p>
                          {alert.status === 'UNREVIEWED' && (
                            <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                              <button 
                                onClick={(e) => { e.stopPropagation(); updateStatus(alert.id, 'REVIEWED'); }}
                                className="px-4 py-2 text-xs font-bold text-white bg-brand rounded hover:opacity-90 transition-all shadow-sm"
                              >
                                MARK AS REVIEWED
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

import React from 'react';
