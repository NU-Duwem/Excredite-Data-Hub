'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Document {
  id: string;
  title: string;
  created_at: string;
  classification: 'PUBLIC' | 'INTERNAL' | 'LEGAL_PRIVILEGED';
  document_type: string;
  file_size_bytes: number | null;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  s3_key: string | null;
  notes: string | null;
  source?: 'upload' | 'ai_generated';
}

type DocTab = 'repository' | 'briefing' | 'ai-outputs';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const DOC_TYPES = [
  { value: 'REGULATORY_ORDER', label: 'Regulatory Order' },
  { value: 'COURT_JUDGMENT', label: 'Court Judgment' },
  { value: 'POLICY_PAPER', label: 'Policy Paper' },
  { value: 'TARIFF_DETERMINATION', label: 'Tariff Order' },
  { value: 'MARKET_REPORT', label: 'Market Report' },
  { value: 'LEGAL_BRIEF', label: 'Legal Brief' },
  { value: 'BRIEFING_NOTE', label: 'Briefing Note' },
  { value: 'OTHER', label: 'Other (specify)' },
];

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<DocTab>('repository');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [query, setQuery] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [filterClass, setFilterClass] = useState('All');
  const [searchText, setSearchText] = useState('');

  // Upload state
  const [docType, setDocType] = useState('REGULATORY_ORDER');
  const [customType, setCustomType] = useState('');
  const [classification, setClassification] = useState('PUBLIC');
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [aiEditLoading, setAiEditLoading] = useState(false);

  // Sharing state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // Documents from DB
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);

  const supabase = createClient();

  // Fetch documents
  useEffect(() => {
    const fetchDocs = async () => {
      setDocsLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setDocuments(data);
      }
      setDocsLoading(false);
    };
    fetchDocs();
  }, [supabase]);

  // Mock documents fallback
  const allDocs: Document[] = documents.length > 0 ? documents : [
    { id: '1', title: 'NERC Multi-Year Tariff Order 2024', created_at: '2024-12-15', classification: 'PUBLIC', document_type: 'TARIFF_DETERMINATION', file_size_bytes: 2500000, processing_status: 'COMPLETE', s3_key: null, notes: null },
    { id: '2', title: 'TCN Q1 Grid Disturbance Report', created_at: '2025-04-02', classification: 'INTERNAL', document_type: 'MARKET_REPORT', file_size_bytes: 5300000, processing_status: 'PROCESSING', s3_key: null, notes: null },
    { id: '3', title: 'Notice of Appeal - DISCO Tariff Dispute', created_at: '2025-05-10', classification: 'LEGAL_PRIVILEGED', document_type: 'COURT_JUDGMENT', file_size_bytes: 1200000, processing_status: 'COMPLETE', s3_key: null, notes: null },
    { id: '4', title: 'Draft Policy on Renewable Integration', created_at: '2025-05-14', classification: 'INTERNAL', document_type: 'POLICY_PAPER', file_size_bytes: 800000, processing_status: 'PENDING', s3_key: null, notes: null },
  ];

  const filteredDocs = allDocs.filter(doc => {
    const matchesClass = filterClass === 'All' || doc.classification === filterClass;
    const matchesSearch = !searchText || doc.title.toLowerCase().includes(searchText.toLowerCase()) || doc.document_type.toLowerCase().includes(searchText.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // File selection handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadMessage(`Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      setUploadProgress('error');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadMessage(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max: 50MB.`);
      setUploadProgress('error');
      return;
    }

    setSelectedFile(file);
    if (!uploadTitle) setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    setUploadProgress('idle');
    setUploadMessage('');
  };

  // Upload handler
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadTitle) return;

    setUploadProgress('uploading');
    setUploadMessage('Uploading document...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadTitle);
      formData.append('documentType', docType);
      formData.append('customType', customType);
      formData.append('classification', classification);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        setUploadProgress('error');
        setUploadMessage(result.error || 'Upload failed. Please try again.');
      } else {
        setUploadProgress('success');
        setUploadMessage(`"${uploadTitle}" uploaded successfully!`);
        // Add to local documents list
        if (result.document) {
          setDocuments(prev => [result.document, ...prev]);
        }
        // Reset form
        setTimeout(() => {
          setSelectedFile(null);
          setUploadTitle('');
          setDocType('REGULATORY_ORDER');
          setCustomType('');
          setClassification('PUBLIC');
          setUploadProgress('idle');
          setUploadMessage('');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }, 3000);
      }
    } catch (err) {
      setUploadProgress('error');
      setUploadMessage('Network error. Please try again.');
    }
  };

  const handleAskQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAnswering) return;
    setIsAnswering(true);
    setTimeout(() => {
      setIsAnswering(false);
      setQuery('');
    }, 2000);
  };

  const handleAiEdit = () => {
    if (!aiEditPrompt.trim()) return;
    setAiEditLoading(true);
    // Mock AI edit
    setTimeout(() => {
      setEditContent(prev => prev + '\n\n[AI Suggestion] ' + aiEditPrompt + ': The analysis indicates that the regulatory framework should be updated to reflect current market conditions, with particular attention to tariff band rebalancing and generation capacity adequacy margins.');
      setAiEditLoading(false);
      setAiEditPrompt('');
    }, 2000);
  };

  const handleShareLink = () => {
    if (selectedDoc) {
      navigator.clipboard.writeText(`${window.location.origin}/documents/share/${selectedDoc.id}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  // ============================================
  // BRIEFING NOTE GENERATOR STATE
  // ============================================
  const [briefSubject, setBriefSubject] = useState('');
  const [briefDateFrom, setBriefDateFrom] = useState('');
  const [briefDateTo, setBriefDateTo] = useState('');
  const [briefCategories, setBriefCategories] = useState({
    generation: true, distribution: false, tariffs: true, regulatory: false, gas: false,
  });
  const [isBriefGenerating, setIsBriefGenerating] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefProgressMsg, setBriefProgressMsg] = useState('');

  const briefValid = briefSubject.trim().length > 0 && Object.values(briefCategories).some(Boolean);

  const handleGenerateBriefing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!briefValid || isBriefGenerating) return;
    setIsBriefGenerating(true);
    setBriefingText(null);

    const stages = [
      { msg: 'COMPILING GRID DATA...', delay: 0 },
      { msg: 'ANALYZING TELEMETRY PATTERNS...', delay: 1500 },
      { msg: 'DRAFTING EXECUTIVE SUMMARY...', delay: 3000 },
      { msg: 'FORMATTING OFFICIAL DOCUMENT...', delay: 4500 },
    ];
    stages.forEach(s => setTimeout(() => setBriefProgressMsg(s.msg), s.delay));

    setTimeout(() => {
      setBriefingText(`# Briefing Note: ${briefSubject}\n**Period:** ${briefDateFrom || 'Historical Baseline'} to ${briefDateTo || 'Current Date'}\n\n## 1. Headline Summary\nThe power sector experienced significant fluctuations during the reporting period, primarily driven by gas supply constraints affecting thermal generation and subsequent regulatory interventions.\n\n## 2. Key Metrics\n- Average Daily Generation: 4,120 MW\n- Peak Generation: 4,850 MW\n- ATC&C Losses (Estimated): 42%\n- Transmission Loss Factor: 7.2%\n\n## 3. Analysis\nGeneration output fell short of the MYTO benchmark by 15%. The decline was most pronounced in the western grid corridor.\n\n## 4. Regulatory Context\nNERC issued two minor enforcement actions regarding load rejection during this period.\n\n## 5. Implications and Recommendations\n- **Operational:** Review gas supply agreements for redundancy clauses.\n- **Strategic:** Anticipate a minor downward revision in allowable tariffs.`);
      setIsBriefGenerating(false);
    }, 6000);
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Document Registry & Workspace</h1>
            <p className="mt-1 text-sm text-gray-500">Upload, edit, generate briefings, and manage all documents in one place.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-6">
            {[
              { id: 'repository' as DocTab, label: 'Repository & Upload' },
              { id: 'briefing' as DocTab, label: 'Briefing Generator' },
              { id: 'ai-outputs' as DocTab, label: 'AI Query Outputs' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === tab.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ============================================ */}
        {/* TAB: Repository & Upload */}
        {/* ============================================ */}
        {activeTab === 'repository' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Upload & Repository */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Upload Area */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Upload New Document</h2>
                <form onSubmit={handleUpload}>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 flex justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 hover:border-brand transition-colors cursor-pointer group"
                  >
                    <div className="text-center">
                      {selectedFile ? (
                        <>
                          <svg className="mx-auto h-10 w-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="mt-2 text-sm font-bold text-gray-900">{selectedFile.name}</p>
                          <p className="text-[10px] text-gray-500">{formatFileSize(selectedFile.size)}</p>
                        </>
                      ) : (
                        <>
                          <svg className="mx-auto h-10 w-10 text-gray-400 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="mt-3 flex text-sm leading-6 text-gray-600">
                            <span className="font-bold text-brand hover:opacity-80">Select file</span>
                            <p className="pl-1 font-medium">or drag and drop</p>
                          </div>
                          <p className="text-[10px] uppercase font-bold text-gray-400 mt-1">PDF, Word, Excel, PowerPoint • Max 50MB</p>
                        </>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    onChange={handleFileSelect}
                  />

                  {/* Title */}
                  <div className="mt-4">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Title</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="e.g. NERC Tariff Order 2025"
                      className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-3 text-xs font-semibold focus:ring-brand focus:border-brand border"
                      required
                    />
                  </div>
                  
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Type</label>
                      <select 
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-8 text-xs font-semibold focus:ring-brand focus:border-brand border"
                      >
                        {DOC_TYPES.map(dt => (
                          <option key={dt.value} value={dt.value}>{dt.label}</option>
                        ))}
                      </select>
                      {docType === 'OTHER' && (
                        <input
                          type="text"
                          value={customType}
                          onChange={(e) => setCustomType(e.target.value)}
                          placeholder="Specify document type..."
                          className="mt-2 block w-full rounded-md border-gray-200 py-2 pl-3 pr-3 text-xs font-semibold focus:ring-brand focus:border-brand border"
                          required
                        />
                      )}
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

                  {/* Upload Progress / Status */}
                  {uploadProgress === 'uploading' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand"></div>
                        <span className="text-xs font-bold text-brand uppercase">{uploadMessage}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-brand h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                      </div>
                    </div>
                  )}
                  {uploadProgress === 'success' && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-xs font-bold text-green-700">{uploadMessage}</span>
                    </div>
                  )}
                  {uploadProgress === 'error' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-bold text-red-700">{uploadMessage}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setUploadProgress('idle'); setUploadMessage(''); }}
                        className="mt-2 text-xs font-bold text-red-600 underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!selectedFile || !uploadTitle || uploadProgress === 'uploading' || (docType === 'OTHER' && !customType)}
                    className="mt-5 w-full bg-brand text-white rounded-md py-2.5 text-xs font-bold hover:opacity-90 shadow-sm transition-all uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Register Document
                  </button>
                </form>
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
                  <input
                    type="text"
                    placeholder="Search by title or type..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="rounded-md border-gray-200 py-1.5 px-3 text-xs border focus:ring-brand focus:border-brand w-full"
                  />
                </div>
                <ul role="list" className="divide-y divide-gray-200 flex-1 overflow-y-auto">
                  {docsLoading ? (
                    <li className="p-8 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto"></div>
                    </li>
                  ) : filteredDocs.length === 0 ? (
                    <li className="p-8 text-center text-xs text-gray-500">No documents found.</li>
                  ) : (
                    filteredDocs.map((doc) => (
                      <li 
                        key={doc.id} 
                        onClick={() => doc.processing_status === 'COMPLETE' && setSelectedDoc(doc)}
                        className={`p-4 transition-colors flex justify-between items-start ${
                          doc.processing_status === 'COMPLETE' ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-60 grayscale cursor-not-allowed'
                        } ${selectedDoc?.id === doc.id ? 'bg-brand/5 border-l-4 border-l-brand' : ''}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">{doc.title}</span>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">{doc.document_type.replace(/_/g, ' ')}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-[10px] font-medium text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-[10px] font-medium text-gray-500">{formatFileSize(doc.file_size_bytes)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold ring-1 ring-inset ${
                            doc.classification === 'PUBLIC' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                            doc.classification === 'INTERNAL' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' : 
                            'bg-red-50 text-red-700 ring-red-600/10'
                          }`}>
                            {doc.classification}
                          </span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                            doc.processing_status === 'COMPLETE' ? 'bg-brand/10 text-brand' :
                            doc.processing_status === 'PROCESSING' ? 'bg-blue-50 text-blue-600 animate-pulse' :
                            doc.processing_status === 'FAILED' ? 'bg-red-50 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {doc.processing_status}
                          </span>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            {/* Right Column: Document Viewer / Editor */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[600px] overflow-hidden">
              {selectedDoc ? (
                <>
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Document Workspace</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Viewing: <span className="font-semibold text-brand">{selectedDoc.title}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowShareModal(true)}
                        className="px-3 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors uppercase"
                      >
                        Share
                      </button>
                      <button
                        onClick={() => { setIsEditing(!isEditing); if (!isEditing) setEditContent(''); }}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors uppercase ${
                          isEditing ? 'bg-brand text-white' : 'text-gray-700 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {isEditing ? 'Exit Editor' : 'Edit'}
                      </button>
                      <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 p-6 overflow-y-auto space-y-6">
                    {isEditing ? (
                      /* Editing workspace */
                      <div className="space-y-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="Begin editing this document content..."
                          className="w-full h-64 p-4 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand focus:border-transparent outline-none resize-none"
                        />
                        
                        {/* AI Edit Assistance */}
                        <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                          <h4 className="text-xs font-bold text-gray-900 uppercase mb-2">AI Edit Suggestion</h4>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={aiEditPrompt}
                              onChange={(e) => setAiEditPrompt(e.target.value)}
                              placeholder="e.g. Make this section more formal..."
                              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-brand focus:border-brand"
                            />
                            <button
                              onClick={handleAiEdit}
                              disabled={aiEditLoading || !aiEditPrompt.trim()}
                              className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                            >
                              {aiEditLoading ? 'Generating...' : 'Apply AI'}
                            </button>
                          </div>
                        </div>

                        {/* Save Options */}
                        <div className="flex gap-3 pt-2">
                          <button className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase">
                            Save as New Copy
                          </button>
                          <button className="flex-1 py-2.5 bg-gray-800 text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase">
                            Overwrite Original
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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
                    <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Click on a completed document from the repository to open the workspace.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TAB: Briefing Generator */}
        {/* ============================================ */}
        {activeTab === 'briefing' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Report Configuration</h2>
              <form onSubmit={handleGenerateBriefing} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Subject / Matter Reference</label>
                  <input type="text" value={briefSubject} onChange={(e) => setBriefSubject(e.target.value)} placeholder="e.g. Grid Instability Q1 Analysis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm shadow-sm focus:ring-brand focus:border-brand bg-white font-medium" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                    <input type="date" value={briefDateFrom} onChange={(e) => setBriefDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs shadow-sm focus:ring-brand focus:border-brand bg-white font-semibold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                    <input type="date" value={briefDateTo} onChange={(e) => setBriefDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs shadow-sm focus:ring-brand focus:border-brand bg-white font-semibold" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Data Categories</label>
                  <div className="space-y-2.5 p-4 bg-gray-50 rounded-lg border border-gray-100">
                    {Object.entries(briefCategories).map(([key, value]) => (
                      <label key={key} className="flex items-center group cursor-pointer">
                        <input type="checkbox" checked={value} onChange={() => setBriefCategories(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))} className="h-4 w-4 text-brand focus:ring-brand border-gray-300 rounded transition-all" />
                        <span className={`ml-3 text-xs font-semibold uppercase tracking-wide transition-colors ${value ? 'text-gray-900' : 'text-gray-400'}`}>{key}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" disabled={isBriefGenerating || !briefValid} className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-xs font-bold text-white bg-brand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest">
                  {isBriefGenerating ? 'GENERATING...' : 'GENERATE BRIEFING'}
                </button>
              </form>
            </div>

            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm min-h-[600px] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">Document Preview</span>
                  </div>
                  {briefingText && (
                    <div className="flex space-x-3">
                      <button className="inline-flex items-center px-4 py-2 border border-gray-200 shadow-sm text-[10px] font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all uppercase tracking-wider">Save to Registry</button>
                      <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-[10px] font-bold rounded-lg text-white bg-brand hover:opacity-90 transition-all uppercase tracking-wider">Download PDF</button>
                    </div>
                  )}
                </div>
                <div className="p-8 sm:p-12 flex-1">
                  {isBriefGenerating ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-6">
                      <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-brand animate-spin"></div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">{briefProgressMsg}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">AI processing can take up to 60 seconds</p>
                      </div>
                    </div>
                  ) : briefingText ? (
                    <div className="max-w-none">
                      {briefingText.split('\n').map((line, i) => {
                        if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold text-gray-900 mb-6 border-b-2 border-brand pb-2">{line.substring(2)}</h1>;
                        if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-gray-800 mt-10 mb-4 uppercase tracking-tight">{line.substring(3)}</h2>;
                        if (line.startsWith('**') && line.includes(':**')) {
                          const parts = line.split(':**');
                          return <p key={i} className="mb-3 text-sm text-gray-700 leading-relaxed"><strong className="text-gray-900">{parts[0].substring(2)}:</strong>{parts[1]}</p>;
                        }
                        if (line.startsWith('- ')) return <li key={i} className="ml-6 list-disc text-sm text-gray-700 mb-2 marker:text-brand">{line.substring(2)}</li>;
                        if (line.trim() === '') return <div key={i} className="h-4" />;
                        return <p key={i} className="mb-4 text-sm text-gray-700 leading-relaxed">{line}</p>;
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                      <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                        <svg className="h-10 w-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Awaiting Input</h3>
                        <p className="text-xs text-gray-400 mt-2 max-w-xs mx-auto font-medium">Configure your briefing parameters and click Generate.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TAB: AI Query Outputs */}
        {/* ============================================ */}
        {activeTab === 'ai-outputs' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">AI-Generated Documents</h2>
              <p className="text-xs text-gray-500">Documents and briefings generated by the AI Query Interface are captured here.</p>
            </div>
            <div className="p-12 text-center">
              <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mx-auto mb-4">
                <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">No AI Outputs Yet</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">When you ask the AI Query Interface to generate a report or briefing, the output will be captured here for archival alongside your uploaded documents.</p>
            </div>
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && selectedDoc && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">Share Document</h3>
                <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-xs text-gray-500">Sharing: <span className="font-semibold text-gray-900">{selectedDoc.title}</span></p>
              <p className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3 font-medium">
                Shared links respect this document&apos;s access permissions. Only authorised users can view the content.
              </p>

              {/* Email Share */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Share via Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-brand focus:border-brand"
                  />
                  <button
                    disabled={!shareEmail}
                    className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* Copy Link */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Copy Shareable Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/documents/share/${selectedDoc.id}`}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs bg-gray-50 text-gray-600 font-mono"
                  />
                  <button
                    onClick={handleShareLink}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      shareCopied ? 'bg-green-600 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                  >
                    {shareCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
