import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@claude-code-web/shared';

interface FormData {
  projectPath: string;
  title: string;
  featureDescription: string;
  acceptanceCriteria: string[];
  technicalNotes: string;
  baseBranch: string;
}

export default function NewSession() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    projectPath: '',
    title: '',
    featureDescription: '',
    acceptanceCriteria: [''],
    technicalNotes: '',
    baseBranch: 'main',
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Check for active sessions when project path changes
  const checkActiveSession = useCallback(async (projectPath: string) => {
    if (!projectPath.trim()) {
      setActiveSession(null);
      setQueuedCount(0);
      return;
    }

    try {
      const response = await fetch(`/api/sessions/check-queue?projectPath=${encodeURIComponent(projectPath)}`);
      if (response.ok) {
        const data = await response.json();
        setActiveSession(data.activeSession || null);
        setQueuedCount(data.queuedCount || 0);
      } else {
        setActiveSession(null);
        setQueuedCount(0);
      }
    } catch {
      setActiveSession(null);
      setQueuedCount(0);
    }
  }, []);

  // Debounce the active session check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkActiveSession(formData.projectPath);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.projectPath, checkActiveSession]);

  const addCriterion = () => {
    setFormData(prev => ({
      ...prev,
      acceptanceCriteria: [...prev.acceptanceCriteria, ''],
    }));
  };

  const updateCriterion = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      acceptanceCriteria: prev.acceptanceCriteria.map((c, i) => (i === index ? value : c)),
    }));
  };

  const removeCriterion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acceptanceCriteria: prev.acceptanceCriteria.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          acceptanceCriteria: formData.acceptanceCriteria
            .filter(c => c.trim())
            .map(text => ({ text, checked: false, type: 'manual' as const })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create session (${response.status})`);
      }

      const session = await response.json();
      navigate(`/session/${session.projectId}/${session.featureId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">New Feature Session</h1>
        <p className="text-gray-400 mt-2">Define your feature for Claude to implement</p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium">Error creating session</p>
              <p className="text-sm mt-1 text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="project-path" className="block text-sm font-medium mb-2">Project Path</label>
          <input
            id="project-path"
            type="text"
            value={formData.projectPath}
            onChange={e => updateField('projectPath', e.target.value)}
            placeholder="/path/to/your/project"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
          {activeSession && (
            <div className="mt-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-yellow-200 text-sm">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium">Session will be queued</p>
                  <p className="text-yellow-300/80 mt-1">
                    This project has an active session: <span className="font-medium">{activeSession.title}</span>.
                    Your new session will be queued and will start automatically when the current session completes.
                    {queuedCount > 0 && (
                      <span className="block mt-1">
                        {queuedCount} other session{queuedCount > 1 ? 's' : ''} already in queue.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="feature-title" className="block text-sm font-medium mb-2">Feature Title</label>
          <input
            id="feature-title"
            type="text"
            value={formData.title}
            onChange={e => updateField('title', e.target.value)}
            placeholder="Add user authentication"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label htmlFor="feature-description" className="block text-sm font-medium mb-2">Feature Description</label>
          <textarea
            id="feature-description"
            value={formData.featureDescription}
            onChange={e => updateField('featureDescription', e.target.value)}
            placeholder="Describe the feature you want to implement..."
            rows={4}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Acceptance Criteria</label>
          <div className="space-y-2">
            {formData.acceptanceCriteria.map((criterion, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={criterion}
                  onChange={e => updateCriterion(index, e.target.value)}
                  placeholder="e.g., All tests pass"
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formData.acceptanceCriteria.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCriterion(index)}
                    className="px-3 py-2 text-gray-400 hover:text-red-400 transition-colors"
                    aria-label={`Remove criterion ${index + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCriterion}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            + Add criterion
          </button>
        </div>

        <div>
          <label htmlFor="technical-notes" className="block text-sm font-medium mb-2">Technical Notes (Optional)</label>
          <textarea
            id="technical-notes"
            value={formData.technicalNotes}
            onChange={e => updateField('technicalNotes', e.target.value)}
            placeholder="Any technical constraints or preferences..."
            rows={3}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label htmlFor="base-branch" className="block text-sm font-medium mb-2">Base Branch</label>
          <input
            id="base-branch"
            type="text"
            value={formData.baseBranch}
            onChange={e => updateField('baseBranch', e.target.value)}
            placeholder="main"
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? 'Creating...' : 'Start Discovery'}
          </button>
        </div>
      </form>
    </div>
  );
}
