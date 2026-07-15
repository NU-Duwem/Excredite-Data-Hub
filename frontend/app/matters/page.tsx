'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

interface Matter {
  id: string;
  ref: string;
  client: string;
  type: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'CLOSED' | 'APPEAL';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  counsel: string;
  deadline: string;
  stage: number; // 1-4 for status flow
}

export default function MattersPage() {
  const [canCreate, setCanCreate] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [mattersList, setMattersList] = useState<Matter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(true);

  // Related documents state
  const [relatedDocs, setRelatedDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const supabase = createClient();

  const mockMatters: Matter[] = [
    { id: '1', ref: 'LIT/2025/08', client: 'AEDC', type: 'Tariff Dispute', status: 'ACTIVE', priority: 'HIGH', counsel: 'B. Ekpo', deadline: '2026-06-01', stage: 2 },
    { id: '2', ref: 'REG/2025/12', client: 'Mainstream', type: 'Compliance', status: 'ON_HOLD', priority: 'MEDIUM', counsel: 'J. Doe', deadline: '2026-05-20', stage: 1 },
    { id: '3', ref: 'APP/2026/01', client: 'Egbin Thermal', type: 'Contractual', status: 'APPEAL', priority: 'HIGH', counsel: 'B. Ekpo', deadline: '2026-07-15', stage: 3 },
  ];

  // Fetch permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.role === 'power_legal' || user?.user_metadata?.role === 'admin') {
          setCanCreate(true);
        }
      } catch (error) {
        console.error('Error fetching user session:', error);
      }
    };
    checkPermissions();
  }, [supabase]);

  // Fetch matters dynamically
  useEffect(() => {
    const fetchMatters = async () => {
      setMattersLoading(true);
      try {
        const { data, error } = await supabase
          .from('matters')
          .select(`
            id,
            matter_reference,
            matter_type,
            title,
            status,
            lead_counsel,
            next_deadline,
            organisations (
              short_name
            )
          `);

        if (!error && data && data.length > 0) {
          const formatted: Matter[] = data.map(m => ({
            id: m.id,
            ref: m.matter_reference || 'N/A',
            client: (m.organisations as any)?.short_name || 'N/A',
            type: m.matter_type.replace(/_/g, ' '),
            status: m.status as any,
            priority: 'HIGH',
            counsel: m.lead_counsel || 'N/A',
            deadline: m.next_deadline || 'N/A',
            stage: m.status === 'ACTIVE' ? 2 : m.status === 'ON_HOLD' ? 1 : 4,
          }));
          setMattersList(formatted);
        } else {
          setMattersList(mockMatters);
        }
      } catch (err) {
        console.error('Error fetching matters:', err);
        setMattersList(mockMatters);
      } finally {
        setMattersLoading(false);
      }
    };
    fetchMatters();
  }, [supabase]);

  // Fetch related documents when selectedMatter changes
  useEffect(() => {
    if (selectedMatter) {
      const fetchRelatedDocs = async () => {
        setDocsLoading(true);
        try {
          // Attempt query if it's a real UUID (length 36) or fallback to ref code
          const isRealUuid = selectedMatter.id.length === 36;
          const query = supabase
            .from('documents')
            .select('id, title, document_type, created_at, processing_status');
          
          if (isRealUuid) {
            query.eq('matter_id', selectedMatter.id);
          } else {
            // For mock data fallback, query by keywords/title matching ref code
            query.ilike('title', `%${selectedMatter.client}%`);
          }

          const { data, error } = await query;
          if (!error && data) {
            setRelatedDocs(data);
          } else {
            setRelatedDocs([]);
          }
        } catch (err) {
          console.error('Error fetching related documents:', err);
          setRelatedDocs([]);
        } finally {
          setDocsLoading(false);
        }
      };
      fetchRelatedDocs();
    } else {
      setRelatedDocs([]);
    }
  }, [selectedMatter, supabase]);

  const stages = ['Filing', 'Discovery', 'Hearing', 'Judgment'];

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Legal Matters</h1>
            <p className="mt-1 text-sm text-gray-500">Professional case management and litigation tracking.</p>
          </div>
          {canCreate && (
            <button className="bg-brand text-white rounded-lg px-4 py-2 text-xs font-bold hover:opacity-90 transition-all shadow-sm uppercase tracking-wider">
              + Open New Matter
            </button>
          )}
        </div>

        {/* Status Flow Visualization (Visible when matter selected) */}
        {selectedMatter && (
          <div className="bg-white p-6 rounded-xl border border-brand/20 shadow-sm animate-in fade-in slide-in-from-top-4 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-900 uppercase">Matter Progress: <span className="text-brand">{selectedMatter.ref}</span></h3>
              <button onClick={() => setSelectedMatter(null)} className="text-gray-400 hover:text-gray-600">
                 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-between">
                {stages.map((stage, idx) => (
                  <div key={stage} className="flex flex-col items-center">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white ${
                      idx + 1 <= selectedMatter.stage ? 'bg-brand text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {idx + 1 <= selectedMatter.stage ? (
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <span className="mt-2 text-[10px] font-bold uppercase text-gray-500">{stage}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related Documents section (Two-way Traceability loop) */}
            <div className="pt-6 border-t border-gray-100">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Related Documents</h4>
              {docsLoading ? (
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand"></div>
                  <span>Loading linked documents...</span>
                </div>
              ) : relatedDocs.length > 0 ? (
                <ul className="divide-y divide-gray-100 bg-gray-50 rounded-lg border border-gray-200">
                  {relatedDocs.map((doc) => (
                    <li key={doc.id} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{doc.title}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase ml-2 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                          {doc.document_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
                        <span className="bg-brand/10 text-brand text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {doc.processing_status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 italic">No documents linked to this matter yet.</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Matter Registry</h2>
            <div className="flex gap-2">
               <button className="text-[10px] font-bold text-gray-500 hover:text-brand transition-colors uppercase">Sort by Priority</button>
               <span className="text-gray-300">|</span>
               <button className="text-[10px] font-bold text-gray-500 hover:text-brand transition-colors uppercase">Filter by Client</button>
            </div>
          </div>
          {mattersLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto"></div>
              <p className="text-xs text-gray-500 mt-2">Loading matters...</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reference</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Priority</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lead Counsel</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Next Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {mattersList.map((matter) => (
                  <tr 
                    key={matter.id} 
                    onClick={() => setSelectedMatter(matter)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedMatter?.id === matter.id ? 'bg-brand/5' : ''}`}
                  >
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-bold text-brand">{matter.ref}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-semibold">{matter.client}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        matter.priority === 'HIGH' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {matter.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${
                        matter.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                        matter.status === 'APPEAL' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                        'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                      }`}>
                        {matter.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 font-medium">{matter.counsel}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-bold">{matter.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
