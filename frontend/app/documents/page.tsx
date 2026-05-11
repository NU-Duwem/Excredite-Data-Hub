'use client';

import { useState } from 'react';

export default function DocumentsPage() {
  const [isUploading, setIsUploading] = useState(false);

  // Mock document list
  const documents = [
    { id: 1, title: 'NERC Multi-Year Tariff Order 2024', date: '2024-12-15', class: 'PUBLIC', size: '2.4 MB' },
    { id: 2, title: 'TCN Q1 Grid Disturbance Report', date: '2025-04-02', class: 'INTERNAL', size: '5.1 MB' },
    { id: 3, title: 'Notice of Appeal - DISCO Tariff Dispute', date: '2025-05-10', class: 'LEGAL_PRIVILEGED', size: '1.2 MB' },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Document Registry & Q&A</h1>
            <p className="mt-1 text-sm text-gray-500">Upload regulatory files and query them using AI.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Upload Area */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Document</h2>
            <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                </svg>
                <div className="mt-4 flex text-sm leading-6 text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-semibold text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 hover:text-blue-500">
                    <span>Upload a file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf" />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs leading-5 text-gray-500">PDF up to 50MB</p>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Classification</label>
              <select className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border">
                <option>PUBLIC</option>
                <option>INTERNAL</option>
                <option>LEGAL_PRIVILEGED</option>
              </select>
            </div>
            <button className="mt-5 w-full bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-semibold hover:bg-blue-500">
              Upload to Registry
            </button>
          </div>

          {/* Document List */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-medium text-gray-900">Document Repository</h2>
              <input type="text" placeholder="Search documents..." className="rounded-md border-gray-300 py-1.5 pl-3 pr-10 text-sm border focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <ul role="list" className="divide-y divide-gray-200 flex-1 overflow-y-auto">
              {documents.map((doc) => (
                <li key={doc.id} className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-blue-600">{doc.title}</span>
                    <div className="flex space-x-3 mt-1 text-xs text-gray-500">
                      <span>Uploaded: {doc.date}</span>
                      <span>{doc.size}</span>
                    </div>
                  </div>
                  <div>
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      doc.class === 'PUBLIC' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                      doc.class === 'INTERNAL' ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20' : 
                      'bg-red-50 text-red-700 ring-red-600/10'
                    }`}>
                      {doc.class}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
