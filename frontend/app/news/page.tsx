'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface NewsArticle {
  id: string;
  source: string;
  title: string;
  url: string | null;
  summary: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
  has_anomaly?: boolean;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState('All');

  const supabase = createClient();

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        setArticles(data);
      } else {
        // Mock data
        setArticles([
          {
            id: '1', source: 'NERC', title: 'NERC Approves Minor Tariff Review for Q3 2026',
            url: 'https://nerc.gov.ng', summary: 'The Nigerian Electricity Regulatory Commission has approved a minor upward tariff review for Band A customers effective July 2026, citing increased gas supply costs and inflationary pressures on the multi-year tariff order.',
            image_url: null, published_at: '2026-07-12T14:00:00Z', created_at: '2026-07-12T14:30:00Z', has_anomaly: false,
          },
          {
            id: '2', source: 'TCN', title: 'Grid Collapse: TCN Reports Fourth System Disturbance in June',
            url: 'https://tcn.org.ng', summary: 'The Transmission Company of Nigeria confirmed the fourth grid disturbance event in June 2026, attributing the collapse to insufficient spinning reserve following an unexpected trip at the Egbin power station. Recovery took approximately 6 hours.',
            image_url: null, published_at: '2026-07-10T09:00:00Z', created_at: '2026-07-10T10:00:00Z', has_anomaly: true,
          },
          {
            id: '3', source: 'BusinessDay', title: 'Nigeria\'s Power Sector Attracts $2.1B in New Investment Pledges',
            url: 'https://businessday.ng', summary: 'Multiple international and domestic investors have pledged over $2.1 billion in new investments across generation and distribution segments of the Nigerian power sector, buoyed by recent regulatory reforms and tariff certainty under the MYTO framework.',
            image_url: null, published_at: '2026-07-08T06:00:00Z', created_at: '2026-07-08T07:00:00Z', has_anomaly: false,
          },
          {
            id: '4', source: 'NBET', title: 'Market Settlement Figures Contradict NERC Enforcement Data',
            url: 'https://nbet.com.ng', summary: 'Discrepancies have been identified between the Nigerian Bulk Electricity Trading company market settlement figures and the enforcement data published by NERC for Q1 2026. The variance, estimated at ₦14.2 billion, has triggered an anomaly alert in the system.',
            image_url: null, published_at: '2026-07-05T11:00:00Z', created_at: '2026-07-05T12:00:00Z', has_anomaly: true,
          },
          {
            id: '5', source: 'Vanguard', title: 'DisCos Report Improved Collection Efficiency Amid Meter Rollout',
            url: 'https://vanguardngr.com', summary: 'Several Distribution Companies have reported improved revenue collection efficiency, correlating with the accelerated smart meter rollout under the MAP scheme. Abuja DISCO leads with a 12% improvement in collections year-over-year.',
            image_url: null, published_at: '2026-07-03T08:00:00Z', created_at: '2026-07-03T09:00:00Z', has_anomaly: false,
          },
          {
            id: '6', source: 'NERC', title: 'NERC Issues Warning to Three DISCOs Over Service Quality',
            url: 'https://nerc.gov.ng', summary: 'NERC has issued formal warnings to Benin, Enugu, and Port Harcourt distribution companies over persistent service quality failures, including unplanned outages exceeding permitted thresholds and poor customer complaint resolution rates.',
            image_url: null, published_at: '2026-06-28T15:00:00Z', created_at: '2026-06-28T16:00:00Z', has_anomaly: false,
          },
        ]);
      }
      setLoading(false);
    };
    fetchNews();
  }, [supabase]);

  const uniqueSources = ['All', ...new Set(articles.map(a => a.source))];

  const filteredArticles = articles.filter(a => {
    const matchesSource = filterSource === 'All' || a.source === filterSource;
    const matchesSearch = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'NERC': return 'bg-blue-50 text-blue-700 ring-blue-600/20';
      case 'TCN': return 'bg-red-50 text-red-700 ring-red-600/20';
      case 'NBET': return 'bg-purple-50 text-purple-700 ring-purple-600/20';
      case 'BusinessDay': return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
      case 'Vanguard': return 'bg-orange-50 text-orange-700 ring-orange-600/20';
      default: return 'bg-gray-50 text-gray-700 ring-gray-600/20';
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">News & Updates</h1>
            <p className="mt-1 text-sm text-gray-500">Aggregated Nigerian power sector news from regulatory bodies, market operators, and trade press.</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* News Feed */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <p className="text-sm font-semibold text-gray-500">No news articles found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredArticles.map(article => (
              <article
                key={article.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                  article.has_anomaly ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Header badges */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${getSourceColor(article.source)}`}>
                          {article.source}
                        </span>
                        <span className="text-[10px] font-medium text-gray-400 uppercase">
                          {formatDate(article.published_at)}
                        </span>
                        {article.has_anomaly && (
                          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Anomaly Flagged
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-bold text-gray-900 leading-snug mb-2">
                        {article.title}
                      </h2>

                      {/* Summary */}
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {article.summary}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    {article.url ? (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
                      >
                        Read Original Article
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">No external link available</span>
                    )}

                    {article.published_at && (
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(article.published_at).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
