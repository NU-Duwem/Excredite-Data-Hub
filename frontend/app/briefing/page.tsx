'use client';

import { useState } from 'react';

export default function BriefingNoteGenerator() {
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categories, setCategories] = useState({
    generation: true,
    tariffs: true,
    regulatory: false,
    gas: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const allCategoriesSelected = Object.values(categories).every(Boolean);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || isGenerating) return;

    setIsGenerating(true);
    setBriefingText(null);
    setProgressMsg('Compiling data...');

    // Mock progress states
    setTimeout(() => setProgressMsg('Drafting note...'), 1500);
    setTimeout(() => setProgressMsg('Formatting document...'), 3000);

    // Mock final response
    setTimeout(() => {
      setBriefingText(`
# Briefing Note: ${subject}
**Period:** ${dateFrom || 'N/A'} to ${dateTo || 'N/A'}

## 1. Headline Summary
The power sector experienced significant fluctuations during the reporting period, primarily driven by gas supply constraints affecting thermal generation and subsequent regulatory interventions. 

## 2. Key Metrics
- Average Daily Generation: 4,120 MW
- Peak Generation: 4,850 MW
- ATC&C Losses (Estimated): 42%

## 3. Analysis
Generation output fell short of the MYTO benchmark by 15%. The decline was most pronounced in the western grid corridor, corresponding with a scheduled maintenance shutdown at the Egbin facility and reduced pressure on the Escravos-Lagos Pipeline System (ELPS).

## 4. Regulatory Context
NERC issued two minor enforcement actions regarding load rejection during this period. The regulator has indicated a lower tolerance for capacity non-utilization moving into the next quarter.

## 5. Implications and Recommendations
- **Operational:** Review gas supply agreements for redundancy clauses.
- **Strategic:** Anticipate a minor downward revision in allowable tariffs if the capacity utilization trend continues.

## 6. Data Sources
- TCN Daily Operational Reports
- NERC Enforcement Registry
- EPDH Ingestion Engine
      `.trim());
      setIsGenerating(false);
    }, 4500);
  };

  const toggleCategory = (cat: keyof typeof categories) => {
    setCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleAllCategories = () => {
    const nextValue = !allCategoriesSelected;

    setCategories({
      generation: nextValue,
      tariffs: nextValue,
      regulatory: nextValue,
      gas: nextValue,
    });
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-semibold text-gray-900">Briefing Note Generator</h1>
          <p className="mt-2 text-sm text-gray-500">
            Generate professional, data-driven reports focused on specific topics and time periods.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Configuration Form */}
          <div className="lg:col-span-1 bg-gray-50 p-5 rounded-xl border border-gray-200 h-fit">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject / Topic</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. NERC actions Q1 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Data Categories</label>
                <div className="space-y-2">
                  <label className="flex items-center border-b border-gray-200 pb-2">
                    <input
                      type="checkbox"
                      checked={allCategoriesSelected}
                      onChange={toggleAllCategories}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-900">Select all</span>
                  </label>
                  {Object.entries(categories).map(([key, value]) => (
                    <label key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() => toggleCategory(key as keyof typeof categories)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating || !subject.trim()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate Briefing'}
              </button>
            </form>
          </div>

          {/* Preview Area */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm min-h-[500px] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Document Preview</span>
                {briefingText && (
                  <div className="flex space-x-2">
                    <button className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50">
                      Save to Documents
                    </button>
                    <button className="inline-flex items-center px-2.5 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700">
                      Download PDF
                    </button>
                  </div>
                )}
              </div>
              
              <div className="p-6 sm:p-8 flex-1">
                {isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <div className="flex space-x-2">
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce"></div>
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <p className="text-sm font-medium text-gray-500">{progressMsg}</p>
                  </div>
                ) : briefingText ? (
                  <div className="prose prose-sm sm:prose-base max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700">
                    {briefingText.split('\n').map((line, i) => {
                      if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold mb-4">{line.substring(2)}</h1>;
                      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-6 mb-3">{line.substring(3)}</h2>;
                      if (line.startsWith('**') && line.includes(':**')) {
                        const parts = line.split(':**');
                        return <p key={i}><strong>{parts[0].substring(2)}:</strong>{parts[1]}</p>;
                      }
                      if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc">{line.substring(2)}</li>;
                      if (line.trim() === '') return <br key={i} />;
                      return <p key={i} className="mb-2">{line}</p>;
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                    <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Enter a subject and generate a briefing note to see the preview here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
