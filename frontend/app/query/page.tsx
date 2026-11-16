'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { readSessions, writeSessions, type ChatSession } from '@/utils/chatSessions';

const initialMessage = {
  id: 1,
  role: 'assistant',
  content: 'Hello. I am the Excredite Electricity Data Hub AI. How can I assist you with power sector analytics today?',
};

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(content: string) {
  const lines = content.split('\n');
  
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('### ')) {
      return (
        <h3 key={idx} className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">
          {parseInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
    }
    if (trimmed.startsWith('## ')) {
      return (
        <h2 key={idx} className="text-lg font-bold text-gray-900 mt-5 mb-3 first:mt-0">
          {parseInlineMarkdown(trimmed.slice(3))}
        </h2>
      );
    }
    if (trimmed.startsWith('# ')) {
      return (
        <h1 key={idx} className="text-xl font-bold text-gray-900 mt-6 mb-4 first:mt-0">
          {parseInlineMarkdown(trimmed.slice(2))}
        </h1>
      );
    }
    if (trimmed.startsWith('- ')) {
      return (
        <li key={idx} className="ml-5 list-disc text-sm text-gray-700 mb-1">
          {parseInlineMarkdown(trimmed.slice(2))}
        </li>
      );
    }
    if (trimmed === '') {
      return <div key={idx} className="h-2" />;
    }
    return (
      <p key={idx} className="text-[15px] leading-relaxed mb-2 last:mb-0">
        {parseInlineMarkdown(line)}
      </p>
    );
  });
}

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [messages, setMessages] = useState([initialMessage]);
  const [sessionId, setSessionId] = useState<string>(() => `session_${Date.now()}`);
  const [showDocDropdown, setShowDocDropdown] = useState(false);
  const [docNotification, setDocNotification] = useState<{ title: string; section: string; tab: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Accept a question handed over from the Overview page (/query?q=...): fill the box
  // through the DOM and submit it the same way a user would, exactly once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    const el = textareaRef.current;
    if (!q || !q.trim() || !el) return;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setValue?.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const id = window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      formRef.current?.requestSubmit();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Reopen a saved conversation handed over from History (/query?session=<id>).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('session');
    if (!wanted) return;
    const id = window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      const saved = readSessions().find((s) => s.id === wanted);
      if (!saved || saved.messages.length === 0) return;
      setSessionId(saved.id);
      setMessages(saved.messages.map((m, i) => ({ id: i + 1, role: m.role, content: m.content })));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Automatically persist live conversation history to localStorage
  useEffect(() => {
    if (messages.length <= 1) return;
    try {
      const now = new Date();
      const userQuery = messages.find(m => m.role === 'user')?.content || 'AI Query Session';
      const currentSession: ChatSession = {
        id: sessionId,
        query: userQuery,
        timestamp: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        updatedAt: now.toISOString(),
        sessionLength: messages.length,
        messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      };
      writeSessions([currentSession, ...readSessions().filter((s) => s.id !== sessionId)]);
    } catch (err) {
      console.error('Error saving chat history session:', err);
    }
  }, [messages, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting, docNotification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSubmitting) return;

    const userQuery = query;
    const userMessage = { id: Date.now(), role: 'user', content: userQuery };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setQuery('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          role: 'assistant', 
          content: data.error || 'An error occurred while connecting to the AI service.' 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          role: 'assistant', 
          content: data.content 
        }]);

        // If query asks for document creation or output, trigger notification
        if (
          userQuery.toLowerCase().includes('generate') ||
          userQuery.toLowerCase().includes('document') ||
          userQuery.toLowerCase().includes('report') ||
          userQuery.toLowerCase().includes('create')
        ) {
          setDocNotification({
            title: `Output generated for: "${userQuery.slice(0, 40)}..."`,
            section: 'Document Generator',
            tab: 'document-generator',
          });
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: 'assistant', 
        content: 'Failed to connect to the server.' 
      }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting, docNotification]);

  const handleNewConversation = () => {
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }

    setQuery('');
    setIsSubmitting(false);
    setSessionId(`session_${Date.now()}`);
    setMessages([{ ...initialMessage }]);
    setDocNotification(null);
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-white relative">
      {/* Mobile Header */}
      <div className="md:hidden h-16 flex items-center px-4 border-b border-gray-200 bg-white shadow-sm">
        <button type="button" className="text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand">
          <span className="sr-only">Open sidebar</span>
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="ml-4 text-lg font-bold text-gray-900 tracking-tight">EPDH</span>
      </div>

      {/* Main Content / Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center">
        <div className="max-w-3xl w-full flex-1 flex flex-col">
          
          <div className="flex justify-between items-center pb-4 mb-4 border-b border-gray-200">
             <div>
               <h1 className="text-xl font-bold text-gray-900 tracking-tight">AI Query Interface</h1>
               <p className="text-xs text-gray-500 mt-0.5">Ask questions and analyze power sector data.</p>
             </div>
             <button
               type="button"
               onClick={handleNewConversation}
               className="text-sm font-semibold text-brand hover:opacity-80 transition-all uppercase tracking-wide"
             >
               + New Conversation
             </button>
          </div>

          {/* Quick Links with Document Functionality Dropdown */}
          <div className="flex flex-wrap items-center gap-2 mb-6 relative">
            {/* Document Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDocDropdown(!showDocDropdown)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-brand/5 hover:border-brand/30 hover:text-brand transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Documents
                <svg className={`h-3 w-3 transition-transform ${showDocDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showDocDropdown && (
                <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2">
                  <Link
                    href="/documents?tab=upload"
                    onClick={() => setShowDocDropdown(false)}
                    className="flex items-center px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors"
                  >
                    Upload Document
                  </Link>
                  <Link
                    href="/documents?tab=view-document"
                    onClick={() => setShowDocDropdown(false)}
                    className="flex items-center px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors"
                  >
                    View Document
                  </Link>
                  <Link
                    href="/documents?tab=document-generator"
                    onClick={() => setShowDocDropdown(false)}
                    className="flex items-center px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors"
                  >
                    Document Generator
                  </Link>
                </div>
              )}
            </div>

            <Link
              href="/matters"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-brand/5 hover:border-brand/30 hover:text-brand transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              Legal Matters
            </Link>
            <Link
              href="/news"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-brand/5 hover:border-brand/30 hover:text-brand transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              News & Updates
            </Link>
          </div>

          <div className="flex-1 flex flex-col space-y-6 pb-44">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-5 py-4 ${
                  msg.role === 'user' 
                    ? 'bg-brand text-white shadow-sm' 
                    : 'bg-gray-50 border border-gray-200 text-gray-900'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  ) : (
                    <div className="space-y-1">{renderMarkdown(msg.content)}</div>
                  )}
                  
                  {msg.role === 'assistant' && msg.id !== 1 && (
                    <div className="mt-4 pt-3 border-t border-gray-200 flex space-x-4">
                      <button className="text-xs font-medium text-gray-500 hover:text-gray-800 flex items-center">
                        <svg className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy answer
                      </button>
                      <button className="text-xs font-medium text-gray-500 hover:text-gray-800 flex items-center">
                        <svg className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Notification after document creation */}
            {docNotification && (
              <div className="p-4 bg-brand/10 border-2 border-brand rounded-xl shadow-md flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-brand"></span>
                  </span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">{docNotification.title}</p>
                    <p className="text-[10px] text-gray-600 font-medium">Output ready in {docNotification.section}</p>
                  </div>
                </div>
                <Link
                  href={`/documents?tab=${docNotification.tab}`}
                  className="px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:opacity-90 transition-all uppercase tracking-wider shrink-0"
                >
                  View Output →
                </Link>
              </div>
            )}
            
            {isSubmitting && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-4 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-brand rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  <span className="ml-2 text-sm text-gray-500 font-medium">Querying database...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

        </div>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <form ref={formRef} onSubmit={handleSubmit} className="relative flex items-center">
            <textarea
              ref={textareaRef}
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="E.g., Generate a document analyzing grid instability Q1 2026..."
              className="block w-full resize-none rounded-xl border-gray-300 shadow-sm focus:border-brand focus:ring-brand bg-gray-50 py-4 pl-4 pr-16 text-[15px] text-gray-900 border focus:bg-white transition-colors"
              style={{ minHeight: '56px', maxHeight: '150px' }}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!query.trim() || isSubmitting}
              className="absolute right-2 inline-flex items-center justify-center p-2 rounded-lg text-white bg-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <svg className="h-5 w-5 rotate-90" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-xs text-gray-400">AI responses are based on the Excredite Consulting Limited database.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
