'use client';

import { useRef, useState } from 'react';

const initialMessage = {
  id: 1,
  role: 'assistant',
  content: 'Hello. I am the Excredite Power Data Hub AI. How can I assist you with power sector analytics today?',
};

export default function AIQueryInterface() {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const responseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Mock conversation state
  const [messages, setMessages] = useState([initialMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isSubmitting) return;

    // Add user message
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: query }]);
    setQuery('');
    setIsSubmitting(true);

    // Mock AI response delay
    responseTimeoutRef.current = setTimeout(() => {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: 'assistant', 
        content: 'This is a mock response based on your query. In a real scenario, this would connect to the FastAPI backend which interfaces with Claude and the PostgreSQL database to return data-backed insights.' 
      }]);
      setIsSubmitting(false);
      responseTimeoutRef.current = null;
    }, 1500);
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
        <button type="button" className="text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
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
               className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
             >
               + New Conversation
             </button>
          </div>

          <div className="flex-1 flex flex-col space-y-6 pb-24">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-5 py-4 ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'bg-gray-50 border border-gray-200 text-gray-900'
                }`}>
                  <p className="text-[15px] leading-relaxed">{msg.content}</p>
                  
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
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  <span className="ml-2 text-sm text-gray-500 font-medium">Querying database...</span>
                </div>
              </div>
            )}
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
              className="block w-full resize-none rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-4 pl-4 pr-16 text-[15px] text-gray-900 border focus:bg-white transition-colors"
              style={{ minHeight: '56px', maxHeight: '150px' }}
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!query.trim() || isSubmitting}
              className="absolute right-2 inline-flex items-center justify-center p-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
