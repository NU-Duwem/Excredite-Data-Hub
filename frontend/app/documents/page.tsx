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
  linked_matter_id?: string | null;
}

interface Matter {
  id: string;
  reference_code: string;
  client_name: string;
  matter_type: string;
  status: string;
}

type DocTab = 'upload' | 'view-document' | 'document-generator' | 'ai-outputs';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const DOC_TYPES = [
  { value: 'REGULATORY_ORDER', label: 'Regulatory Order' },
  { value: 'COURT_JUDGMENT', label: 'Court Judgment' },
  { value: 'POLICY_PAPER', label: 'Policy Paper' },
  { value: 'TARIFF_DETERMINATION', label: 'Tariff Order' },
  { value: 'MARKET_REPORT', label: 'Market Report' },
  { value: 'LEGAL_BRIEF', label: 'Legal Brief' },
  { value: 'DOCUMENT_NOTE', label: 'Document Note' },
  { value: 'OTHER', label: 'Other (specify)' },
];

const DATE_PRESETS = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: 'All-time', days: 0 },
  { label: 'Custom', days: -1 },
];

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<DocTab>('upload');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
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
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keywords field (renamed from Subject / Matter Reference)
  const [keywords, setKeywords] = useState('');

  // Link to Legal Matter state
  const [linkToMatter, setLinkToMatter] = useState(false);
  const [matterSearch, setMatterSearch] = useState('');
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [mattersDropdown, setMattersDropdown] = useState<Matter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(false);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Unified AI assistant state (merged AI Edit + Ask question)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

  // Sharing state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // Documents from DB
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

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

  // Fetch matters for Link to Legal Matter dropdown
  useEffect(() => {
    if (linkToMatter && matterSearch.length > 0) {
      const fetchMatters = async () => {
        setMattersLoading(true);
        const { data } = await supabase
          .from('matters')
          .select('id, reference_code, client_name, matter_type, status')
          .or(`reference_code.ilike.%${matterSearch}%,client_name.ilike.%${matterSearch}%,matter_type.ilike.%${matterSearch}%`)
          .limit(8);
        setMattersDropdown(data || []);
        setMattersLoading(false);
      };
      const timer = setTimeout(fetchMatters, 300);
      return () => clearTimeout(timer);
    } else {
      setMattersDropdown([]);
    }
  }, [matterSearch, linkToMatter, supabase]);

  // Generate file preview URL when file is selected
  useEffect(() => {
    if (selectedFile && selectedFile.type === 'application/pdf') {
      const url = URL.createObjectURL(selectedFile);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [selectedFile]);

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

  // Deselect file handler
  const handleDeselectFile = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      if (keywords) formData.append('keywords', keywords);
      if (selectedMatter) formData.append('linkedMatterId', selectedMatter.id);

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
          setKeywords('');
          setLinkToMatter(false);
          setSelectedMatter(null);
          setUploadProgress('idle');
          setUploadMessage('');
          setFilePreviewUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }, 3000);
      }
    } catch (err) {
      setUploadProgress('error');
      setUploadMessage('Network error. Please try again.');
    }
  };

  // Unified AI assistant handler
  const handleAiAssist = () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponse('');
    // Mock AI response
    setTimeout(() => {
      if (isEditing) {
        setEditContent(prev => prev + '\n\n[AI Suggestion] ' + aiPrompt + ': The analysis indicates that the regulatory framework should be updated to reflect current market conditions, with particular attention to tariff band rebalancing and generation capacity adequacy margins.');
      }
      setAiResponse('Based on the document analysis: The regulatory framework should be updated to reflect current market conditions, with particular attention to tariff band rebalancing and generation capacity adequacy margins. Key findings include a 15% shortfall in generation output relative to the MYTO benchmark.');
      setAiLoading(false);
      setAiPrompt('');
    }, 2000);
  };

  const handleShareLink = () => {
    if (selectedDoc) {
      navigator.clipboard.writeText(`${window.location.origin}/documents/share/${selectedDoc.id}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  // Overwrite original document content notes
  const handleSaveOverwrite = async () => {
    if (!selectedDoc) return;
    setSaveLoading(true);
    setSaveStatus('Saving changes...');
    try {
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'overwrite',
          documentId: selectedDoc.id,
          content: editContent,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setSaveStatus('Document saved successfully!');
        setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? result.document : d));
        setSelectedDoc(result.document);
        setIsEditing(false);
      } else {
        setSaveStatus(`Error: ${result.error || 'Failed to save'}`);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message || 'Network error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  // Save edited content as a new copy
  const handleSaveNewCopy = async () => {
    if (!selectedDoc) return;
    setSaveLoading(true);
    setSaveStatus('Creating copy...');
    try {
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'new-copy',
          documentId: selectedDoc.id,
          content: editContent,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setSaveStatus('Copy created successfully!');
        setDocuments(prev => [result.document, ...prev]);
        setSelectedDoc(result.document);
        setIsEditing(false);
      } else {
        setSaveStatus(`Error: ${result.error || 'Failed to copy'}`);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message || 'Network error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  // Save generated document to registry
  const handleSaveGeneratedToRegistry = async () => {
    if (!briefingText || !briefSubject) return;
    setSaveLoading(true);
    setSaveStatus('Saving to registry...');
    try {
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-generated',
          title: briefSubject,
          content: briefingText,
          documentType: 'DOCUMENT_NOTE',
          classification: 'INTERNAL',
          matterId: selectedMatter?.id || null,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setSaveStatus('Generated document saved!');
        setDocuments(prev => [result.document, ...prev]);
      } else {
        setSaveStatus(`Error: ${result.error || 'Failed to save'}`);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message || 'Network error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  // ============================================
  // DOCUMENT GENERATOR STATE (formerly Briefing)
  // ============================================
  const [briefSubject, setBriefSubject] = useState('');
  const [briefDateFrom, setBriefDateFrom] = useState('');
  const [briefDateTo, setBriefDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('Custom');
  const [briefCategories, setBriefCategories] = useState({
    generation: true, distribution: false, tariffs: true, regulatory: false, gas: false,
  });
  const [isBriefGenerating, setIsBriefGenerating] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefProgressMsg, setBriefProgressMsg] = useState('');

  const briefValid = briefSubject.trim().length > 0 && Object.values(briefCategories).some(Boolean);

  // Handle date preset selection
  const handleDatePreset = (preset: { label: string; days: number }) => {
    setDatePreset(preset.label);
    if (preset.days === 0) {
      // All-time
      setBriefDateFrom('');
      setBriefDateTo('');
    } else if (preset.days > 0) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - preset.days);
      setBriefDateTo(to.toISOString().split('T')[0]);
      setBriefDateFrom(from.toISOString().split('T')[0]);
    }
    // Custom: do nothing, let user pick
  };

  // Build summary line for document generator
  const activeCats = Object.entries(briefCategories).filter(([, v]) => v).map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));
  const summaryLine = briefSubject ? 
    `This will compile ${activeCats.length > 0 ? activeCats.join(', ') : 'all'} data${briefDateFrom && briefDateTo ? ` from ${new Date(briefDateFrom).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}–${new Date(briefDateTo).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}` : ' (all-time)'}${selectedMatter ? `, linked to ${selectedMatter.reference_code}` : ''}.` 
    : '';

  const handleGenerateDocument = (e: React.FormEvent) => {
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
      setBriefingText(`# Document: ${briefSubject}\n**Period:** ${briefDateFrom || 'Historical Baseline'} to ${briefDateTo || 'Current Date'}\n\n## 1. Headline Summary\nThe power sector experienced significant fluctuations during the reporting period, primarily driven by gas supply constraints affecting thermal generation and subsequent regulatory interventions.\n\n## 2. Key Metrics\n- Average Daily Generation: 4,120 MW\n- Peak Generation: 4,850 MW\n- ATC&C Losses (Estimated): 42%\n- Transmission Loss Factor: 7.2%\n\n## 3. Analysis\nGeneration output fell short of the MYTO benchmark by 15%. The decline was most pronounced in the western grid corridor.\n\n## 4. Regulatory Context\nNERC issued two minor enforcement actions regarding load rejection during this period.\n\n## 5. Implications and Recommendations\n- **Operational:** Review gas supply agreements for redundancy clauses.\n- **Strategic:** Anticipate a minor downward revision in allowable tariffs.`);
      setIsBriefGenerating(false);
    }, 6000);
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Document Registry & Workspace</h1>
            <p className="mt-1 text-sm text-gray-500">Upload, edit, generate documents, and manage all files in one place.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {[
              { id: 'upload' as DocTab, label: 'Upload' },
              { id: 'view-document' as DocTab, label: 'View Document' },
              { id: 'document-generator' as DocTab, label: 'Document Generator' },
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
        {/* TAB: Upload */}
        {/* ============================================ */}
        {activeTab === 'upload' && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Upload Area */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Upload New Document</h2>
              <form onSubmit={handleUpload}>
                <div
                  onClick={() => !selectedFile && fileInputRef.current?.click()}
                  className={`mt-2 flex justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
                    selectedFile ? 'border-brand/30 bg-brand/5' : 'border-gray-300 hover:border-brand cursor-pointer group'
                  }`}
                >
                  <div className="text-center">
                    {selectedFile ? (
                      <>
                        <svg className="mx-auto h-10 w-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="mt-2 text-sm font-bold text-gray-900">{selectedFile.name}</p>
                        <p className="text-[10px] text-gray-500">{formatFileSize(selectedFile.size)}</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeselectFile(); }}
                          className="mt-2 text-xs font-bold text-red-600 hover:text-red-700 underline transition-colors"
                        >
                          Remove file
                        </button>
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

                {/* File Preview */}
                {selectedFile && filePreviewUrl && (
                  <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">File Preview</span>
                    </div>
                    <iframe src={filePreviewUrl} className="w-full h-48 bg-white" title="File preview" />
                  </div>
                )}
                {selectedFile && !filePreviewUrl && (
                  <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 text-center">
                    <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-xs font-bold text-gray-400 uppercase">Preview not available for this file type</p>
                    <p className="text-[10px] text-gray-400 mt-1">{selectedFile.name} ({formatFileSize(selectedFile.size)})</p>
                  </div>
                )}

                {/* Document Title */}
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

                {/* Keywords (renamed from Subject / Matter Reference) */}
                <div className="mt-4">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Keywords</label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="e.g. tariff, generation, grid instability"
                    className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-3 text-xs font-semibold focus:ring-brand focus:border-brand border"
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

                {/* Link to Legal Matter Toggle */}
                <div className="mt-5 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-700">Link to a Legal Matter</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Optional — tie this document to a specific case.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLinkToMatter(!linkToMatter); if (linkToMatter) { setSelectedMatter(null); setMatterSearch(''); } }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        linkToMatter ? 'bg-brand' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                          linkToMatter ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {linkToMatter && !selectedMatter && (
                    <div className="mt-3 relative">
                      <input
                        type="text"
                        value={matterSearch}
                        onChange={(e) => setMatterSearch(e.target.value)}
                        placeholder="Search by reference code, client, or matter type..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-brand focus:border-brand"
                      />
                      {mattersLoading && (
                        <div className="absolute right-3 top-2.5">
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand"></div>
                        </div>
                      )}
                      {mattersDropdown.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {mattersDropdown.map(m => (
                            <li 
                              key={m.id}
                              onClick={() => {
                                setSelectedMatter(m);
                                setMatterSearch('');
                                setMattersDropdown([]);
                                // Auto-suggest title if empty
                                if (!uploadTitle) {
                                  setUploadTitle(`${m.client_name} - ${m.matter_type} Document`);
                                }
                              }}
                              className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs"
                            >
                              <span className="font-bold text-gray-900">{m.reference_code}</span>
                              <span className="text-gray-500 ml-2">{m.client_name}</span>
                              <span className={`ml-2 text-[10px] font-bold uppercase ${m.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-400'}`}>{m.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {selectedMatter && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-brand/5 border border-brand/20 rounded-lg">
                        <svg className="h-4 w-4 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-bold text-gray-900 flex-1">
                          Linked to {selectedMatter.reference_code} ({selectedMatter.client_name} – {selectedMatter.status})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedMatter(null)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 italic">
                        This document will be traceable to {selectedMatter.reference_code} in the matter&apos;s document history.
                      </p>
                    </div>
                  )}
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
                  Upload Document
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* TAB: View Document */}
        {/* ============================================ */}
        {activeTab === 'view-document' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Document Repository */}
            <div className="lg:col-span-5 space-y-6">
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
                        onClick={() => { setIsEditing(!isEditing); if (!isEditing) setEditContent(selectedDoc.notes || ''); }}
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

                        {/* Save Options */}
                        <div className="flex gap-3 pt-2">
                          <button 
                            onClick={handleSaveNewCopy}
                            disabled={saveLoading}
                            className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saveLoading ? 'Processing...' : 'Save as New Copy'}
                          </button>
                          <button 
                            onClick={handleSaveOverwrite}
                            disabled={saveLoading}
                            className="flex-1 py-2.5 bg-gray-800 text-white text-xs font-bold rounded-lg hover:opacity-90 shadow-sm transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saveLoading ? 'Saving...' : 'Overwrite Original'}
                          </button>
                        </div>
                        {saveStatus && (
                          <p className={`text-xs mt-2 font-medium ${saveStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                            {saveStatus}
                          </p>
                        )}
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
                      </>
                    )}

                    {/* AI Response Area */}
                    {aiResponse && (
                      <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-2 w-2 bg-brand rounded-full animate-pulse"></div>
                          <h4 className="text-xs font-bold text-gray-900 uppercase">AI Response</h4>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {aiResponse}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Unified AI Assistant Panel */}
                  <div className="p-4 border-t border-gray-200 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-1.5 w-1.5 bg-brand rounded-full"></div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">AI Assistant — {isEditing ? 'Edit & Ask' : 'Ask a Question'}</span>
                    </div>
                    <div className="relative flex items-center gap-2">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={isEditing ? 'e.g. Make this section more formal, or ask a question...' : 'Ask a question about this document...'}
                        className="block w-full rounded-xl border-gray-300 shadow-sm focus:border-brand focus:ring-brand bg-gray-50 py-3 pl-4 pr-4 text-sm border transition-all"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiAssist(); } }}
                        disabled={aiLoading}
                      />
                      <button
                        onClick={handleAiAssist}
                        disabled={!aiPrompt.trim() || aiLoading}
                        className="p-2.5 rounded-lg text-white bg-brand hover:opacity-90 disabled:opacity-50 transition-all shrink-0"
                      >
                        {aiLoading ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        )}
                      </button>
                    </div>
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
        {/* TAB: Document Generator (formerly Briefing) */}
        {/* ============================================ */}
        {activeTab === 'document-generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Document Configuration</h2>
              <form onSubmit={handleGenerateDocument} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Keywords</label>
                  <input type="text" value={briefSubject} onChange={(e) => setBriefSubject(e.target.value)} placeholder="e.g. Grid Instability Q1 Analysis" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm shadow-sm focus:ring-brand focus:border-brand bg-white font-medium" required />
                </div>

                {/* Date Range Presets */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Date Range</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {DATE_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleDatePreset(preset)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          datePreset === preset.label ? 'bg-brand/10 border-brand text-brand' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {datePreset === 'Custom' && (
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
                  )}
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

                {/* Live summary line */}
                {summaryLine && (
                  <p className="text-[10px] text-gray-500 italic bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {summaryLine}
                  </p>
                )}

                <button type="submit" disabled={isBriefGenerating || !briefValid} className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-xs font-bold text-white bg-brand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest">
                  {isBriefGenerating ? 'GENERATING...' : 'GENERATE DOCUMENT'}
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
                    <div className="flex space-x-3 items-center">
                      {saveStatus && (
                        <span className={`text-[10px] font-bold mr-2 ${saveStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                          {saveStatus}
                        </span>
                      )}
                      <button 
                        onClick={handleSaveGeneratedToRegistry}
                        disabled={saveLoading}
                        className="inline-flex items-center px-4 py-2 border border-gray-200 shadow-sm text-[10px] font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saveLoading ? 'Saving...' : 'Save to Registry'}
                      </button>
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
                        <p className="text-xs text-gray-400 mt-2 max-w-xs mx-auto font-medium">Configure your document parameters and click Generate.</p>
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
              <p className="text-xs text-gray-500">Documents generated by the AI Query Interface are captured here.</p>
            </div>
            <div className="p-12 text-center">
              <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mx-auto mb-4">
                <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">No AI Outputs Yet</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">When you ask the AI Query Interface to generate a report or document, the output will be captured here for archival alongside your uploaded documents.</p>
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
