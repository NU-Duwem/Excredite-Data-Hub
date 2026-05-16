'use client';

import { useState } from 'react';

interface Document {
  id: number;
  title: string;
  date: string;
  class: 'PUBLIC' | 'INTERNAL' | 'LEGAL_PRIVILEGED';
  type: string;
  size: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
}

export default function DocumentsPage() {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [query, setQuery] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [filterClass, setFilterClass] = useState('All');
  const [docType, setDocType] = useState('REGULATORY_ORDER');
  const [classification, setClassification] = useState('PUBLIC');

  // Mock document list
  const documents: Document[] = [
    { id: 1, title: 'NERC Multi-Year Tariff Order 2024', date: '2024-12-15', class: 'PUBLIC', type: 'TARIFF_DETERMINATION', size: '2.4 MB', status: 'COMPLETE' },
    { id: 2, title: 'TCN Q1 Grid Disturbance Report', date: '2025-04-02', class: 'INTERNAL', type: 'MARKET_REPORT', size: '5.1 MB', status: 'PROCESSING' },
    { id: 3, title: 'Notice of Appeal - DISCO Tariff Dispute', date: '2025-05-10', class: 'LEGAL_PRIVILEGED', type: 'COURT_JUDGMENT', size: '1.2 MB', status: 'COMPLETE' },
    { id: 4, title: 'Draft Policy on Renewable Integration', date: '2025-05-14', class: 'INTERNAL', type: 'POLICY_PAPER', size: '0.8 MB', status: 'PENDING' },
  ];

  const handleAskQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAnswering) return;
    setIsAnswering(true);
    setTimeout(() => {
      setIsAnswering(false);
      setQuery('');
    }, 2000);
  };

  const filteredDocs = documents.filter(doc => {
    if (filterClass === 'All') return true;
    return doc.class === filterClass;
  });

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Document Registry & AI Q&A</h1>
            <p className="mt-1 text-sm text-gray-500">Securely store regulatory files and query them for insights.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Upload & Repository */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Upload Area */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Upload New Document</h2>
              <div className="mt-2 flex justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 hover:border-brand transition-colors cursor-pointer group">
                <div className="text-center">
                  <svg className="mx-auto h-10 w-10 text-gray-400 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="mt-3 flex text-sm leading-6 text-gray-600">
                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-bold text-brand hover:opacity-80">
                      <span>Select PDF file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf" />
                    </label>
                    <p className="pl-1 font-medium">or drag and drop</p>
                  </div>
                  <p className="text-[10px] uppercase font-bold text-gray-400 mt-1">Maximum size: 50MB</p>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Type</label>
                  <select 
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-8 text-xs font-semibold focus:ring-brand focus:border-brand border"
                  >
                    <option value="REGULATORY_ORDER">Regulatory Order</option>
                    <option value="COURT_JUDGMENT">Court Judgment</option>
                    <option value="POLICY_PAPER">Policy Paper</option>
                    <option value="TARIFF_DETERMINATION">Tariff Order</option>
                    <option value="MARKET_REPORT">Market Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Classification</label>
                  <select 
                    value={classification}
                    onChange={(e) => setClassification(e.target.value)}
                    className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-8 text-xs font-semibold focus:ring-brand focus:border-brand border"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="LEGAL_PRIVILEGED">Legal Privileged</option>
                  </select>
                </div>
              </div>
              <button className="mt-5 w-full bg-brand text-white rounded-md py-2.5 text-xs font-bold hover:opacity-90 shadow-sm transition-all uppercase tracking-wide">
                Register Document
              </button>
            </div>

            {/* Document Repository */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
              <div className="px-4 py-4 border-b border-gray-200 flex flex-col gap-3 bg-gray-50">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Document Repository</h2>
                  <select 
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="text-[10px] font-bold border-gray-200 rounded py-1 pl-2 pr-6 border focus:ring-brand"
                  >
                    <option value="All">All Classes</option>
                    <option value="PUBLIC">Public</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="LEGAL_PRIVILEGED">Privileged</option>
                  </select>
                </div>
                <input type="text" placeholder="Search by title or type..." className="rounded-md border-gray-200 py-1.5 px-3 text-xs border focus:ring-brand focus:border-brand w-full" />
              </div>
              <ul role="list" className="divide-y divide-gray-200 flex-1 overflow-y-auto">
                {filteredDocs.map((doc) => (
                  <li 
                    key={doc.id} 
                    onClick={() => doc.status === 'COMPLETE' && setSelectedDoc(doc)}
                    className={`p-4 transition-colors flex justify-between items-start ${
                      doc.status === 'COMPLETE' ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60 grayscale cursor-not-allowed'
                    } ${selectedDoc?.id === doc.id ? 'bg-brand/5 border-l-4 border-l-brand' : ''}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">{doc.title}</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{doc.type.replace('_', ' ')}</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-[10px] font-medium text-gray-500">{doc.date}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold ring-1 ring-inset ${
                        doc.class === 'PUBLIC' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                        doc.class === 'INTERNAL' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' : 
                        'bg-red-50 text-red-700 ring-red-600/10'
                      }`}>
                        {doc.class}
                      </span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                        doc.status === 'COMPLETE' ? 'bg-brand/10 text-brand' :
                        doc.status === 'PROCESSING' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column: Q&A Viewer */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[600px] overflow-hidden">
            {selectedDoc ? (
              <>
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">AI Document Assistant</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Currently analyzing: <span className="font-semibold text-brand">{selectedDoc.title}</span></p>
                  </div>
                  <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                  {/* Document Preview Placeholder */}
                  <div className="aspect-[16/9] w-full bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-200">
                    <div className="text-center">
                      <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-xs font-bold text-gray-400 mt-2 uppercase tracking-widest">Secure Document Viewer</p>
                    </div>
                  </div>

                  {/* AI Response Area */}
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-2 w-2 bg-brand rounded-full animate-pulse"></div>
                      <h4 className="text-xs font-bold text-gray-900 uppercase">AI Insight</h4>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      Select a part of the document or ask a question below to begin analysis. I will cite specific sections and page numbers.
                    </p>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white">
                  <form onSubmit={handleAskQuestion} className="relative flex items-center">
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ask a question about this document..."
                      className="block w-full rounded-xl border-gray-300 shadow-sm focus:border-brand focus:ring-brand bg-gray-50 py-3 pl-4 pr-12 text-sm border transition-all"
                      disabled={isAnswering}
                    />
                    <button
                      type="submit"
                      disabled={!query.trim() || isAnswering}
                      className="absolute right-2 p-1.5 rounded-lg text-white bg-brand hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
                <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                  <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Select a Document</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Click on a completed document from the repository to open the AI Q&A assistant.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
