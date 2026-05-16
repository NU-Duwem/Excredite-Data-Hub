import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-8">
        <h1 className="text-9xl font-bold text-gray-200">404</h1>
        <div className="text-2xl font-bold text-gray-900 mt-2">Page Not Found</div>
      </div>
      
      <div className="max-w-md space-y-4">
        <p className="text-gray-600">
          The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        
        <div className="pt-6">
          <Link 
            href="/query" 
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-bold rounded-lg shadow-sm text-white bg-brand hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand"
          >
            <svg className="mr-2 -ml-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
      
      <div className="mt-16 text-gray-400 text-xs uppercase tracking-widest font-bold">
        Excredite Power Data Hub
      </div>
    </div>
  );
}
