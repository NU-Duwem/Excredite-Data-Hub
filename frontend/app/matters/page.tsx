'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

interface Matter {
  id: string;
  ref: string;
  client: string;
  matterType: string;
  regulatoryInstrument: string;
  forum: string;
  nextDeadline: string;
  description: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'CLOSED' | 'APPEAL';
  leadAdvisor: string;
  stage: number;
}

export default function MattersPage() {
  const [canCreate, setCanCreate] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [mattersList, setMattersList] = useState<Matter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(true);

  // Related documents state
  const [relatedDocs, setRelatedDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // New Engagement Modal state
  const [showNewMatterModal, setShowNewMatterModal] = useState(false);
  const [newMatterForm, setNewMatterForm] = useState({
    client: '',
    reference: '',
    matterType: 'Tariff Dispute',
    regulatoryInstrument: 'MYTO 2024 Order',
    forum: 'NERC Tribunal',
    nextDeadline: '',
    description: '',
    leadAdvisor: '',
    status: 'ACTIVE',
  });
  const [savingMatter, setSavingMatter] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const supabase = createClient();

  const mockMatters: Matter[] = [
    {
      id: '1',
      ref: 'REG/2026/01',
      client: 'Abuja Electricity Distribution Plc (AEDC)',
      matterType: 'Tariff Dispute',
      regulatoryInstrument: 'NERC MYTO Order 2024 / Band A Tariff',
      forum: 'NERC Rate Case',
      nextDeadline: '2026-07-28',
      description: 'Challenging Band A service level compliance benchmarks and revenue shortfall calculations.',
      status: 'ACTIVE',
      leadAdvisor: 'B. Ekpo',
      stage: 2,
    },
    {
      id: '2',
      ref: 'ENF/2026/04',
      client: 'Mainstream Energy Solutions',
      matterType: 'NERC Enforcement',
      regulatoryInstrument: 'Grid Code Section 4.2 & NERC Enforcement Regulations',
      forum: 'NERC Tribunal',
      nextDeadline: '2026-07-20', // overdue
      description: 'Defending against alleged uninstructed generation deviation notice issued post grid disturbance.',
      status: 'ACTIVE',
      leadAdvisor: 'J. Doe',
      stage: 1,
    },
    {
      id: '3',
      ref: 'LIC/2026/09',
      client: 'Egbin Power Plc',
      matterType: 'Licence Application',
      regulatoryInstrument: 'Electricity Act 2023 Section 63',
      forum: 'NERC Rate Case',
      nextDeadline: '2026-08-15',
      description: 'Application for generation licence expansion for Phase II thermal capacity integration.',
      status: 'ACTIVE',
      leadAdvisor: 'B. Ekpo',
      stage: 3,
    },
    {
      id: '4',
      ref: 'GAS/2026/02',
      client: 'Azura-Edo IPP',
      matterType: 'Gas Supply Dispute',
      regulatoryInstrument: 'GSAA Agreement / Domestic Gas Supply Obligation',
      forum: 'CAMA Arbitration',
      nextDeadline: '2026-08-02',
      description: 'Arbitration over ELPS gas pressure drop liquidated damages and NGC delivery guarantees.',
      status: 'ON_HOLD',
      leadAdvisor: 'A. Okon',
      stage: 1,
    },
  ];

  // Fetch permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.role === 'power_legal' || user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'power_admin') {
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
            organisations (
              short_name
            )
          `);

        if (!error && data && data.length > 0) {
          const formatted: Matter[] = data.map(m => ({
            id: m.id,
            ref: m.matter_reference || 'N/A',
            client: (m.organisations as any)?.short_name || 'N/A',
            matterType: m.matter_type.replace(/_/g, ' '),
            regulatoryInstrument: 'NERC Order / Electricity Act 2023',
            forum: 'NERC Tribunal',
            nextDeadline: '2026-08-15',
            description: m.title || 'Regulatory advisory engagement in electricity supply industry.',
            status: m.status as any,
            leadAdvisor: m.lead_counsel || 'N/A',
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
          const isRealUuid = selectedMatter.id.length === 36;
          const query = supabase
            .from('documents')
            .select('id, title, document_type, created_at, processing_status');
          
          if (isRealUuid) {
            query.eq('matter_id', selectedMatter.id);
          } else {
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

  // Save new engagement
  const handleSaveNewMatter = async () => {
    if (!newMatterForm.description || !newMatterForm.client) return;
    setSavingMatter(true);
    setSaveMessage('');
    try {
      const { data: org } = await supabase
        .from('organisations')
        .select('id')
        .ilike('short_name', `%${newMatterForm.client}%`)
        .limit(1)
        .single();

      const { data, error } = await supabase
        .from('matters')
        .insert({
          client_id: org?.id || null,
          matter_reference: newMatterForm.reference || `REG/2026/0${mattersList.length + 1}`,
          matter_type: newMatterForm.matterType,
          title: newMatterForm.description,
          status: newMatterForm.status,
          lead_counsel: newMatterForm.leadAdvisor || null,
        })
        .select()
        .single();

      if (error) {
        setSaveMessage(`Error: ${error.message}`);
      } else {
        setSaveMessage('Engagement created successfully!');
        const newItem: Matter = {
          id: data.id,
          ref: data.matter_reference || `REG/2026/0${mattersList.length + 1}`,
          client: newMatterForm.client,
          matterType: newMatterForm.matterType,
          regulatoryInstrument: newMatterForm.regulatoryInstrument || 'NERC Order 2024',
          forum: newMatterForm.forum || 'NERC Tribunal',
          nextDeadline: newMatterForm.nextDeadline || '2026-08-30',
          description: newMatterForm.description,
          status: data.status as any,
          leadAdvisor: newMatterForm.leadAdvisor || 'N/A',
          stage: 1,
        };
        setMattersList(prev => [newItem, ...prev]);
        setTimeout(() => {
          setShowNewMatterModal(false);
          setNewMatterForm({
            client: '',
            reference: '',
            matterType: 'Tariff Dispute',
            regulatoryInstrument: 'MYTO 2024 Order',
            forum: 'NERC Tribunal',
            nextDeadline: '',
            description: '',
            leadAdvisor: '',
            status: 'ACTIVE',
          });
          setSaveMessage('');
        }, 1500);
      }
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    } finally {
      setSavingMatter(false);
    }
  };

  // KPI Calculations
  const totalActive = mattersList.filter(m => m.status === 'ACTIVE').length;
  const nercForumCount = mattersList.filter(m => m.forum.toLowerCase().includes('nerc')).length;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const imminentCount = mattersList.filter(m => {
    if (!m.nextDeadline) return false;
    const diffTime = new Date(m.nextDeadline).getTime() - new Date(todayStr).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }).length;

  const getDeadlineBadge = (dateStr: string) => {
    if (!dateStr) return null;
    const diffTime = new Date(dateStr).getTime() - new Date(todayStr).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
          OVERDUE ({dateStr})
        </span>
      );
    }
    if (diffDays <= 7) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          {diffDays === 0 ? 'DUE TODAY' : `DUE IN ${diffDays} DAYS`} ({dateStr})
        </span>
      );
    }
    return <span className="text-xs text-gray-600 font-medium">{dateStr}</span>;
  };

  const stages = ['Filing', 'Discovery', 'Hearing', 'Judgment'];

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Regulatory & Advisory Matters</h1>
            <p className="mt-1 text-sm text-gray-500">Active engagements across the Nigerian Electricity Supply Industry.</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowNewMatterModal(true)}
              className="bg-brand text-white rounded-lg px-4 py-2.5 text-xs font-bold hover:opacity-90 transition-all shadow-sm uppercase tracking-wider"
            >
              + New Engagement
            </button>
          )}
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Active Matters</p>
            <p className="text-2xl font-bold text-gray-900">{totalActive} <span className="text-xs text-gray-400 font-semibold">Active</span></p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">Across all NESI clients</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Matters Before NERC</p>
            <p className="text-2xl font-bold text-brand">{nercForumCount}</p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">Tribunal & Rate Cases</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Imminent Deadlines</p>
            <p className="text-2xl font-bold text-amber-600">{imminentCount}</p>
            <p className="text-[10px] text-amber-700 font-bold mt-1">Within 7 days / Overdue</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Top Matter Type</p>
            <p className="text-base font-bold text-gray-900 truncate">Tariff Disputes</p>
            <p className="text-[10px] text-gray-500 font-medium mt-1">MYTO Band A & shortfall cases</p>
          </div>
        </div>

        {/* Status Flow Visualization (Visible when matter selected) */}
        {selectedMatter && (
          <div className="bg-white p-6 rounded-xl border border-brand/20 shadow-sm animate-in fade-in slide-in-from-top-4 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-900 uppercase">Engagement Details: <span className="text-brand">{selectedMatter.ref}</span></h3>
              <button onClick={() => setSelectedMatter(null)} className="text-gray-400 hover:text-gray-600">
                 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="text-sm font-semibold text-gray-800 bg-gray-50 p-3 rounded-lg border border-gray-200">{selectedMatter.description}</p>

            <div className="relative pt-2">
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

            {/* Related Documents */}
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
                <p className="text-xs text-gray-400 italic">No documents linked to this engagement yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Table Section */}
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Engagement Registry</h2>
          </div>
          {mattersLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto"></div>
              <p className="text-xs text-gray-500 mt-2">Loading engagements...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[220px]">Reference & Substance</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Matter Type</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Regulatory Instrument</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Forum</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Next Deadline</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lead Advisor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {mattersList.map((matter) => (
                    <tr 
                      key={matter.id} 
                      onClick={() => setSelectedMatter(matter)}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedMatter?.id === matter.id ? 'bg-brand/5' : ''}`}
                    >
                      <td className="py-4 pl-4 pr-3 text-sm">
                        <div className="font-bold text-brand">{matter.ref}</div>
                        <div className="text-xs text-gray-600 font-medium line-clamp-1 mt-0.5" title={matter.description}>
                          {matter.description}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-semibold">{matter.client}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-gray-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">
                          {matter.matterType}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-600 font-medium max-w-[200px] truncate" title={matter.regulatoryInstrument}>
                        {matter.regulatoryInstrument}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-gray-700">{matter.forum}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        {getDeadlineBadge(matter.nextDeadline)}
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
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 font-semibold">{matter.leadAdvisor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* New Engagement Modal */}
      {showNewMatterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">+ New Engagement</h3>
              <button onClick={() => { setShowNewMatterModal(false); setSaveMessage(''); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">One-Line Matter Description *</label>
                <input
                  type="text"
                  value={newMatterForm.description}
                  onChange={(e) => setNewMatterForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. Challenging Band A tariff service level compliance benchmarks..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Client Short Name *</label>
                  <input
                    type="text"
                    value={newMatterForm.client}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, client: e.target.value }))}
                    placeholder="e.g. AEDC or Mainstream"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Reference Code</label>
                  <input
                    type="text"
                    value={newMatterForm.reference}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="e.g. REG/2026/05"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Matter Type</label>
                  <select
                    value={newMatterForm.matterType}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, matterType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-brand focus:border-brand"
                  >
                    <option value="Tariff Dispute">Tariff Dispute</option>
                    <option value="NERC Enforcement">NERC Enforcement</option>
                    <option value="Licence Application">Licence Application</option>
                    <option value="Grid Code Violation">Grid Code Violation</option>
                    <option value="Gas Supply Dispute">Gas Supply Dispute</option>
                    <option value="Market Settlement">Market Settlement</option>
                    <option value="Policy Advisory">Policy Advisory</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Forum</label>
                  <select
                    value={newMatterForm.forum}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, forum: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-brand focus:border-brand"
                  >
                    <option value="NERC Tribunal">NERC Tribunal</option>
                    <option value="Federal High Court">Federal High Court</option>
                    <option value="CAMA Arbitration">CAMA Arbitration</option>
                    <option value="NERC Rate Case">NERC Rate Case</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Regulatory Instrument</label>
                <input
                  type="text"
                  value={newMatterForm.regulatoryInstrument}
                  onChange={(e) => setNewMatterForm(prev => ({ ...prev, regulatoryInstrument: e.target.value }))}
                  placeholder="e.g. NERC MYTO Order 2024 / Electricity Act 2023 Sec 63"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Next Deadline</label>
                  <input
                    type="date"
                    value={newMatterForm.nextDeadline}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, nextDeadline: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lead Advisor</label>
                  <input
                    type="text"
                    value={newMatterForm.leadAdvisor}
                    onChange={(e) => setNewMatterForm(prev => ({ ...prev, leadAdvisor: e.target.value }))}
                    placeholder="e.g. B. Ekpo"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {saveMessage && (
                <p className={`text-xs font-medium ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowNewMatterModal(false); setSaveMessage(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewMatter}
                  disabled={savingMatter || !newMatterForm.description || !newMatterForm.client}
                  className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingMatter ? 'Saving...' : 'Create Engagement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
