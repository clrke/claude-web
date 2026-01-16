import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QueuedSessionsList from './QueuedSessionsList';
import type { Session } from '@claude-code-web/shared';

const createMockSession = (featureId: string, queuePosition: number): Session => ({
  id: `session-${featureId}`,
  version: '1.0',
  projectId: 'test-project',
  featureId,
  title: `Feature ${featureId}`,
  featureDescription: 'Test description',
  projectPath: '/test/path',
  acceptanceCriteria: [],
  affectedFiles: [],
  technicalNotes: '',
  baseBranch: 'main',
  featureBranch: `feature/${featureId}`,
  baseCommitSha: 'abc123',
  status: 'queued',
  currentStage: 0,
  queuePosition,
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
});

const mockFormatRelativeTime = vi.fn(() => 'active just now');

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('QueuedSessionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders queued sessions in correct order', () => {
    const sessions = [
      createMockSession('feature-2', 2),
      createMockSession('feature-1', 1),
      createMockSession('feature-3', 3),
    ];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    const sessionCards = screen.getAllByTestId(/queued-session-/);
    expect(sessionCards).toHaveLength(3);

    // Should be sorted by queue position
    expect(sessionCards[0]).toHaveAttribute('data-testid', 'queued-session-feature-1');
    expect(sessionCards[1]).toHaveAttribute('data-testid', 'queued-session-feature-2');
    expect(sessionCards[2]).toHaveAttribute('data-testid', 'queued-session-feature-3');
  });

  it('displays queue position for each session', () => {
    const sessions = [
      createMockSession('feature-1', 1),
      createMockSession('feature-2', 2),
    ];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('displays session titles', () => {
    const sessions = [
      createMockSession('feature-1', 1),
      createMockSession('feature-2', 2),
    ];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.getByText('Feature feature-1')).toBeInTheDocument();
    expect(screen.getByText('Feature feature-2')).toBeInTheDocument();
  });

  it('shows drag handles when multiple sessions exist', () => {
    const sessions = [
      createMockSession('feature-1', 1),
      createMockSession('feature-2', 2),
    ];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    const dragHandles = screen.getAllByTestId('drag-handle');
    expect(dragHandles).toHaveLength(2);
  });

  it('does not show drag handles for single session', () => {
    const sessions = [createMockSession('feature-1', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('renders empty list when no sessions', () => {
    renderWithRouter(
      <QueuedSessionsList
        sessions={[]}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.queryByTestId(/queued-session-/)).not.toBeInTheDocument();
  });

  it('links to correct session view URL', () => {
    const sessions = [createMockSession('my-feature', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/session/test-project/my-feature');
  });

  it('calls formatRelativeTime with session updatedAt', () => {
    const sessions = [createMockSession('feature-1', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(mockFormatRelativeTime).toHaveBeenCalled();
    expect(screen.getByText('active just now')).toBeInTheDocument();
  });

  it('displays sortable list container when multiple sessions', () => {
    const sessions = [
      createMockSession('feature-1', 1),
      createMockSession('feature-2', 2),
    ];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.getByTestId('queued-sessions-list')).toBeInTheDocument();
  });

  it('does not render sortable container for single session', () => {
    const sessions = [createMockSession('feature-1', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.queryByTestId('queued-sessions-list')).not.toBeInTheDocument();
  });

  it('displays Queued status badge', () => {
    const sessions = [createMockSession('feature-1', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('displays project path', () => {
    const sessions = [createMockSession('feature-1', 1)];

    renderWithRouter(
      <QueuedSessionsList
        sessions={sessions}
        onReorder={vi.fn()}
        formatRelativeTime={mockFormatRelativeTime}
      />
    );

    expect(screen.getByText('/test/path')).toBeInTheDocument();
  });
});
