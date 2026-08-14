'use client';

import { useState, useEffect } from 'react';

interface HistoryItem {
  id: string | number;
  query: string;
  timestamp: string;
  sessionLength: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

const defaultHistory: HistoryItem[] = [
  {
    id: 1,
    query: 'What was the total generation output last week?',
    timestamp: '2026-05-16 10:42 AM',
    sessionLength: 4,
    messages: [
      { role: 'user', content: 'What was the total generation output last week?' },
      { role: 'assistant', content: 'The total generation output for the week of May 10-16, 2026 was approximately **4,287 MWh** across all tracked power plants. This represents a **3.2% increase** compared to the previous week.\n\n### Top Contributors:\n- **Egbin Thermal**: 1,120 MWh\n- **Azura-Edo IPP**: 890 MWh\n- **Shiroro Hydro**: 740 MWh' },
      { role: 'user', content: 'How does this compare to the monthly average?' },
      { role: 'assistant', content: 'The weekly output of 4,287 MWh is **7% above** the monthly average of 4,007 MWh for May 2026. This is largely driven by improved gas supply at the Escravos-Lagos Pipeline System (ELPS) and seasonal hydro improvements at Shiroro and Kainji.' },
    ],
  },
  {
    id: 2,
    query: 'Show me all NERC enforcement actions from the last six months',
    timestamp: '2026-05-15 04:15 PM',
    sessionLength: 12,
    messages: [
      { role: 'user', content: 'Show me all NERC enforcement actions from the last six months' },
      { role: 'assistant', content: 'I found **8 enforcement actions** issued by NERC between November 2025 and May 2026:\n\n1. **Warning to Benin DISCO** — Service quality failures (Dec 2025)\n2. **Fine of ₦500M to Enugu DISCO** — Metering compliance (Jan 2026)\n3. **License suspension threat to PHED** — Outstanding market settlement (Feb 2026)\n4. **Notice to Kaduna DISCO** — Customer complaint resolution (Mar 2026)' },
    ],
  },
  {
    id: 3,
    query: 'Explain the impact of the new tariff order on industrial consumers',
    timestamp: '2026-05-14 09:30 AM',
    sessionLength: 8,
    messages: [
      { role: 'user', content: 'Explain the impact of the new tariff order on industrial consumers' },
      { role: 'assistant', content: 'The NERC Multi-Year Tariff Order (MYTO) 2024, effective July 2026, introduces significant changes for industrial consumers classified under **Band A and Band B**:\n\n### Key Changes:\n- **Band A industrial tariff** increases by 12.3% to ₦225/kWh\n- **Minimum availability guarantee** of 20 hours/day for Band A\n- **Cost-reflective pricing** now includes a carbon adjustment surcharge\n\n### Impact Assessment:\nIndustrial consumers in the Band A category should expect an average monthly increase of approximately **₦1.8M** for mid-sized manufacturing facilities.' },
    ],
  },
];

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('epdh_chat_sessions') || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        setHistory([...saved, ...defaultHistory]);
      } else {
        setHistory(defaultHistory);
      }
    } catch (e) {
      setHistory(defaultHistory);
    }
  }, []);

  const handleDeleteSession = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    if (selectedConversation?.id === id) {
      setSelectedConversation(null);
    }
    try {
      const saved = JSON.parse(localStorage.getItem('epdh_chat_sessions') || '[]');
      const filtered = saved.filter((s: any) => String(s.id) !== String(id));
      localStorage.setItem('epdh_chat_sessions', JSON.stringify(filtered));
    } catch (err) {
      // ignore
    }
  };

  const filteredHistory = history.filter(item => 
    item.query.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Conversation History</h1>
            <p className="mt-1 text-sm text-gray-500">Access, review, and search your saved AI conversation sessions.</p>
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
              <option>All Time</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-6">
          {/* Conversation list */}
          <div className={`${selectedConversation ? 'w-2/5' : 'w-full'} transition-all duration-300`}>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Saved AI Sessions</h2>
                <span className="text-[10px] font-bold text-gray-400 uppercase">{filteredHistory.length} Results</span>
              </div>
              <ul className="divide-y divide-gray-200">
                {filteredHistory.length === 0 ? (
                  <li className="p-12 text-center text-sm text-gray-500 italic">No matching conversations found.</li>
                ) : filteredHistory.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => setSelectedConversation(item)}
                    className={`p-5 cursor-pointer transition-all group ${
                      selectedConversation?.id === item.id
                        ? 'bg-brand/5 border-l-[3px] border-l-brand'
                        : 'hover:bg-gray-50/80 border-l-[3px] border-l-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <p className={`text-sm font-bold transition-colors ${
                          selectedConversation?.id === item.id ? 'text-brand' : 'text-gray-900 group-hover:text-brand'
                        }`}>{item.query}</p>
                        <div className="flex items-center gap-3 mt-2">
                           <span className="text-[10px] font-bold text-gray-400 uppercase">{item.timestamp}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                            {item.sessionLength} MESSAGES
                          </span>
                          <button
                            onClick={(e) => handleDeleteSession(item.id, e)}
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete session"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Inline Preview Pane */}
          {selectedConversation && (
            <div className="w-3/5 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Conversation Preview</h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">{selectedConversation.timestamp}</p>
                </div>
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-280px)]">
                {selectedConversation.messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-lg px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-brand text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-800'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
