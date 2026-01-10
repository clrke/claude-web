import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Claude Code Web</h1>
        <p className="text-gray-400 mt-2">Manage your Claude Code sessions</p>
      </header>

      <div className="mb-8">
        <Link
          to="/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </Link>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Recent Sessions</h2>
        <div className="bg-gray-800 rounded-lg p-6 text-gray-400">
          No sessions yet. Create your first session to get started.
        </div>
      </section>
    </div>
  );
}
