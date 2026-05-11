'use client';

export default function ForecastsPage() {
  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center pb-5 border-b border-gray-200 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Forecasts</h1>
            <p className="mt-1 text-sm text-gray-500">AI-generated generation and tariff forecasts.</p>
          </div>
          <button className="bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-semibold hover:bg-blue-500">
            Download CSV
          </button>
        </div>
        
        <div className="bg-white p-12 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900">Forecast Charts</h3>
          <p className="mt-1 text-sm text-gray-500">The Recharts integration is pending data connection to the FastAPI backend.</p>
        </div>
      </div>
    </main>
  );
}
