'use client';

export default function MattersPage() {
  const matters = [
    { id: 1, ref: 'LIT/2025/08', client: 'AEDC', type: 'Tariff Dispute', status: 'ACTIVE', counsel: 'B. Ekpo', deadline: '2026-06-01' },
    { id: 2, ref: 'REG/2025/12', client: 'Mainstream', type: 'Compliance', status: 'ON_HOLD', counsel: 'J. Doe', deadline: '2026-05-20' },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Legal Matters</h1>
            <p className="mt-1 text-sm text-gray-500">Case management interface for the legal team.</p>
          </div>
          <button className="bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-semibold hover:bg-blue-500">
            + New Matter
          </button>
        </div>

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Reference</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Client</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Type</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Lead Counsel</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Next Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {matters.map((matter) => (
                <tr key={matter.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-blue-600">{matter.ref}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">{matter.client}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{matter.type}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      matter.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                    }`}>
                      {matter.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{matter.counsel}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900 font-medium">{matter.deadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
