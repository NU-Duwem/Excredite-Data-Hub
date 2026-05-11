'use client';

export default function AlertsPage() {
  const alerts = [
    { id: 1, plant: 'Egbin Thermal', date: '2026-05-11', deviation: '-22%', desc: 'Output dropped 22% below 30-day rolling average. Likely caused by NGC gas pressure drop.', reviewed: false },
    { id: 2, plant: 'Shiroro Hydro', date: '2026-05-10', deviation: '-15%', desc: 'Unscheduled capacity reduction detected. No TCN outage report matched.', reviewed: false },
    { id: 3, plant: 'Azura-Edo IPP', date: '2026-05-08', deviation: '+12%', desc: 'Output increased above typical dispatch instruction band.', reviewed: true },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Anomaly Alerts</h1>
            <p className="mt-1 text-sm text-gray-500">AI-generated alerts for unusual generation or grid patterns.</p>
          </div>
          <div className="flex space-x-3">
            <select className="rounded-md border-gray-300 py-1.5 pl-3 pr-10 text-sm border focus:ring-blue-500">
              <option>Unreviewed Only</option>
              <option>All Alerts</option>
            </select>
          </div>
        </div>

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Plant / Entity</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Deviation</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">AI Analysis</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {alerts.map((alert) => (
                <tr key={alert.id} className={alert.reviewed ? 'bg-gray-50 opacity-75' : 'bg-white'}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      {!alert.reviewed && <span className="h-2 w-2 rounded-full bg-blue-600 mr-2"></span>}
                      {alert.plant}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{alert.date}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      alert.deviation.startsWith('-') ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-green-50 text-green-700 ring-green-600/20'
                    }`}>
                      {alert.deviation}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-500 max-w-md truncate" title={alert.desc}>{alert.desc}</td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    {!alert.reviewed ? (
                      <button className="text-blue-600 hover:text-blue-900">Mark Reviewed</button>
                    ) : (
                      <span className="text-gray-400">Reviewed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
