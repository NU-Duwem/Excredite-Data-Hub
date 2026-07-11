'use client';

import { useEffect, useRef, useState } from 'react';

const initialMessage = {
  id: 1,
  role: 'assistant',
  content: 'Hello. I am the Excredite Power Data Hub AI. How can I assist you with power sector analytics today?',
};

function parseInlineMarkdown(text: string) {
  // Parse bold text "**something**"
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
    
    // Headings
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
    
    // Bullet points
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      return (
        <ul key={idx} className="list-disc pl-5 my-1">
          <li className="text-[15px] leading-relaxed text-gray-800">
            {parseInlineMarkdown(trimmed.slice(2))}
          </li>
        </ul>
      );
    }
    
    // Empty lines
    if (trimmed === '') {
      return <div key={idx} className="h-2"></div>;
    }
    
    // Default Paragraph
    return (
      <p key={idx} className="text-[15px] leading-relaxed my-1 text-gray-800">
        {parseInlineMarkdown(line)}
      </p>
    );
  });
}

export default function AIQueryInterface() {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Mock conversation state
  const [messages, setMessages] = useState([initialMessage]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSubmitting) return;

    const userMessage = { id: Date.now(), role: 'user', content: query };
    const updatedMessages = [...messages, userMessage];

    // Add user message to UI
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

  const handleNewConversation = () => {
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current);
      responseTimeoutRef.current = null;
    }

    setQuery('');
    setIsSubmitting(false);
    setMessages([{ ...initialMessage }]);
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-white relative">
      {/* Mobile Header (visible only on mobile) */}
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
          
          <div className="flex justify-between items-end mb-8">
             <div>
               <h1 className="text-2xl font-semibold text-gray-900">AI Query Interface</h1>
               <p className="mt-1 text-sm text-gray-500">Ask questions about generation, tariffs, or regulations.</p>
             </div>
             <button
               type="button"
               onClick={handleNewConversation}
               className="text-sm font-semibold text-brand hover:opacity-80 transition-all uppercase tracking-wide"
             >
               + New Conversation
             </button>
          </div>

          <div className="flex-1 flex flex-col space-y-6 pb-24">
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

      {/* Input Area (Fixed to bottom) */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <textarea
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="E.g., What was the total generation output last week?"
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
