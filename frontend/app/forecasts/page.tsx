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
} from 'recharts';

interface DataPoint {
  date: string;
  historical?: number | null;
  forecast?: number | null;
  upper?: number | null;
  lower?: number | null;
}

export default function ForecastsPage() {
  const [horizon, setHorizon] = useState<'30' | '90'>('30');
  const [selectedPlant, setSelectedPlant] = useState('ALL');
  const [forecastType, setForecastType] = useState<'GENERATION' | 'TARIFF' | 'DEMAND'>('GENERATION');

  // Generate 30 or 90 data points (Historical up to Day 15, Forecast from Day 15 to end)
  const count = horizon === '30' ? 30 : 90;
  const cutoffIndex = 14; // Day 15 is "Today"

  const dataPoints: DataPoint[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 6, 1 + i); // Starting July 1, 2026
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    let baseVal = 4200;
    let unit = 'MWh';

    if (forecastType === 'TARIFF') {
      baseVal = 225 + Math.sin(i / 5) * 15;
      unit = '₦/kWh';
    } else if (forecastType === 'DEMAND') {
      baseVal = 4600 + Math.cos(i / 4) * 300;
      unit = 'MW';
    } else {
      // GENERATION
      baseVal = 4300 + Math.sin(i / 3) * 250;
      if (selectedPlant === 'EGBIN') baseVal = 1100 + Math.sin(i / 3) * 80;
      if (selectedPlant === 'SHIRORO') baseVal = 750 + Math.cos(i / 4) * 60;
      if (selectedPlant === 'AZURA') baseVal = 880 + Math.sin(i / 5) * 40;
      unit = 'MWh';
    }

    const val = Math.round(baseVal);

    if (i <= cutoffIndex) {
      // Historical
      return {
        date: dateStr,
        historical: val,
        forecast: i === cutoffIndex ? val : null, // overlap point for line continuity
        upper: null,
        lower: null,
      };
    } else {
      // Forecast
      const upper = Math.round(val * 1.08);
      const lower = Math.round(val * 0.92);
      return {
        date: dateStr,
        historical: null,
        forecast: val,
        upper,
        lower,
      };
    }
  });

  const downloadCSV = () => {
    const headers = ['Date', 'Historical', 'Forecast', 'Upper Bound', 'Lower Bound'];
    const rows = dataPoints.map(p => [
      p.date,
      p.historical ?? '',
      p.forecast ?? '',
      p.upper ?? '',
      p.lower ?? '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `epdh_forecast_${forecastType.toLowerCase()}_${horizon}d.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getYAxisUnit = () => {
    if (forecastType === 'TARIFF') return ' ₦/kWh';
    if (forecastType === 'DEMAND') return ' MW';
    return ' MWh';
  };

  const getPeakValue = () => {
    if (forecastType === 'TARIFF') return '₦242.50 /kWh';
    if (forecastType === 'DEMAND') return '4,950 MW';
    return '4,850 MWh';
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">AI Power Forecasts</h1>
            <p className="mt-1 text-sm text-gray-500">Predictive modeling for generation capacity, demand, and market tariffs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Plant Selector Dropdown */}
            <select
              value={selectedPlant}
              onChange={(e) => setSelectedPlant(e.target.value)}
              className="rounded-lg border-gray-200 py-2 pl-3 pr-8 text-xs font-bold border focus:ring-brand focus:border-brand uppercase tracking-wider bg-white shadow-sm"
            >
              <option value="ALL">National Aggregate (All Plants)</option>
              <option value="EGBIN">Egbin Thermal Station</option>
              <option value="SHIRORO">Shiroro Hydro Station</option>
              <option value="AZURA">Azura-Edo IPP</option>
            </select>

            {/* Metric Type Selector */}
            <select 
              value={forecastType}
              onChange={(e) => setForecastType(e.target.value as any)}
              className="rounded-lg border-gray-200 py-2 pl-3 pr-8 text-xs font-bold border focus:ring-brand focus:border-brand uppercase tracking-wider bg-white shadow-sm"
            >
              <option value="GENERATION">Daily Generation (MWh)</option>
              <option value="TARIFF">Market Tariff (₦/kWh)</option>
              <option value="DEMAND">Peak Load Demand (MW)</option>
            </select>

            {/* Download CSV */}
            <button
              onClick={downloadCSV}
              className="bg-brand text-white rounded-lg px-4 py-2 text-xs font-bold hover:opacity-90 transition-all shadow-sm uppercase tracking-wider flex items-center gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Projected Horizon Peak</p>
            <p className="text-2xl font-bold text-gray-900">{getPeakValue()}</p>
            <p className="text-[10px] text-green-600 font-bold mt-2 flex items-center">
              <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              +5.2% VS PREVIOUS PERIOD
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Confidence Score</p>
            <p className="text-2xl font-bold text-gray-900">92 <span className="text-sm font-semibold text-gray-400">%</span></p>
            <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
               <div className="bg-brand h-full w-[92%]"></div>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-2">Model trained on 15 years of TCN data</p>
          </div>

          <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
             <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center text-brand shrink-0">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <div>
                <p className="text-xs font-bold text-gray-900 uppercase">AI Predictive Insight</p>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  {forecastType === 'TARIFF' 
                    ? 'Tariff trajectory is projected to adjust slightly upward under the MYTO Q3 minor review, driven by foreign exchange indexation.'
                    : 'Generation trends indicate peak thermal output following ELPS gas line pressure restoration. Narrow confidence interval for the upcoming 14 days.'}
                </p>
             </div>
          </div>
        </div>

        {/* Main Chart Container */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  {horizon}-Day {forecastType === 'TARIFF' ? 'Tariff Forecast (₦/kWh)' : forecastType === 'DEMAND' ? 'Peak Load Demand (MW)' : 'Daily Generation Forecast (MWh)'}
                </h2>
              </div>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                Last updated: Monday 13 July 2026 at 06:00
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Horizon Toggle Button */}
              <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setHorizon('30')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    horizon === '30' ? 'bg-brand text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  30 Days
                </button>
                <button
                  type="button"
                  onClick={() => setHorizon('90')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    horizon === '90' ? 'bg-brand text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  90 Days
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] font-bold text-gray-500 uppercase">
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-slate-800 rounded-full inline-block"></span>
                  <span>Historical Data</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 border-t-2 border-dashed border-brand inline-block"></span>
                  <span>AI Forecast</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-3 w-3 bg-brand/20 rounded-sm inline-block"></span>
                  <span>95% Confidence</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Recharts Composed Chart */}
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dataPoints}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: '#5f6f66' }}
                  dy={10}
                  interval={horizon === '90' ? 6 : 2}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: '#5f6f66' }}
                  dx={-10}
                  unit={getYAxisUnit()}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #dde4df', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '10px', fontWeight: 800, color: '#5f6f66', marginBottom: '4px', textTransform: 'uppercase' }}
                />
                {/* Confidence interval area */}
                <Area 
                  type="monotone" 
                  dataKey="upper" 
                  stroke="none" 
                  fill="#e89200" 
                  fillOpacity={0.12} 
                  baseLine={"lower" as any}
                  animationDuration={1000}
                />
                <Area 
                  type="monotone" 
                  dataKey="lower" 
                  stroke="none" 
                  fill="transparent" 
                />

                {/* Solid Line for Historical Data up to Today */}
                <Line 
                  type="monotone" 
                  dataKey="historical" 
                  name="Historical"
                  stroke="#0a3a22" 
                  strokeWidth={3} 
                  dot={{ r: 3, fill: '#0a3a22' }}
                  connectNulls={false}
                />

                {/* Dashed Line for Forecast Data */}
                <Line 
                  type="monotone" 
                  dataKey="forecast" 
                  name="AI Forecast"
                  stroke="#e89200" 
                  strokeWidth={3} 
                  strokeDasharray="5 5"
                  dot={{ r: 3, fill: '#e89200', strokeWidth: 1, stroke: '#fff' }}
                  connectNulls={true}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider gap-2">
            <span>Data synchronized with Supabase Forecasts Engine • Last Updated: Monday 13 July 2026 at 06:00</span>
            <span className="text-brand font-semibold">TCN Grid Telemetry & MYTO Baseline Applied</span>
          </div>
        </div>
      </div>
    </main>
  );
}
