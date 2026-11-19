'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import AccessDialog from './AccessDialog';
import DraftingDesk from './DraftingDesk';
import { passagesToSections } from '@/utils/passages';

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
  restricted?: boolean;
  uploaded_by?: string | null;
}

interface Matter {
  id: string;
  reference_code: string;
  client_name: string;
  matter_type: string;
  status: string;
}

type DocTab = 'upload' | 'view-document' | 'document-generator';

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

/**
 * Every document row, newest first. The database returns at most 1,000 rows per
 * request, so the list is read in pages (the library now holds well over 1,000).
 */
async function fetchAllDocuments(supabase: SupabaseClient) {
  const PAGE = 1000;
  const all: Document[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}

function NativeDocxViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadDocx = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to download Word document file');
        const blob = await res.blob();
        
        if (containerRef.current && isMounted) {
          containerRef.current.innerHTML = '';
          const { renderAsync } = await import('docx-preview');
          await renderAsync(blob, containerRef.current, undefined, {
            inWrapper: true,
            ignoreWidth: true,
            ignoreHeight: true,
            breakPages: true,
            experimental: true,
          });
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error rendering Word preview');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadDocx();
    return () => { isMounted = false; };
  }, [url]);

  return (
    <div className="w-full h-[560px] overflow-y-auto bg-gray-100 p-4 rounded-xl shadow-inner border border-gray-200">
      {loading && (
        <div className="py-16 text-center text-xs text-gray-500 font-semibold animate-pulse">
          Rendering native Word document...
        </div>
      )}
      {error && (
        <div className="py-12 text-center text-xs text-red-500 font-medium bg-white p-6 rounded-xl max-w-lg mx-auto shadow-md">
          Notice: {error}. You can download the original file above.
        </div>
      )}
      <div ref={containerRef} className="docx-render-canvas max-w-4xl mx-auto shadow-xl bg-white rounded-lg p-2" />
    </div>
  );
}

// Native Microsoft Office Web Embed Engine Component for PPTX, XLSX, DOCX
function NativeOfficeViewer({ docUrl, title }: { docUrl: string; title: string }) {
  const msViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(docUrl)}`;

  return (
    <div className="w-full h-[560px] bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
      <iframe
        src={msViewerUrl}
        className="w-full h-full border-0 rounded-xl"
        title={title}
        allowFullScreen
      />
    </div>
  );
}

function DocumentsContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as DocTab) || 'view-document';

  const [activeTab, setActiveTab] = useState<DocTab>(
    ['upload', 'view-document', 'document-generator'].includes(initialTab) ? initialTab : 'view-document'
  );
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [filterClass, setFilterClass] = useState('All');
  const [searchText, setSearchText] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [docNotice, setDocNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Sync tab with URL search params if present
  useEffect(() => {
    const tabParam = searchParams.get('tab') as DocTab;
    if (tabParam && ['upload', 'view-document', 'document-generator'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Upload state
  const [docType, setDocType] = useState('REGULATORY_ORDER');
  const [customType, setCustomType] = useState('');
  const [classification, setClassification] = useState('PUBLIC');
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'success' | 'error' | 'duplicate'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  // The last successful upload: shown as a confirmation panel that follows processing.
  const [lastUpload, setLastUpload] = useState<{ id: string; title: string; fileName: string; size: number } | null>(null);
  const [duplicateDocMatch, setDuplicateDocMatch] = useState<Document | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keywords field
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

  // AI assistant state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

  // Sharing state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareDocTitle, setShareDocTitle] = useState('');
  const [shareDocId, setShareDocId] = useState('');

  // Documents from DB
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Selected document viewer state
  const [docFileUrl, setDocFileUrl] = useState<string | null>(null);
  const [docChunks, setDocChunks] = useState<any[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [viewerTab, setViewerTab] = useState<'preview' | 'chunks'>('preview');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);

  // Bulk selection state
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const supabase = createClient();

  // Toggle single document selection checkbox
  const toggleSelectDoc = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle select all filtered documents
  const toggleSelectAll = () => {
    if (selectedDocIds.length === filteredDocs.length && filteredDocs.length > 0) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(filteredDocs.map(d => d.id));
    }
  };

  // Delete single document handler via Modal
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const openDeleteModal = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setDocToDelete(doc);
    setShowDeleteModal(true);
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;

    setDeleteModalLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/documents/${docToDelete.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const resJson = await res.json();
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docToDelete.id));
        setSelectedDocIds(prev => prev.filter(id => id !== docToDelete.id));
        if (selectedDoc?.id === docToDelete.id) {
          setSelectedDoc(null);
        }
        setShowDeleteModal(false);
        setDocToDelete(null);
      } else {
        alert(resJson.error || 'Failed to delete document');
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setDeleteModalLoading(false);
    }
  };

  // Bulk Delete Handler
  const confirmBulkDeleteDocs = async () => {
    if (selectedDocIds.length === 0) return;

    setBulkDeleteLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ documentIds: selectedDocIds }),
      });
      const resJson = await res.json();
      if (res.ok) {
        setDocuments(prev => prev.filter(d => !selectedDocIds.includes(d.id)));
        if (selectedDoc && selectedDocIds.includes(selectedDoc.id)) {
          setSelectedDoc(null);
        }
        setSelectedDocIds([]);
        setShowBulkDeleteModal(false);
      } else {
        alert(resJson.error || 'Failed to bulk delete documents');
      }
    } catch (err: any) {
      alert(`Bulk delete error: ${err.message}`);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // Fetch the extracted text (every document) and a signed URL for the original (only when it was stored).
  // Imported documents are often text only, with no original file.
  useEffect(() => {
    if (!selectedDoc) {
      setDocFileUrl(null);
      setDocChunks([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setDocFileUrl(null);
      setChunksLoading(true);
      if (selectedDoc.s3_key) {
        const { data: signedData } = await supabase.storage
          .from('documents')
          .createSignedUrl(selectedDoc.s3_key, 3600);
        if (!cancelled && signedData?.signedUrl) setDocFileUrl(signedData.signedUrl);
      }
      const { data: chunks } = await supabase
        .from('embeddings')
        .select('chunk_index, chunk_text, metadata')
        .eq('document_id', selectedDoc.id)
        .order('chunk_index', { ascending: true })
        .limit(5000);
      if (cancelled) return;
      setDocChunks(chunks || []);
      setChunksLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDoc, supabase]);

  // Get user role
  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Roles live in user_profiles (set by admins), not in user-editable metadata.
        const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
        setUserRole(profile?.role ?? null);
        setUserId(user.id);
        setUserEmail(user.email ?? null);
      }
    };
    fetchUserRole();
  }, [supabase]);

  // Poll for status updates whenever documents are in PENDING or PROCESSING status
  useEffect(() => {
    const hasPending = documents.some(d => d.processing_status === 'PENDING' || d.processing_status === 'PROCESSING');
    if (!hasPending) return;

    const interval = setInterval(async () => {
      const { data: updatedDocs } = await fetchAllDocuments(supabase);

      if (updatedDocs && updatedDocs.length > 0) {
        setDocuments(updatedDocs);
        if (selectedDoc) {
          const fresh = updatedDocs.find(d => d.id === selectedDoc.id);
          if (fresh) setSelectedDoc(fresh);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [documents, selectedDoc, supabase]);

  const isAdmin = userRole === 'power_admin';
  // Overwrite, delete and re-process: admins, or whoever uploaded the document (mirrors the API).
  const canManage = (doc: Document) =>
    isAdmin || (!!userEmail && !!doc.uploaded_by && doc.uploaded_by.toLowerCase() === userEmail.toLowerCase());

  const refreshDoc = async (docId: string) => {
    const { data } = await supabase.from('documents').select('*').eq('id', docId).maybeSingle();
    if (data) {
      setDocuments(prev => prev.map(d => (d.id === docId ? data : d)));
      setSelectedDoc(prev => (prev && prev.id === docId ? data : prev));
    }
  };

  const reprocessSelected = async () => {
    if (!selectedDoc) return;
    setReprocessing(true);
    setDocNotice(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ documentId: selectedDoc.id }),
      });
      const json = await res.json().catch(() => ({}));
      setDocNotice(res.ok
        ? { kind: 'ok', text: 'Re-processed: the text was extracted again and is now searchable by the AI.' }
        : { kind: 'error', text: json.error || 'Re-processing failed.' });
    } catch (err) {
      setDocNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Re-processing failed.' });
    } finally {
      setReprocessing(false);
      await refreshDoc(selectedDoc.id);
    }
  };

  // Helper to trigger manual or background processing of a pending document
  const handleProcessDoc = async (docId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok || res.status === 422) await refreshDoc(docId);
    } catch (err) {
      console.warn('Process document background check:', err);
    }
  };

  // Fetch documents and auto-process PENDING ones
  useEffect(() => {
    const fetchDocs = async () => {
      setDocsLoading(true);
      const { data, error } = await fetchAllDocuments(supabase);

      if (!error && data) {
        setDocuments(data);
        // ?doc=<id> (e.g. from the Overview) opens that document.
        const wanted = searchParams.get('doc');
        const match = wanted ? data.find((d: { id: string }) => d.id === wanted) : null;
        if (match) {
          setSelectedDoc(match);
          setActiveTab('view-document');
        }

        // Trigger background processing once for stuck PENDING documents
        const pendingDocs = data.filter((d: any) => d.processing_status === 'PENDING');
        pendingDocs.forEach((d: any) => {
          handleProcessDoc(d.id);
        });
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

  const allDocs: Document[] = documents;

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

  // File selection handler with Instant Client-Side Duplicate Detection
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
    const cleanedTitle = file.name.replace(/\.[^/.]+$/, '');
    if (!uploadTitle) setUploadTitle(cleanedTitle);

    // Instant check if document with matching size or title already exists in repository
    const matchedDoc = documents.find(d => 
      (d.file_size_bytes && d.file_size_bytes === file.size) ||
      d.title.trim().toLowerCase() === cleanedTitle.trim().toLowerCase()
    );

    if (matchedDoc) {
      setDuplicateDocMatch(matchedDoc);
      setUploadProgress('duplicate');
      setUploadMessage(`Duplicate Warning: A document titled "${matchedDoc.title}" matching this file size (${formatFileSize(file.size)}) already exists in the repository.`);
    } else {
      setDuplicateDocMatch(null);
      setUploadProgress('idle');
      setUploadMessage('');
    }
  };

  const handleDeselectFile = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setDuplicateDocMatch(null);
    setUploadProgress('idle');
    setUploadMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload handler with direct browser storage upload pipeline for large files
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadTitle) return;

    setUploadProgress('uploading');
    setUploadMessage('Preparing upload...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'anonymous';
      const authHeaders = await getAuthHeaders();

      // Compute SHA-256 content hash in browser
      let fileHash = '';
      try {
        const buffer = await selectedFile.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (hErr) {
        console.warn('Browser SHA-256 hash calculation skipped:', hErr);
      }

      // Direct Browser Upload to Supabase Storage (bypasses Next.js dev server body limits)
      const fileExt = selectedFile.name.split('.').pop() || 'bin';
      const storagePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      setUploadMessage(`Uploading file (${formatFileSize(selectedFile.size)})...`);

      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .upload(storagePath, selectedFile, { upsert: false });

      let response;
      if (!storageError) {
        // Direct storage upload succeeded -> Send lightweight JSON payload to backend
        setUploadMessage('Registering document metadata...');
        response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            s3_key: storagePath,
            title: uploadTitle,
            documentType: docType,
            customType,
            classification,
            keywords: keywords || null,
            linkedMatterId: selectedMatter?.id || null,
            fileSize: selectedFile.size,
            fileHash,
          }),
        });
      } else {
        console.warn('Direct storage upload fallback to FormData endpoint:', storageError);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', uploadTitle);
        formData.append('documentType', docType);
        formData.append('customType', customType);
        formData.append('classification', classification);
        if (keywords) formData.append('keywords', keywords);
        if (selectedMatter) formData.append('linkedMatterId', selectedMatter.id);

        response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        });
      }

      const result = await response.json();

      if (!response.ok || result.error) {
        if (response.status === 409 || (result.error && result.error.toLowerCase().includes('duplicate'))) {
          setUploadProgress('duplicate');
          setUploadMessage(result.error);
        } else {
          setUploadProgress('error');
          setUploadMessage(result.error || 'Upload failed. Please try again.');
        }
      } else {
        if (result.document) {
          setDocuments(prev => [result.document, ...prev.filter(d => d.id !== result.document.id)]);
          setLastUpload({ id: result.document.id, title: uploadTitle, fileName: selectedFile.name, size: selectedFile.size });
        }
        // Clear the form; the confirmation panel takes its place until the user moves on.
        setSelectedFile(null);
        setUploadTitle('');
        setDocType('REGULATORY_ORDER');
        setCustomType('');
        setClassification('PUBLIC');
        setKeywords('');
        setLinkToMatter(false);
        setSelectedMatter(null);
        setDuplicateDocMatch(null);
        setUploadProgress('idle');
        setUploadMessage('');
        setFilePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setUploadProgress('error');
      setUploadMessage(err.message || 'Network error during upload');
    }
  };

  const handleAiAssist = async () => {
    if (!aiPrompt.trim() || aiLoading || !selectedDoc) return;
    setAiLoading(true);
    setAiResponse('');

    try {
      if (isEditing) {
        const response = await fetch('/api/documents/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'edit',
            documentId: selectedDoc.id,
            prompt: aiPrompt,
            currentContent: editContent || selectedDoc.notes || '',
          }),
        });

        const result = await response.json();
        if (response.ok && result.result) {
          if (result.updatedContent) setEditContent(result.updatedContent);
          setAiResponse(result.result);
        } else {
          setAiResponse(result.error || 'Unable to process edit request.');
        }
      } else {
        // Document Q&A Retrieval-Augmented Generation
        const response = await fetch(`/api/documents/${selectedDoc.id}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: aiPrompt,
          }),
        });

        const result = await response.json();
        if (response.ok && result.answer) {
          let output = result.answer;
          if (result.citations && result.citations.length > 0) {
            output += '\n\n**Citations & Sources:**\n' + result.citations.map((c: any) => 
              `- ${c.page_number ? `Page ${c.page_number}` : c.slide_number ? `Slide ${c.slide_number}` : 'Section'}: "${c.snippet}"`
            ).join('\n');
          }
          setAiResponse(output);
        } else {
          setAiResponse(result.error || 'Unable to analyze document.');
        }
      }
    } catch (err: any) {
      setAiResponse(`Error: ${err.message || 'Failed to reach AI service'}`);
    } finally {
      setAiLoading(false);
      setAiPrompt('');
    }
  };

  const handleSaveNewCopy = async () => {
    if (!selectedDoc || !editContent) return;
    setSaveLoading(true);
    setSaveStatus('Saving as new copy...');
    try {
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-new',
          documentId: selectedDoc.id,
          title: `${selectedDoc.title} (Edited Copy)`,
          content: editContent,
        }),
      });
      const result = await response.json();
      if (response.ok && result.document) {
        setSaveStatus('Saved as new copy!');
        setDocuments(prev => [result.document, ...prev]);
        setSelectedDoc(result.document);
        setIsEditing(false);
      } else {
        setSaveStatus(`Error: ${result.error || 'Failed to save copy'}`);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message || 'Network error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  const handleSaveOverwrite = async () => {
    if (!selectedDoc || !editContent) return;
    setSaveLoading(true);
    setSaveStatus('Overwriting original document...');
    try {
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-overwrite',
          documentId: selectedDoc.id,
          content: editContent,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setSaveStatus('Document updated successfully!');
        setSelectedDoc(prev => prev ? { ...prev, notes: editContent } : null);
        setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, notes: editContent } : d));
        setIsEditing(false);
      } else {
        setSaveStatus(`Error: ${result.error || 'Failed to overwrite'}`);
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message || 'Network error'}`);
    } finally {
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 4000);
    }
  };

  const handleShareLink = () => {
    if (typeof window !== 'undefined') {
      const link = `${window.location.origin}/documents?id=${shareDocId}`;
      navigator.clipboard.writeText(link);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  // AI Query's "Turn into document" passes the question as ?title=…
  const initialDraftRequest = (searchParams.get('title') ?? '').slice(0, 1000);

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="flex flex-wrap items-center gap-3">
          {activeTab !== 'view-document' && (
            <button
              type="button"
              onClick={() => setActiveTab('view-document')}
              className="min-h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50"
            >
              ← Library
            </button>
          )}
          <div className="mr-auto">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
              {activeTab === 'upload' ? 'Upload documents' : activeTab === 'document-generator' ? 'Generate a document' : 'Documents'}
            </h1>
            {activeTab === 'view-document' && (
              <p className="text-sm text-gray-600">Regulatory filings, legal documents and AI-generated briefings in one library.</p>
            )}
          </div>
          {activeTab === 'view-document' && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('document-generator')}
                className="min-h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50"
              >
                Generate document
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className="min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover"
              >
                Upload
              </button>
            </>
          )}
        </header>

        {/* ============================================ */}
        {/* TAB: Upload */}
        {/* ============================================ */}
        {activeTab === 'upload' && lastUpload && (() => {
          const doc = documents.find(d => d.id === lastUpload.id);
          const status = doc?.processing_status ?? 'PENDING';
          const done = status === 'COMPLETE';
          const failed = status === 'FAILED';
          const step = (state: 'done' | 'active' | 'todo' | 'failed', label: string, hint: string) => (
            <li className="flex items-start gap-3">
              <span aria-hidden="true" className={`mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                state === 'done' ? 'bg-brand text-white' : state === 'failed' ? 'bg-red-600 text-white' : state === 'active' ? 'bg-accent-soft text-accent-ink' : 'bg-gray-100 text-gray-500'
              }`}>
                {state === 'done' ? '✓' : state === 'failed' ? '!' : state === 'active' ? <span className="h-3.5 w-3.5 rounded-full border-2 border-accent-ink border-t-transparent animate-spin" /> : '•'}
              </span>
              <span>
                <span className={`block text-sm font-bold ${state === 'todo' ? 'text-gray-500' : 'text-gray-900'}`}>{label}</span>
                <span className="block text-xs text-gray-600">{hint}</span>
              </span>
            </li>
          );
          return (
            <section aria-live="polite" aria-labelledby="upload-done-title" className={`max-w-3xl mx-auto bg-white rounded-2xl border-2 p-6 sm:p-8 ${failed ? 'border-red-300' : 'border-brand/40'}`}>
              <div className="flex items-start gap-4">
                <span aria-hidden="true" className={`h-14 w-14 shrink-0 rounded-full flex items-center justify-center ${failed ? 'bg-red-100 text-red-700' : 'bg-brand text-white'}`}>
                  {failed ? (
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v5m0 3h.01" /></svg>
                  ) : (
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  )}
                </span>
                <div className="min-w-0">
                  <h2 id="upload-done-title" className="text-xl font-extrabold text-gray-900">
                    {failed ? 'Uploaded, but processing failed' : done ? 'Upload complete' : 'Uploaded: now preparing it for the AI'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-700 break-words">
                    <strong>{lastUpload.title}</strong> · {lastUpload.fileName} · {formatFileSize(lastUpload.size)}
                  </p>
                </div>
              </div>

              <ol className="mt-6 flex flex-col gap-4">
                {step('done', 'File uploaded', 'Saved in the document library.')}
                {step(failed ? 'failed' : done ? 'done' : 'active', 'Reading the text', failed ? 'This step failed (reason below).' : done ? 'Text extracted and indexed.' : 'This usually takes a few seconds to a minute; you can leave this page.')}
                {step(done ? 'done' : failed ? 'todo' : 'todo', 'Ready for AI search', done ? 'The AI can now find and quote this document.' : 'Happens automatically when the text is ready.')}
              </ol>

              {failed && (
                <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                  <strong>Why:</strong> {(() => { const why = doc?.notes || 'The file could not be processed.'; return /[.!?]$/.test(why) ? why : `${why}.`; })()} {canManage(doc ?? ({} as Document)) && !/save (it )?as \.(docx|pptx)/i.test(doc?.notes ?? '') && 'You can try again with Re-process on the document.'}
                </p>
              )}
              {done && doc?.notes && (
                <p className="mt-5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink"><strong>Note:</strong> {doc.notes}</p>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { if (doc) setSelectedDoc(doc); setActiveTab('view-document'); setLastUpload(null); }}
                  className="min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover"
                >
                  Open document
                </button>
                <button
                  type="button"
                  onClick={() => setLastUpload(null)}
                  className="min-h-11 px-5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Upload another
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('view-document'); setLastUpload(null); }}
                  className="min-h-11 px-4 rounded-xl text-sm font-semibold text-brand hover:underline underline-offset-4"
                >
                  Back to library
                </button>
              </div>
            </section>
          );
        })()}

        {activeTab === 'upload' && !lastUpload && (
          <div className="max-w-3xl mx-auto space-y-6">
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

                <div className="mt-4">
                  <label htmlFor="upload-title" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Document Title</label>
                  <input
                    id="upload-title"
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. NERC Tariff Order 2025"
                    className="block w-full rounded-md border-gray-200 py-2 pl-3 pr-3 text-xs font-semibold focus:ring-brand focus:border-brand border"
                    required
                  />
                </div>

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
                    </select>
                  </div>
                </div>

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
                      {mattersDropdown.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {mattersDropdown.map(m => (
                            <li 
                              key={m.id}
                              onClick={() => {
                                setSelectedMatter(m);
                                setMatterSearch('');
                                setMattersDropdown([]);
                              }}
                              className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs"
                            >
                              <span className="font-bold text-gray-900">{m.reference_code}</span>
                              <span className="text-gray-500 ml-2">{m.client_name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {selectedMatter && (
                    <div className="mt-3 flex items-center gap-2 p-2 bg-brand/5 border border-brand/20 rounded-lg">
                      <span className="text-xs font-bold text-gray-900 flex-1">
                        Linked to {selectedMatter.reference_code} ({selectedMatter.client_name})
                      </span>
                      <button type="button" onClick={() => setSelectedMatter(null)} className="text-gray-400 hover:text-red-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Interactive Duplicate Alert Banner */}
                {(uploadProgress === 'duplicate' || duplicateDocMatch || (uploadProgress === 'error' && uploadMessage.toLowerCase().includes('duplicate'))) && (
                  <div className="mt-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 font-bold text-sm">
                        ⚠️
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Duplicate File Alert</h4>
                        <p className="text-xs text-amber-800 mt-1 leading-relaxed font-medium">
                          {uploadMessage || `A document matching this file content or size ("${duplicateDocMatch?.title}") already exists in the repository.`}
                        </p>
                      </div>
                    </div>
                    {duplicateDocMatch && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('view-document');
                            setSelectedDoc(duplicateDocMatch);
                          }}
                          className="px-3 py-1.5 bg-amber-800 text-white text-[10px] font-bold rounded-lg hover:bg-amber-900 uppercase tracking-wider transition-colors shadow-sm"
                        >
                          View Existing Document
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Standard Status Banners */}
                {uploadProgress === 'error' && !uploadMessage.toLowerCase().includes('duplicate') && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
                    {uploadMessage}
                  </div>
                )}
                {uploadProgress === 'uploading' && (
                  <div className="mt-4 p-3 bg-brand/5 border border-brand/20 rounded-lg text-xs font-semibold text-brand flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand" />
                    {uploadMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!selectedFile || !uploadTitle || uploadProgress === 'uploading' || uploadProgress === 'duplicate'}
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
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="w-full lg:w-[400px] lg:shrink-0">
              <div className="bg-white rounded-2xl overflow-hidden flex flex-col min-h-[400px] lg:max-h-[calc(100vh-11rem)]">
                <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={selectedDocIds.length > 0 && selectedDocIds.length === filteredDocs.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer"
                        title="Select All"
                      />
                      <h2 className="text-[11px] font-extrabold tracking-wider uppercase text-gray-600">
                        {filteredDocs.length} document{filteredDocs.length === 1 ? '' : 's'}
                      </h2>
                    </label>
                    {isAdmin && (
                      <select 
                        value={filterClass}
                        onChange={(e) => setFilterClass(e.target.value)}
                        className="text-xs font-semibold border-gray-200 rounded-lg py-1 pl-2.5 pr-7 border focus:ring-brand focus:border-brand bg-white shadow-sm"
                      >
                        <option value="All">All Classes</option>
                        <option value="PUBLIC">Public</option>
                        <option value="INTERNAL">Internal</option>
                      </select>
                    )}
                  </div>
                  <label htmlFor="doc-search" className="sr-only">Search documents</label>
                  <input
                    id="doc-search"
                    type="search"
                    placeholder="Search by title or type…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand"
                  />
                  {/* Bulk Action Toolbar */}
                  {selectedDocIds.length > 0 && (
                    <div className="flex items-center justify-between bg-red-50 border border-red-200/80 p-3 rounded-xl text-xs animate-in fade-in duration-150">
                      <span className="font-bold text-red-800 text-xs">
                        {selectedDocIds.length} document{selectedDocIds.length > 1 ? 's' : ''} selected
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedDocIds([])}
                          className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 uppercase tracking-wider"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => setShowBulkDeleteModal(true)}
                          className="px-3.5 py-1.5 bg-red-600 text-white text-[11px] font-bold rounded-lg hover:bg-red-700 transition-colors uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Selected ({selectedDocIds.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <ul role="list" className="scroll-panel relative flex-1 p-2 flex flex-col gap-0.5">
                  {docsLoading ? (
                    <li className="p-10 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto"></div>
                    </li>
                  ) : filteredDocs.length === 0 ? (
                    <li className="p-10 text-center text-xs text-gray-500 font-medium">No documents found.</li>
                  ) : (
                    filteredDocs.map((doc) => {
                      const ready = doc.processing_status === 'COMPLETE';
                      const ext = (doc.s3_key?.split('.').pop() || (doc.source === 'ai_generated' ? 'AI' : 'DOC')).slice(0, 4).toUpperCase();
                      const badge =
                        ext === 'PDF' ? 'bg-red-50 text-red-800' :
                        ext.startsWith('DOC') ? 'bg-blue-50 text-blue-800' :
                        ext.startsWith('XLS') || ext === 'CSV' ? 'bg-green-50 text-green-800' :
                        ext.startsWith('PPT') ? 'bg-accent-soft text-accent-ink' : 'bg-gray-100 text-gray-700';
                      const active = selectedDoc?.id === doc.id;
                      return (
                      <li
                        key={doc.id}
                        onClick={() => ready && setSelectedDoc(doc)}
                        className={`rounded-xl p-3 flex items-start gap-3 transition-colors ${
                          ready ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed'
                        } ${active ? 'bg-brand/10 hover:bg-brand/10' : ''} ${selectedDocIds.includes(doc.id) ? 'ring-1 ring-red-200 bg-red-50/40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${doc.title}`}
                          checked={selectedDocIds.includes(doc.id)}
                          onClick={(e) => toggleSelectDoc(e, doc.id)}
                          onChange={() => {}}
                          className="mt-3 h-4 w-4 shrink-0 rounded accent-brand cursor-pointer"
                        />
                        <span aria-hidden="true" className={`h-11 w-10 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-extrabold ${badge}`}>
                          {ext}
                        </span>
                        <div className="flex flex-col min-w-0 flex-1 gap-1">
                          {ready ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); }}
                              aria-current={active ? 'true' : undefined}
                              className={`text-left text-sm leading-snug break-words ${active ? 'font-bold text-brand' : 'font-semibold text-gray-900'}`}
                            >
                              {doc.title}
                            </button>
                          ) : (
                            <span className="text-sm font-semibold text-gray-600 leading-snug break-words">{doc.title}</span>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                              {doc.document_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                            </span>
                            {/* Classification visible to admin only */}
                            {isAdmin && (
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                doc.classification === 'PUBLIC' ? 'bg-brand/10 text-brand' :
                                doc.classification === 'LEGAL_PRIVILEGED' ? 'bg-red-50 text-red-800' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {doc.classification === 'LEGAL_PRIVILEGED' ? 'Legal privileged' : doc.classification === 'PUBLIC' ? 'Public' : 'Internal'}
                              </span>
                            )}
                            {doc.restricted && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-900 text-white">Restricted</span>
                            )}
                            {!ready && (
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                doc.processing_status === 'FAILED' ? 'bg-red-50 text-red-800' : 'bg-accent-soft text-accent-ink'
                              }`}>
                                {doc.processing_status === 'FAILED' ? 'Processing failed' : 'Processing…'}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-600">{new Date(doc.created_at).toLocaleDateString('en-GB')}</span>
                          </div>
                        </div>
                        {canManage(doc) && <button
                          type="button"
                          onClick={(e) => openDeleteModal(e, doc)}
                          aria-label={`Delete ${doc.title}`}
                          title="Delete document"
                          className="shrink-0 h-9 w-9 flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>}
                      </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full bg-white rounded-2xl flex flex-col min-h-[600px] overflow-hidden">
              {selectedDoc ? (
                <>
                  <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap justify-between items-start gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold text-gray-900 leading-snug break-words">
                        {selectedDoc.title}
                        {selectedDoc.restricted && <span className="ml-2 align-middle px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-900 text-white">Restricted</span>}
                      </h2>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {selectedDoc.document_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        {' · '}{formatFileSize(selectedDoc.file_size_bytes)}
                        {' · added '}{new Date(selectedDoc.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowAccess(true)}
                          className="min-h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50"
                        >
                          Access
                        </button>
                      )}
                      {canManage(selectedDoc) && (
                        <button
                          type="button"
                          onClick={() => void reprocessSelected()}
                          disabled={reprocessing}
                          className="min-h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50 disabled:opacity-50"
                        >
                          {reprocessing ? 'Re-processing…' : 'Re-process'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setShareDocTitle(selectedDoc.title); setShareDocId(selectedDoc.id); setShowShareModal(true); }}
                        className="min-h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsEditing(!isEditing); if (!isEditing) setEditContent(selectedDoc.notes || ''); }}
                        className={`min-h-10 px-3.5 rounded-xl text-sm font-semibold ${
                          isEditing ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-brand hover:bg-gray-50'
                        }`}
                      >
                        {isEditing ? 'Exit editor' : 'Edit with AI'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDoc(null)}
                        aria-label="Close document"
                        className="h-10 w-10 flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 p-6 overflow-y-auto space-y-6">
                    {docNotice && (
                      <p role={docNotice.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${docNotice.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-brand/10 text-brand'}`}>
                        {docNotice.text}
                      </p>
                    )}
                    {isEditing ? (
                      <div className="space-y-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="Begin editing this document content..."
                          className="w-full h-64 p-4 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand focus:border-transparent outline-none resize-none"
                        />
                        <div className="flex gap-3 pt-2">
                          <button onClick={handleSaveNewCopy} disabled={saveLoading} className="flex-1 py-2.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all uppercase">
                            {saveLoading ? 'Processing...' : 'Save as New Copy'}
                          </button>
                          <button onClick={handleSaveOverwrite} disabled={saveLoading} className="flex-1 py-2.5 bg-gray-800 text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all uppercase">
                            {saveLoading ? 'Saving...' : 'Overwrite Original'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Document Metadata Header Banner */}
                        <div className="bg-gray-50/90 p-4 rounded-xl border border-gray-200/80 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                          <div className="flex items-center space-x-3.5">
                            <div className="h-11 w-11 bg-amber-100/90 border border-amber-300/60 text-amber-900 font-black rounded-xl flex items-center justify-center text-xs uppercase font-mono shadow-xs shrink-0">
                              {selectedDoc.s3_key?.split('.').pop() || 'DOC'}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-gray-900 leading-snug">{selectedDoc.title}</h4>
                              <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                Type: <span className="font-bold text-gray-700">{selectedDoc.document_type.replace(/_/g, ' ')}</span> | 
                                Size: <span className="font-bold text-gray-700">{formatFileSize(selectedDoc.file_size_bytes)}</span>
                                {selectedDoc.notes && <> | Keywords: <span className="text-amber-800 font-semibold">{selectedDoc.notes}</span></>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a 
                              href={`/api/documents/${selectedDoc.id}/download?download=1`} 
                              download
                              target="_blank" 
                              rel="noopener noreferrer" 
                              style={{ backgroundColor: 'var(--brand)', color: '#ffffff' }}
                              className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider flex items-center gap-2 shadow-md hover:shadow-lg border border-slate-800 active:scale-95 shrink-0"
                            >
                              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              <span style={{ color: '#ffffff' }} className="text-white font-black tracking-wider">{selectedDoc.s3_key ? 'Download Original File' : 'Download Text'}</span>
                            </a>
                          </div>
                        </div>

                        {/* Workspace Tab Bar: Visual Document Preview vs Extracted AI Chunks (admins only) */}
                        {isAdmin && (
                        <div className="flex border-b border-gray-200 gap-6 pt-1">
                          <button
                            onClick={() => setViewerTab('preview')}
                            className={`pb-2.5 text-xs font-bold uppercase transition-colors border-b-2 flex items-center gap-1.5 ${
                              viewerTab === 'preview' ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            Document Visual Preview
                          </button>
                          <button
                            onClick={() => setViewerTab('chunks')}
                            className={`pb-2.5 text-xs font-bold uppercase transition-colors border-b-2 flex items-center gap-1.5 ${
                              viewerTab === 'chunks' ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Extracted AI Index ({docChunks.length})
                          </button>
                        </div>
                        )}

                        {/* TAB 1: VISUAL DOCUMENT PREVIEW (the only view for non-admins) */}
                        {(viewerTab === 'preview' || !isAdmin) && (
                          <div className="w-full min-h-[520px] bg-gray-100/70 rounded-xl overflow-hidden border border-gray-200 shadow-inner flex flex-col justify-center items-center">
                            {selectedDoc ? (
                              (() => {
                                const fileExt = (selectedDoc.s3_key || '').toLowerCase().split('.').pop() || '';
                                const inlinePreviewUrl = `/api/documents/${selectedDoc.id}/download`;
                                const downloadUrl = `/api/documents/${selectedDoc.id}/download?download=1`;
                                
                                if (fileExt === 'pdf') {
                                  return (
                                    <object 
                                      data={inlinePreviewUrl} 
                                      type="application/pdf" 
                                      className="w-full h-[540px] rounded-xl border-0"
                                    >
                                      <iframe 
                                        src={inlinePreviewUrl} 
                                        className="w-full h-full rounded-xl border-0" 
                                        title={selectedDoc.title} 
                                      />
                                    </object>
                                  );
                                }

                                if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(fileExt)) {
                                  return (
                                    <div className="w-full h-[540px] bg-gray-900 rounded-xl flex items-center justify-center p-4">
                                      <img src={inlinePreviewUrl} alt={selectedDoc.title} className="max-h-full max-w-full object-contain rounded" />
                                    </div>
                                  );
                                }

                                if (fileExt === 'docx') {
                                  return (
                                    <NativeDocxViewer url={inlinePreviewUrl} />
                                  );
                                }
                                
                                if (['pptx', 'ppt', 'xlsx', 'xls', 'doc'].includes(fileExt)) {
                                  return (
                                    <NativeOfficeViewer 
                                      docUrl={docFileUrl || inlinePreviewUrl} 
                                      title={selectedDoc.title} 
                                    />
                                  );
                                }

                                if (chunksLoading) {
                                  return <div className="py-12 text-center text-xs text-gray-400">Loading the document text…</div>;
                                }
                                const sections = passagesToSections(docChunks);
                                return (
                                  <div className="w-full h-[540px] flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">
                                    {!selectedDoc.s3_key && (
                                      <div className="px-5 py-2.5 text-[11px] text-gray-600 bg-gray-50 border-b border-gray-200">
                                        Text only: the original file wasn&apos;t stored, so this shows the text the AI reads. Layout, images and tables aren&apos;t shown.
                                      </div>
                                    )}
                                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                                      {sections.length === 0 ? (
                                        <p className="text-xs text-gray-400 text-center py-12">
                                          No text was found in this document. It may be a scanned copy that needs OCR.
                                        </p>
                                      ) : (
                                        sections.map((sec, i) => (
                                          <section key={i}>
                                            {sec.label && (
                                              <h4 className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{sec.label}</h4>
                                            )}
                                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800">{sec.text}</p>
                                          </section>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="py-12 text-center text-xs text-gray-400">
                                Loading document visual preview...
                              </div>
                            )}
                          </div>
                        )}

                        {/* TAB 2: EXTRACTED AI CHUNKS (admins only) */}
                        {isAdmin && viewerTab === 'chunks' && (
                          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-h-[500px] overflow-y-auto">
                            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Extracted Document Text Chunks</h4>
                              <span className="text-[10px] font-semibold text-gray-400">{docChunks.length} Chunks Processed</span>
                            </div>

                            {chunksLoading ? (
                              <div className="py-12 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto"></div>
                                <p className="text-xs text-gray-400 mt-2">Loading document content...</p>
                              </div>
                            ) : docChunks.length > 0 ? (
                              <div className="space-y-4">
                                {docChunks.map((chunk, idx) => (
                                  <div key={idx} className="p-3.5 bg-gray-50 rounded-lg border border-gray-100 space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase">
                                      <span>
                                        {chunk.metadata?.slide_number ? `Slide ${chunk.metadata.slide_number}` : chunk.metadata?.page ? `Page ${chunk.metadata.page}` : `Chunk #${idx + 1}`}
                                      </span>
                                      <span>{chunk.metadata?.format || 'TEXT'}</span>
                                    </div>
                                    <p className="text-xs text-gray-700 leading-relaxed font-sans whitespace-pre-wrap">{chunk.chunk_text}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-8 text-center text-xs text-gray-500">
                                <p className="font-medium">No extracted text chunks found.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
        {/* TAB: Document Generator */}
        {/* ============================================ */}
        {activeTab === 'document-generator' && <DraftingDesk initialRequest={initialDraftRequest} />}

        {/* Share Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900">Share Document</h3>
                <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-xs text-gray-500">Sharing: <span className="font-semibold text-gray-900">{shareDocTitle || 'Generated Document'}</span></p>

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

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Copy Shareable Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/documents?id=${shareDocId}`}
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

        {/* Custom Delete Confirmation Modal */}
        {showDeleteModal && docToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 border border-gray-100">
              <div className="flex items-start space-x-4">
                <div className="h-11 w-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-900">Delete Document?</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-gray-900">"{docToDelete.title}"</span>? This will permanently remove the storage file, extracted content chunks, and vector index.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => { setShowDeleteModal(false); setDocToDelete(null); }}
                  disabled={deleteModalLoading}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteDoc}
                  disabled={deleteModalLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all uppercase flex items-center gap-2 shadow-sm shadow-red-200"
                >
                  {deleteModalLoading ? (
                    <>
                      <div className="animate-spin h-3.5 w-3.5 border-b-2 border-white rounded-full"></div>
                      Deleting...
                    </>
                  ) : (
                    'Delete Document'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Bulk Delete Confirmation Modal */}
        {showBulkDeleteModal && selectedDocIds.length > 0 && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 border border-gray-100">
              <div className="flex items-start space-x-4">
                <div className="h-11 w-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-900">Delete {selectedDocIds.length} Selected Documents?</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedDocIds.length} documents</span>? This action is permanent and will remove all raw storage files, extracted content chunks, and AI search indexes.
                  </p>
                </div>
              </div>

              <div className="max-h-32 overflow-y-auto bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Items to be deleted:</span>
                {documents
                  .filter(d => selectedDocIds.includes(d.id))
                  .map(d => (
                    <div key={d.id} className="text-gray-700 font-medium truncate">• {d.title}</div>
                  ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={bulkDeleteLoading}
                  className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDeleteDocs}
                  disabled={bulkDeleteLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all uppercase flex items-center gap-2 shadow-sm shadow-red-200"
                >
                  {bulkDeleteLoading ? (
                    <>
                      <div className="animate-spin h-3.5 w-3.5 border-b-2 border-white rounded-full"></div>
                      Deleting ({selectedDocIds.length})...
                    </>
                  ) : (
                    `Delete ${selectedDocIds.length} Documents`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAccess && selectedDoc && isAdmin && (
          <AccessDialog
            supabase={supabase as unknown as SupabaseClient}
            doc={selectedDoc}
            me={userId}
            onClose={() => setShowAccess(false)}
            onSaved={(restricted) => {
              setShowAccess(false);
              setDocuments(prev => prev.map(d => (d.id === selectedDoc.id ? { ...d, restricted } : d)));
              setSelectedDoc(prev => (prev ? { ...prev, restricted } : prev));
              setDocNotice({ kind: 'ok', text: restricted ? 'Restricted: only admins and the people you listed can open it.' : 'Everyone signed in can open this document.' });
            }}
          />
        )}
      </div>
    </main>
  );
}

export default function DocumentsPage() {
  return (
    <React.Suspense fallback={
      <main className="flex-1 overflow-y-auto p-8 bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </main>
    }>
      <DocumentsContent />
    </React.Suspense>
  );
}

