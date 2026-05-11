'use client';

export default function HistoryPage() {
  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center pb-5 border-b border-gray-200 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Conversation History</h1>
          <input type="text" placeholder="Search past queries..." className="rounded-md border-gray-300 py-1.5 pl-3 pr-10 text-sm border focus:ring-blue-500" />
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <ul className="divide-y divide-gray-200">
            <li className="p-4 hover:bg-gray-50 cursor-pointer">
              <p className="text-sm font-medium text-gray-900">What was the total generation output last week?</p>
              <p className="text-xs text-gray-500 mt-1">Today at 10:42 AM</p>
            </li>
            <li className="p-4 hover:bg-gray-50 cursor-pointer">
              <p className="text-sm font-medium text-gray-900">Show me all NERC enforcement actions from the last six months</p>
              <p className="text-xs text-gray-500 mt-1">Yesterday at 4:15 PM</p>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
