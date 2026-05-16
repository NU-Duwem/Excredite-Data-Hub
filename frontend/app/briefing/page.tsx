'use client';

import { useState } from 'react';

export default function BriefingNoteGenerator() {
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categories, setCategories] = useState({
    generation: true,
    distribution: false,
    tariffs: true,
    regulatory: false,
    gas: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const allCategoriesSelected = Object.values(categories).every(Boolean);

  const isValid = subject.trim().length > 0 && Object.values(categories).some(Boolean);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isGenerating) return;

    setIsGenerating(true);
    setBriefingText(null);
    
    // Multi-stage progress messaging
    const stages = [
      { msg: 'COMPILING GRID DATA...', delay: 0 },
      { msg: 'ANALYZING TELEMETRY PATTERNS...', delay: 1500 },
      { msg: 'DRAFTING EXECUTIVE SUMMARY (CLAUDE)...', delay: 3000 },
      { msg: 'FORMATTING OFFICIAL DOCUMENT...', delay: 4500 }
    ];

    stages.forEach(stage => {
      setTimeout(() => setProgressMsg(stage.msg), stage.delay);
    });

    // Mock final response
    setTimeout(() => {
      setBriefingText(`
# Briefing Note: ${subject}
**Period:** ${dateFrom || 'Historical Baseline'} to ${dateTo || 'Current Date'}

## 1. Headline Summary
The power sector experienced significant fluctuations during the reporting period, primarily driven by gas supply constraints affecting thermal generation and subsequent regulatory interventions. 

## 2. Key Metrics
- Average Daily Generation: 4,120 MW
- Peak Generation: 4,850 MW
- ATC&C Losses (Estimated): 42%
- Transmission Loss Factor: 7.2%

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
- EPDH Ingestion Engine (Supabase Integrated)
      `.trim());
      setIsGenerating(false);
    }, 6000);
  };

  const toggleCategory = (cat: keyof typeof categories) => {
    setCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleAllCategories = () => {
    const nextValue = !allCategoriesSelected;
    setCategories({
      generation: nextValue,
      distribution: nextValue,
      tariffs: nextValue,
      regulatory: nextValue,
      gas: nextValue,
    });
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Briefing Note Generator</h1>
            <p className="mt-1 text-sm text-gray-500">Generate professional, data-driven reports for the Nigerian Power Sector.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Configuration Form */}
          <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Report Configuration</h2>
            
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Subject / Matter Reference</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Grid Instability Q1 Analysis"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm shadow-sm focus:ring-brand focus:border-brand bg-white font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">From Date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs shadow-sm focus:ring-brand focus:border-brand bg-white font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">To Date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs shadow-sm focus:ring-brand focus:border-brand bg-white font-semibold"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase">Data Categories</label>
                  <button 
                    type="button"
                    onClick={toggleAllCategories}
                    className="text-[10px] font-bold text-brand hover:underline uppercase"
                  >
                    {allCategoriesSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2.5 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  {Object.entries(categories).map(([key, value]) => (
                    <label key={key} className="flex items-center group cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={() => toggleCategory(key as keyof typeof categories)}
                          className="h-4 w-4 text-brand focus:ring-brand border-gray-300 rounded transition-all"
                        />
                      </div>
                      <span className={`ml-3 text-xs font-semibold uppercase tracking-wide transition-colors ${value ? 'text-gray-900' : 'text-gray-400'}`}>
                        {key}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating || !isValid}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-xs font-bold text-white bg-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
              >
                {isGenerating ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    GENERATING...
                  </span>
                ) : 'GENERATE BRIEFING'}
              </button>
            </form>
          </div>

          {/* Preview Area */}
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
                    <button className="inline-flex items-center px-4 py-2 border border-gray-200 shadow-sm text-[10px] font-bold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all uppercase tracking-wider">
                      Save to Registry
                    </button>
                    <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-[10px] font-bold rounded-lg text-white bg-brand hover:opacity-90 transition-all uppercase tracking-wider">
                      Download PDF
                    </button>
                  </div>
                )}
              </div>
              
              <div className="p-8 sm:p-12 flex-1">
                {isGenerating ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-6">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full border-4 border-gray-100 border-t-brand animate-spin"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-1">{progressMsg}</p>
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
                      <p className="text-xs text-gray-400 mt-2 max-w-xs mx-auto font-medium">Configure your briefing parameters and click Generate to see the AI analysis.</p>
                    </div>
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
