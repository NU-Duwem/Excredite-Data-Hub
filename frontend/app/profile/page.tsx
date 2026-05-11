'use client';

export default function ProfilePage() {
  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">User Profile</h1>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center mb-6 border-b border-gray-200 pb-6">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
              JD
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-medium text-gray-900">John Doe</h2>
              <p className="text-sm text-gray-500">john.doe@excredite.com</p>
            </div>
          </div>
          
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Role</dt>
              <dd className="mt-1 text-sm text-gray-900">Power Analyst (power_analyst)</dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Account Status</dt>
              <dd className="mt-1 text-sm text-green-600 font-medium">Active</dd>
            </div>
          </dl>
          
          <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
            <button className="bg-white border border-gray-300 text-gray-700 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
