'use client';

import { useState } from 'react';

interface HistoryItem {
  id: number;
  query: string;
  timestamp: string;
  sessionLength: number;
  category: string;
}

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  
  const history: HistoryItem[] = [
    { id: 1, query: 'What was the total generation output last week?', timestamp: '2026-05-16 10:42 AM', sessionLength: 4, category: 'Generation' },
    { id: 2, query: 'Show me all NERC enforcement actions from the last six months', timestamp: '2026-05-15 04:15 PM', sessionLength: 12, category: 'Regulatory' },
    { id: 3, query: 'Explain the impact of the new tariff order on industrial consumers', timestamp: '2026-05-14 09:30 AM', sessionLength: 8, category: 'Tariffs' },
    { id: 4, query: 'Compare gas pressure at ELPS vs output at Egbin Thermal', timestamp: '2026-05-12 11:20 AM', sessionLength: 6, category: 'Gas/Thermal' },
  ];

  const filteredHistory = history.filter(item => 
    item.query.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Conversation History</h1>
            <p className="mt-1 text-sm text-gray-500">Access and review your previous AI interactions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <input 
                type="text" 
                placeholder="Search keywords..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border-gray-200 py-2 pl-3 pr-10 text-xs font-semibold border focus:ring-brand focus:border-brand" 
              />
              <svg className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select className="rounded-lg border-gray-200 py-2 pl-3 pr-8 text-[10px] font-bold border focus:ring-brand uppercase tracking-wider">
              <option>Last 30 Days</option>
              <option>This Year</option>
              <option>All Time</option>
            </select>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Saved AI Sessions</h2>
            <span className="text-[10px] font-bold text-gray-400 uppercase">{filteredHistory.length} Results</span>
          </div>
          <ul className="divide-y divide-gray-200">
            {filteredHistory.length === 0 ? (
              <li className="p-12 text-center text-sm text-gray-500 italic">No matching conversations found.</li>
            ) : filteredHistory.map((item) => (
              <li key={item.id} className="p-5 hover:bg-gray-50/80 cursor-pointer transition-colors group">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 group-hover:text-brand transition-colors">{item.query}</p>
                    <div className="flex items-center gap-3 mt-2">
                       <span className="text-[10px] font-bold text-gray-400 uppercase">{item.timestamp}</span>
                       <span className="text-gray-200">•</span>
                       <span className="text-[10px] font-bold text-brand uppercase">{item.category}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                        {item.sessionLength} MESSAGES
                      </span>
                      <svg className="h-4 w-4 text-gray-300 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
