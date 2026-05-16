'use client';

import { useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  ComposedChart,
  Legend
} from 'recharts';

const mockForecastData = [
  { name: 'Mon', value: 4200, upper: 4500, lower: 3900 },
  { name: 'Tue', value: 4100, upper: 4400, lower: 3800 },
  { name: 'Wed', value: 4350, upper: 4700, lower: 4000 },
  { name: 'Thu', value: 3900, upper: 4200, lower: 3600 },
  { name: 'Fri', value: 4500, upper: 4900, lower: 4100 },
  { name: 'Sat', value: 4800, upper: 5200, lower: 4400 },
  { name: 'Sun', value: 4600, upper: 5000, lower: 4200 },
];

export default function ForecastsPage() {
  const [forecastType, setForecastType] = useState('GENERATION');

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Power Forecasts</h1>
            <p className="mt-1 text-sm text-gray-500">Predictive modeling for generation capacity and market tariffs.</p>
          </div>
          <div className="flex items-center gap-3">
            <select 
              value={forecastType}
              onChange={(e) => setForecastType(e.target.value)}
              className="rounded-lg border-gray-200 py-2 pl-3 pr-8 text-xs font-bold border focus:ring-brand uppercase tracking-wider bg-white"
            >
              <option value="GENERATION">Total Generation (MW)</option>
              <option value="TARIFF">Market Tariff (₦/kWh)</option>
              <option value="DEMAND">Load Demand (MW)</option>
            </select>
            <button className="bg-brand text-white rounded-lg px-4 py-2 text-xs font-bold hover:opacity-90 transition-all shadow-sm uppercase tracking-wider">
              Export Analysis
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Stats Cards */}
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Projected Peak</p>
            <p className="text-2xl font-bold text-gray-900">4,850 <span className="text-sm font-semibold text-gray-400">MW</span></p>
            <p className="text-[10px] text-green-600 font-bold mt-2 flex items-center">
              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              +5.2% VS LAST WEEK
            </p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Confidence Score</p>
            <p className="text-2xl font-bold text-gray-900">92 <span className="text-sm font-semibold text-gray-400">%</span></p>
            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
               <div className="bg-brand h-full w-[92%]"></div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
             <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <div>
                <p className="text-xs font-bold text-gray-900 uppercase">AI Insight</p>
                <p className="text-xs text-gray-500 font-medium">Grid stability is expected to improve by Wednesday as gas pressure at ELPS stabilizes. Confidence interval is narrow for the next 48 hours.</p>
             </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">7-Day Generation Forecast (MW)</h2>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 bg-brand rounded-sm"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Forecast Value</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 bg-brand/20 rounded-sm"></span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">95% Confidence Band</span>
               </div>
            </div>
          </div>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mockForecastData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  dx={-10}
                  unit=" MW"
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="upper" 
                  stroke="none" 
                  fill="#b58e23" 
                  fillOpacity={0.1} 
                  baseLine="lower"
                  animationDuration={1500}
                />
                <Area 
                  type="monotone" 
                  dataKey="lower" 
                  stroke="none" 
                  fill="transparent" 
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#b58e23" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#b58e23', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  animationDuration={1500}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-50 text-center">
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
               Data synchronized with Supabase Forecasts Engine • Last Updated: Today, 08:00 AM
             </p>
          </div>
        </div>
      </div>
    </main>
  );
}
