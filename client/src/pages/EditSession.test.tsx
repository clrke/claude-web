import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EditSession from './EditSession';
import { useSessionStore } from '../stores/sessionStore';
import type { Session } from '@claude-code-web/shared';

const mockQueuedSession: Session = {
  id: 'session-123',
  version: '1.0',
  dataVersion: 1,
  projectId: 'proj-abc',
  featureId: 'feat-xyz',
  title: 'Original Title',
  featureDescription: 'Original description',
  projectPath: '/path/to/project',
  acceptanceCriteria: [
    { text: 'Criterion 1', checked: false, type: 'manual' },
    { text: 'Criterion 2', checked: false, type: 'manual' },
  ],
  affectedFiles: ['src/file1.ts', 'src/file2.ts'],
  technicalNotes: 'Original notes',
  baseBranch: 'main',
  featureBranch: 'feature/test',
  baseCommitSha: 'abc123',
  status: 'queued',
  currentStage: 0,
  queuePosition: 1,
  queuedAt: '2024-01-01T00:00:00Z',
  replanningCount: 0,
  claudeSessionId: null,
  claudeStage3SessionId: null,
  claudePlanFilePath: null,
  currentPlanVersion: 0,
  prUrl: null,
  sessionExpiresAt: '2024-01-02T00:00:00Z',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  preferences: {
    riskComfort: 'medium',
    speedVsQuality: 'balanced',
    scopeFlexibility: 'flexible',
    detailLevel: 'standard',
    autonomyLevel: 'collaborative',
  },
};

// Wrapper to provide router context with route params
const renderWithRouter = (projectId = 'proj-abc', featureId = 'feat-xyz') => {
  return render(
    <MemoryRouter initialEntries={[`/session/${projectId}/${featureId}/edit`]}>
      <Routes>
        <Route path="/session/:projectId/:featureId/edit" element={<EditSession />} />
        <Route path="/session/:projectId/:featureId" element={<div data-testid="session-view">Session View</div>} />
        <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('EditSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset store state
    useSessionStore.setState({
      session: null,
      isLoading: false,
      error: null,
      queuedSessions: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading', () => {
    it('should show loading state initially', () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
      renderWithRouter();
      expect(screen.getByText(/loading session/i)).toBeInTheDocument();
    });

    it('should load session from API when not in store', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueuedSession),
      });
      global.fetch = fetchMock;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      expect(fetchMock).toHaveBeenCalledWith('/api/sessions/proj-abc/feat-xyz');
    });

    it('should use session from store when available', async () => {
      useSessionStore.setState({ session: mockQueuedSession });

      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      // Should not fetch since session is in store
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should show error for non-queued session', async () => {
      const nonQueuedSession = { ...mockQueuedSession, status: 'discovery' as const };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(nonQueuedSession),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/only queued sessions can be edited/i)).toBeInTheDocument();
      });
    });

    it('should show error for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found' }),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/session not found/i)).toBeInTheDocument();
      });
    });
  });

  describe('form rendering', () => {
    beforeEach(async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueuedSession),
      });
    });

    it('should render all form fields with session data', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      expect(screen.getByLabelText(/feature description/i)).toHaveValue('Original description');
      expect(screen.getByLabelText(/technical notes/i)).toHaveValue('Original notes');
      expect(screen.getByLabelText(/base branch/i)).toHaveValue('main');
    });

    it('should render acceptance criteria', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('criterion-0')).toHaveValue('Criterion 1');
      });

      expect(screen.getByTestId('criterion-1')).toHaveValue('Criterion 2');
    });

    it('should render affected files', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('affected-file-0')).toHaveValue('src/file1.ts');
      });

      expect(screen.getByTestId('affected-file-1')).toHaveValue('src/file2.ts');
    });

    it('should render project path as read-only', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('/path/to/project')).toBeInTheDocument();
      });
    });

    it('should have Save Changes and Cancel buttons', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('form interactions', () => {
    beforeEach(async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQueuedSession),
      });
    });

    it('should allow editing title', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'New Title');

      expect(titleInput).toHaveValue('New Title');
    });

    it('should allow adding acceptance criteria', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('criterion-0')).toBeInTheDocument();
      });

      await user.click(screen.getByText(/\+ add criterion/i));

      expect(screen.getByTestId('criterion-2')).toBeInTheDocument();
    });

    it('should allow removing acceptance criteria', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('criterion-1')).toBeInTheDocument();
      });

      const removeButtons = screen.getAllByRole('button', { name: /remove criterion/i });
      await user.click(removeButtons[1]);

      expect(screen.queryByTestId('criterion-1')).not.toBeInTheDocument();
    });

    it('should allow adding affected files', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('affected-file-0')).toBeInTheDocument();
      });

      await user.click(screen.getByText(/\+ add file/i));

      expect(screen.getByTestId('affected-file-2')).toBeInTheDocument();
    });

    it('should expand preferences section', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('preferences-toggle')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('preferences-toggle'));

      expect(screen.getByText(/risk comfort/i)).toBeInTheDocument();
      expect(screen.getByText(/speed vs quality/i)).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('should call editQueuedSession with changes', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn().mockResolvedValue({
        success: true,
        session: { ...mockQueuedSession, title: 'Updated Title', dataVersion: 2 },
      });

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Title');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(editQueuedSessionMock).toHaveBeenCalledWith(
          'proj-abc',
          'feat-xyz',
          1,
          expect.objectContaining({ title: 'Updated Title' })
        );
      });
    });

    it('should navigate back on successful save', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn().mockResolvedValue({
        success: true,
        session: { ...mockQueuedSession, title: 'Updated Title', dataVersion: 2 },
      });

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Title');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('session-view')).toBeInTheDocument();
      });
    });

    it('should navigate back on cancel', async () => {
      const user = userEvent.setup();

      useSessionStore.setState({ session: mockQueuedSession });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByTestId('session-view')).toBeInTheDocument();
      });
    });

    it('should navigate directly back if no changes made', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn();

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('save-button')).toBeInTheDocument();
      });

      // Click save without making changes
      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('session-view')).toBeInTheDocument();
      });

      // Should not call edit since no changes
      expect(editQueuedSessionMock).not.toHaveBeenCalled();
    });

    it('should show loading state while saving', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn().mockImplementation(() => new Promise(() => {})); // Never resolves

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Title');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
    });
  });

  describe('version conflict handling', () => {
    it('should show warning and reload form on version conflict', async () => {
      const user = userEvent.setup();
      const latestSession = {
        ...mockQueuedSession,
        title: 'Modified by another user',
        dataVersion: 2,
      };

      const editQueuedSessionMock = vi.fn().mockResolvedValue({
        success: false,
        error: 'VERSION_CONFLICT',
        latestSession,
      });

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'My update');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('message-warning')).toBeInTheDocument();
        expect(screen.getByText(/session was updated by another user/i)).toBeInTheDocument();
      });

      // Form should be reloaded with latest data
      expect(screen.getByLabelText(/feature title/i)).toHaveValue('Modified by another user');
    });
  });

  describe('error handling', () => {
    it('should show error message on API failure', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn().mockRejectedValue(new Error('Network error'));

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByLabelText(/feature title/i)).toHaveValue('Original Title');
      });

      const titleInput = screen.getByLabelText(/feature title/i);
      await user.clear(titleInput);
      await user.type(titleInput, 'Updated Title');

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('message-error')).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('preferences editing', () => {
    it('should allow changing preference values', async () => {
      const user = userEvent.setup();
      const editQueuedSessionMock = vi.fn().mockResolvedValue({
        success: true,
        session: mockQueuedSession,
      });

      useSessionStore.setState({
        session: mockQueuedSession,
        editQueuedSession: editQueuedSessionMock,
      });

      global.fetch = vi.fn();

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('preferences-toggle')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('preferences-toggle'));

      // Change risk comfort to 'high'
      const highRadio = screen.getByRole('radio', { name: /high/i });
      await user.click(highRadio);
      expect(highRadio).toBeChecked();

      await user.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(editQueuedSessionMock).toHaveBeenCalledWith(
          'proj-abc',
          'feat-xyz',
          1,
          expect.objectContaining({
            preferences: expect.objectContaining({ riskComfort: 'high' }),
          })
        );
      });
    });
  });
});
