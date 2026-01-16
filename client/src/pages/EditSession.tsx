import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Session, UserPreferences, AcceptanceCriterion } from '@claude-code-web/shared';
import { DEFAULT_USER_PREFERENCES, validatePreferences } from '@claude-code-web/shared';
import { useSessionStore } from '../stores/sessionStore';

interface FormData {
  title: string;
  featureDescription: string;
  acceptanceCriteria: string[];
  affectedFiles: string[];
  technicalNotes: string;
  baseBranch: string;
  preferences: UserPreferences;
}

type MessageType = 'error' | 'warning' | 'success';

interface Message {
  type: MessageType;
  text: string;
}

function sessionToFormData(session: Session): FormData {
  return {
    title: session.title,
    featureDescription: session.featureDescription,
    acceptanceCriteria: session.acceptanceCriteria.length > 0
      ? session.acceptanceCriteria.map(c => c.text)
      : [''],
    affectedFiles: session.affectedFiles.length > 0
      ? session.affectedFiles
      : [],
    technicalNotes: session.technicalNotes || '',
    baseBranch: session.baseBranch,
    preferences: session.preferences
      ? validatePreferences(session.preferences)
      : { ...DEFAULT_USER_PREFERENCES },
  };
}

export default function EditSession() {
  const navigate = useNavigate();
  const { projectId, featureId } = useParams<{ projectId: string; featureId: string }>();

  const { session: storeSession, editQueuedSession, fetchSession, isLoading: storeLoading } = useSessionStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [preferencesExpanded, setPreferencesExpanded] = useState(false);

  // Load session data
  const loadSession = useCallback(async () => {
    if (!projectId || !featureId) return;

    setIsLoading(true);
    setMessage(null);

    // First check if session is already in store and matches
    if (storeSession && storeSession.projectId === projectId && storeSession.featureId === featureId) {
      if (storeSession.status !== 'queued') {
        setMessage({ type: 'error', text: 'Only queued sessions can be edited' });
        setIsLoading(false);
        return;
      }
      setSession(storeSession);
      setFormData(sessionToFormData(storeSession));
      setIsLoading(false);
      return;
    }

    // Otherwise fetch from API
    try {
      const response = await fetch(`/api/sessions/${projectId}/${featureId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setMessage({ type: 'error', text: 'Session not found' });
        } else {
          throw new Error('Failed to load session');
        }
        setIsLoading(false);
        return;
      }

      const loadedSession: Session = await response.json();

      if (loadedSession.status !== 'queued') {
        setMessage({ type: 'error', text: 'Only queued sessions can be edited' });
        setIsLoading(false);
        return;
      }

      setSession(loadedSession);
      setFormData(sessionToFormData(loadedSession));
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load session',
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, featureId, storeSession]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Acceptance criteria handlers
  const addCriterion = () => {
    setFormData(prev => prev ? {
      ...prev,
      acceptanceCriteria: [...prev.acceptanceCriteria, ''],
    } : null);
  };

  const updateCriterion = (index: number, value: string) => {
    setFormData(prev => prev ? {
      ...prev,
      acceptanceCriteria: prev.acceptanceCriteria.map((c, i) => (i === index ? value : c)),
    } : null);
  };

  const removeCriterion = (index: number) => {
    setFormData(prev => prev ? {
      ...prev,
      acceptanceCriteria: prev.acceptanceCriteria.filter((_, i) => i !== index),
    } : null);
  };

  // Affected files handlers
  const addAffectedFile = () => {
    setFormData(prev => prev ? {
      ...prev,
      affectedFiles: [...prev.affectedFiles, ''],
    } : null);
  };

  const updateAffectedFile = (index: number, value: string) => {
    setFormData(prev => prev ? {
      ...prev,
      affectedFiles: prev.affectedFiles.map((f, i) => (i === index ? value : f)),
    } : null);
  };

  const removeAffectedFile = (index: number) => {
    setFormData(prev => prev ? {
      ...prev,
      affectedFiles: prev.affectedFiles.filter((_, i) => i !== index),
    } : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !featureId || !session || !formData) return;

    setIsSaving(true);
    setMessage(null);

    try {
      // Build updates object - only include changed fields
      const updates: Record<string, unknown> = {};

      if (formData.title !== session.title) {
        updates.title = formData.title;
      }
      if (formData.featureDescription !== session.featureDescription) {
        updates.featureDescription = formData.featureDescription;
      }
      if (formData.technicalNotes !== (session.technicalNotes || '')) {
        updates.technicalNotes = formData.technicalNotes;
      }
      if (formData.baseBranch !== session.baseBranch) {
        updates.baseBranch = formData.baseBranch;
      }

      // Convert acceptance criteria to proper format
      const newCriteria: AcceptanceCriterion[] = formData.acceptanceCriteria
        .filter(c => c.trim())
        .map(text => ({ text, checked: false, type: 'manual' as const }));

      const existingCriteriaTexts = session.acceptanceCriteria.map(c => c.text);
      const newCriteriaTexts = newCriteria.map(c => c.text);
      if (JSON.stringify(existingCriteriaTexts) !== JSON.stringify(newCriteriaTexts)) {
        updates.acceptanceCriteria = newCriteria;
      }

      // Affected files
      const newAffectedFiles = formData.affectedFiles.filter(f => f.trim());
      if (JSON.stringify(newAffectedFiles) !== JSON.stringify(session.affectedFiles)) {
        updates.affectedFiles = newAffectedFiles;
      }

      // Preferences
      if (JSON.stringify(formData.preferences) !== JSON.stringify(session.preferences || DEFAULT_USER_PREFERENCES)) {
        updates.preferences = formData.preferences;
      }

      // If no changes, just navigate back
      if (Object.keys(updates).length === 0) {
        navigate(`/session/${projectId}/${featureId}`);
        return;
      }

      const result = await editQueuedSession(
        projectId,
        featureId,
        session.dataVersion,
        updates
      );

      if (!result.success && result.error === 'VERSION_CONFLICT') {
        // Reload form with latest data and show warning
        setSession(result.latestSession);
        setFormData(sessionToFormData(result.latestSession));
        setMessage({
          type: 'warning',
          text: 'Session was updated by another user. Please review your changes and try again.',
        });
        setIsSaving(false);
        return;
      }

      // Success - navigate back to session view
      navigate(`/session/${projectId}/${featureId}`);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save changes',
      });
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (projectId && featureId) {
      navigate(`/session/${projectId}/${featureId}`);
    } else {
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-400">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!session || !formData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-red-400">Unable to load session</h1>
          {message && (
            <p className="text-gray-400 mt-2">{message.text}</p>
          )}
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Edit Session</h1>
        <p className="text-gray-400 mt-2">Modify your queued session before discovery starts</p>
      </header>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'error'
              ? 'bg-red-900/50 border border-red-700 text-red-200'
              : message.type === 'warning'
              ? 'bg-yellow-900/50 border border-yellow-700 text-yellow-200'
              : 'bg-green-900/50 border border-green-700 text-green-200'
          }`}
          data-testid={`message-${message.type}`}
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {message.type === 'error' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : message.type === 'warning' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              )}
            </svg>
            <div>
              <p className={`font-medium ${
                message.type === 'error' ? 'text-red-200' :
                message.type === 'warning' ? 'text-yellow-200' : 'text-green-200'
              }`}>
                {message.type === 'error' ? 'Error' : message.type === 'warning' ? 'Warning' : 'Success'}
              </p>
              <p className={`text-sm mt-1 ${
                message.type === 'error' ? 'text-red-300' :
                message.type === 'warning' ? 'text-yellow-300' : 'text-green-300'
              }`}>
                {message.text}
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project info (read-only) */}
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="text-sm text-gray-400">Project</div>
          <div className="font-mono text-sm mt-1">{session.projectPath}</div>
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
            autoComplete="off"
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
                  data-testid={`criterion-${index}`}
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
          <label className="block text-sm font-medium mb-2">Affected Files (Optional)</label>
          <div className="space-y-2">
            {formData.affectedFiles.length === 0 ? (
              <p className="text-sm text-gray-500">No affected files specified</p>
            ) : (
              formData.affectedFiles.map((file, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={file}
                    onChange={e => updateAffectedFile(index, e.target.value)}
                    placeholder="e.g., src/components/Auth.tsx"
                    className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    data-testid={`affected-file-${index}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeAffectedFile(index)}
                    className="px-3 py-2 text-gray-400 hover:text-red-400 transition-colors"
                    aria-label={`Remove file ${index + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={addAffectedFile}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            + Add file
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

        {/* Preferences Section */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setPreferencesExpanded(!preferencesExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-800 hover:bg-gray-750 transition-colors"
            aria-expanded={preferencesExpanded}
            data-testid="preferences-toggle"
          >
            <span className="text-sm font-medium">Preferences</span>
            <svg
              className={`w-5 h-5 transition-transform ${preferencesExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {preferencesExpanded && (
            <div className="px-4 py-4 space-y-5 bg-gray-800/50">
              {/* Risk Comfort */}
              <fieldset>
                <legend className="text-sm font-medium text-gray-300 mb-2">Risk Comfort</legend>
                <p className="text-xs text-gray-500 mb-2">How comfortable are you with experimental approaches?</p>
                <div className="flex gap-4">
                  {(['low', 'medium', 'high'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="riskComfort"
                        value={value}
                        checked={formData.preferences.riskComfort === value}
                        onChange={() => updateField('preferences', { ...formData.preferences, riskComfort: value })}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Speed vs Quality */}
              <fieldset>
                <legend className="text-sm font-medium text-gray-300 mb-2">Speed vs Quality</legend>
                <p className="text-xs text-gray-500 mb-2">Trade-off between delivery speed and implementation quality</p>
                <div className="flex gap-4">
                  {(['speed', 'balanced', 'quality'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="speedVsQuality"
                        value={value}
                        checked={formData.preferences.speedVsQuality === value}
                        onChange={() => updateField('preferences', { ...formData.preferences, speedVsQuality: value })}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Scope Flexibility */}
              <fieldset>
                <legend className="text-sm font-medium text-gray-300 mb-2">Scope Flexibility</legend>
                <p className="text-xs text-gray-500 mb-2">Openness to scope changes beyond original request</p>
                <div className="flex gap-4">
                  {(['fixed', 'flexible', 'open'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="scopeFlexibility"
                        value={value}
                        checked={formData.preferences.scopeFlexibility === value}
                        onChange={() => updateField('preferences', { ...formData.preferences, scopeFlexibility: value })}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Detail Level */}
              <fieldset>
                <legend className="text-sm font-medium text-gray-300 mb-2">Detail Level</legend>
                <p className="text-xs text-gray-500 mb-2">How many questions/details to surface during review</p>
                <div className="flex gap-4">
                  {(['minimal', 'standard', 'detailed'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="detailLevel"
                        value={value}
                        checked={formData.preferences.detailLevel === value}
                        onChange={() => updateField('preferences', { ...formData.preferences, detailLevel: value })}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Autonomy Level */}
              <fieldset>
                <legend className="text-sm font-medium text-gray-300 mb-2">Autonomy Level</legend>
                <p className="text-xs text-gray-500 mb-2">How much Claude should decide vs ask for input</p>
                <div className="flex gap-4">
                  {(['guided', 'collaborative', 'autonomous'] as const).map((value) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="autonomyLevel"
                        value={value}
                        checked={formData.preferences.autonomyLevel === value}
                        onChange={() => updateField('preferences', { ...formData.preferences, autonomyLevel: value })}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="text-sm capitalize">{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
            data-testid="save-button"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
