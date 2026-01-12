import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useSessionStore.setState({
      session: null,
      plan: null,
      questions: [],
      isLoading: false,
      error: null,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchSession', () => {
    it('should set loading state while fetching', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'session-1' }),
      });
      global.fetch = fetchMock;

      const fetchPromise = useSessionStore.getState().fetchSession('proj1', 'feat1');

      // Loading should be true during fetch
      expect(useSessionStore.getState().isLoading).toBe(true);

      await fetchPromise;

      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it('should fetch session, plan, and questions in parallel', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'session-1', title: 'Test' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ steps: [], isApproved: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ questions: [{ id: 'q1', questionText: 'Test?' }] }),
        });
      global.fetch = fetchMock;

      await useSessionStore.getState().fetchSession('proj1', 'feat1');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(useSessionStore.getState().session?.id).toBe('session-1');
      expect(useSessionStore.getState().plan).not.toBeNull();
      expect(useSessionStore.getState().questions).toHaveLength(1);
    });

    it('should handle session not found error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await useSessionStore.getState().fetchSession('proj1', 'feat1');

      expect(useSessionStore.getState().error).toBe('Session not found');
      expect(useSessionStore.getState().session).toBeNull();
    });

    it('should clear previous error on new fetch', async () => {
      useSessionStore.setState({ error: 'previous error' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'session-1' }),
      });

      await useSessionStore.getState().fetchSession('proj1', 'feat1');

      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  describe('answerQuestion', () => {
    it('should update question answer and set answeredAt', () => {
      useSessionStore.setState({
        questions: [
          { id: 'q1', questionText: 'Test?', answer: null, answeredAt: null } as any,
        ],
      });

      const answer = { value: 'Yes' };
      useSessionStore.getState().answerQuestion('q1', answer);

      const question = useSessionStore.getState().questions[0];
      expect(question.answer).toEqual(answer);
      expect(question.answeredAt).not.toBeNull();
    });

    it('should not affect other questions', () => {
      useSessionStore.setState({
        questions: [
          { id: 'q1', questionText: 'Q1?', answer: null } as any,
          { id: 'q2', questionText: 'Q2?', answer: null } as any,
        ],
      });

      useSessionStore.getState().answerQuestion('q1', { value: 'Yes' });

      expect(useSessionStore.getState().questions[0].answer).toEqual({ value: 'Yes' });
      expect(useSessionStore.getState().questions[1].answer).toBeNull();
    });
  });

  describe('requestPlanChanges', () => {
    it('should send feedback to the API', async () => {
      useSessionStore.setState({
        session: { projectId: 'proj1', featureId: 'feat1' } as any,
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      global.fetch = fetchMock;

      await useSessionStore.getState().requestPlanChanges('Please add more tests');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/proj1/feat1/plan/request-changes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ feedback: 'Please add more tests' }),
        })
      );
    });

    it('should set error on failure', async () => {
      useSessionStore.setState({
        session: { projectId: 'proj1', featureId: 'feat1' } as any,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await useSessionStore.getState().requestPlanChanges('feedback');

      expect(useSessionStore.getState().error).toBe('Failed to request changes');
    });

    it('should do nothing if no session', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      await useSessionStore.getState().requestPlanChanges('feedback');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('approvePlan', () => {
    it('should update plan on success', async () => {
      useSessionStore.setState({
        session: { projectId: 'proj1', featureId: 'feat1' } as any,
        plan: { isApproved: false, steps: [] } as any,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ isApproved: true, steps: [] }),
      });

      await useSessionStore.getState().approvePlan();

      expect(useSessionStore.getState().plan?.isApproved).toBe(true);
    });

    it('should do nothing if no session or plan', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock;

      await useSessionStore.getState().approvePlan();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useSessionStore.setState({
        session: { id: 'session-1' } as any,
        plan: { steps: [] } as any,
        questions: [{ id: 'q1' } as any],
        isLoading: true,
        error: 'some error',
      });

      useSessionStore.getState().reset();

      const state = useSessionStore.getState();
      expect(state.session).toBeNull();
      expect(state.plan).toBeNull();
      expect(state.questions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('updateStepStatus', () => {
    it('should update step status in plan', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'pending', order: 0 },
            { id: 'step-2', title: 'Step 2', status: 'pending', order: 1 },
          ],
          isApproved: true,
        } as any,
      });

      useSessionStore.getState().updateStepStatus('step-1', 'in_progress');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('in_progress');
      expect(plan?.steps[1].status).toBe('pending');
    });

    it('should update step status to completed', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'in_progress', order: 0 },
          ],
          isApproved: true,
        } as any,
      });

      useSessionStore.getState().updateStepStatus('step-1', 'completed');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('completed');
    });

    it('should update step status to blocked', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'in_progress', order: 0 },
          ],
          isApproved: true,
        } as any,
      });

      useSessionStore.getState().updateStepStatus('step-1', 'blocked');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('blocked');
    });

    it('should not affect other steps when updating one', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'completed', order: 0 },
            { id: 'step-2', title: 'Step 2', status: 'pending', order: 1 },
            { id: 'step-3', title: 'Step 3', status: 'pending', order: 2 },
          ],
          isApproved: true,
        } as any,
      });

      useSessionStore.getState().updateStepStatus('step-2', 'in_progress');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('completed');
      expect(plan?.steps[1].status).toBe('in_progress');
      expect(plan?.steps[2].status).toBe('pending');
    });

    it('should do nothing if plan is null', () => {
      useSessionStore.setState({ plan: null });

      // Should not throw
      useSessionStore.getState().updateStepStatus('step-1', 'in_progress');

      expect(useSessionStore.getState().plan).toBeNull();
    });

    it('should do nothing if stepId does not exist', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'pending', order: 0 },
          ],
          isApproved: true,
        } as any,
      });

      useSessionStore.getState().updateStepStatus('non-existent-step', 'in_progress');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('pending');
    });

    it('should preserve other plan properties when updating step', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'pending', order: 0 },
          ],
          isApproved: true,
          createdAt: '2026-01-13T00:00:00Z',
          updatedAt: '2026-01-13T00:00:00Z',
        } as any,
      });

      useSessionStore.getState().updateStepStatus('step-1', 'completed');

      const plan = useSessionStore.getState().plan;
      expect(plan?.id).toBe('plan-1');
      expect(plan?.sessionId).toBe('session-1');
      expect(plan?.isApproved).toBe(true);
      expect(plan?.createdAt).toBe('2026-01-13T00:00:00Z');
    });

    it('should handle all valid step statuses', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked', 'skipped', 'needs_review'] as const;

      statuses.forEach((status) => {
        useSessionStore.setState({
          plan: {
            id: 'plan-1',
            sessionId: 'session-1',
            steps: [
              { id: 'step-1', title: 'Step 1', status: 'pending', order: 0 },
            ],
            isApproved: true,
          } as any,
        });

        useSessionStore.getState().updateStepStatus('step-1', status);

        const plan = useSessionStore.getState().plan;
        expect(plan?.steps[0].status).toBe(status);
      });
    });
  });

  describe('setImplementationProgress', () => {
    it('should set implementation progress', () => {
      const progress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'in_progress' as const,
        currentStepId: 'step-1',
        completedSteps: 2,
        totalSteps: 5,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progress);

      expect(useSessionStore.getState().implementationProgress).toEqual(progress);
    });

    it('should update implementation progress with new values', () => {
      const initialProgress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'in_progress' as const,
        currentStepId: 'step-1',
        completedSteps: 1,
        totalSteps: 5,
        timestamp: '2026-01-13T00:00:00Z',
      };

      const updatedProgress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'in_progress' as const,
        currentStepId: 'step-2',
        completedSteps: 2,
        totalSteps: 5,
        timestamp: '2026-01-13T00:01:00Z',
      };

      useSessionStore.getState().setImplementationProgress(initialProgress);
      expect(useSessionStore.getState().implementationProgress?.currentStepId).toBe('step-1');

      useSessionStore.getState().setImplementationProgress(updatedProgress);
      expect(useSessionStore.getState().implementationProgress?.currentStepId).toBe('step-2');
      expect(useSessionStore.getState().implementationProgress?.completedSteps).toBe(2);
    });

    it('should set implementation progress to null', () => {
      useSessionStore.setState({
        implementationProgress: {
          sessionId: 'session-1',
          projectId: 'proj-1',
          featureId: 'feat-1',
          status: 'in_progress' as const,
          currentStepId: 'step-1',
          completedSteps: 1,
          totalSteps: 5,
          timestamp: '2026-01-13T00:00:00Z',
        },
      });

      useSessionStore.getState().setImplementationProgress(null);

      expect(useSessionStore.getState().implementationProgress).toBeNull();
    });

    it('should handle testing status', () => {
      const progress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'testing' as const,
        currentStepId: 'step-1',
        completedSteps: 1,
        totalSteps: 5,
        testStatus: 'running' as const,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progress);

      expect(useSessionStore.getState().implementationProgress?.status).toBe('testing');
      expect(useSessionStore.getState().implementationProgress?.testStatus).toBe('running');
    });

    it('should handle fixing status with retry count', () => {
      const progress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'fixing' as const,
        currentStepId: 'step-1',
        completedSteps: 1,
        totalSteps: 5,
        retryCount: 2,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progress);

      expect(useSessionStore.getState().implementationProgress?.status).toBe('fixing');
      expect(useSessionStore.getState().implementationProgress?.retryCount).toBe(2);
    });

    it('should handle committing status', () => {
      const progress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'committing' as const,
        currentStepId: 'step-1',
        completedSteps: 1,
        totalSteps: 5,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progress);

      expect(useSessionStore.getState().implementationProgress?.status).toBe('committing');
    });

    it('should handle blocked status', () => {
      const progress = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'blocked' as const,
        currentStepId: 'step-1',
        completedSteps: 1,
        totalSteps: 5,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progress);

      expect(useSessionStore.getState().implementationProgress?.status).toBe('blocked');
    });
  });

  describe('implementation progress in reset', () => {
    it('should reset implementation progress to null', () => {
      useSessionStore.setState({
        implementationProgress: {
          sessionId: 'session-1',
          projectId: 'proj-1',
          featureId: 'feat-1',
          status: 'in_progress' as const,
          currentStepId: 'step-1',
          completedSteps: 3,
          totalSteps: 5,
          timestamp: '2026-01-13T00:00:00Z',
        },
      });

      useSessionStore.getState().reset();

      expect(useSessionStore.getState().implementationProgress).toBeNull();
    });
  });

  describe('socket event integration', () => {
    it('should update step status correctly for step.started event', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'pending', order: 0 },
            { id: 'step-2', title: 'Step 2', status: 'pending', order: 1 },
          ],
          isApproved: true,
        } as any,
      });

      // Simulate socket event handler calling updateStepStatus
      const stepStartedData = { stepId: 'step-1', stepTitle: 'Step 1' };
      useSessionStore.getState().updateStepStatus(stepStartedData.stepId, 'in_progress');

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('in_progress');
    });

    it('should update step status correctly for step.completed event', () => {
      useSessionStore.setState({
        plan: {
          id: 'plan-1',
          sessionId: 'session-1',
          steps: [
            { id: 'step-1', title: 'Step 1', status: 'in_progress', order: 0 },
          ],
          isApproved: true,
        } as any,
      });

      // Simulate socket event handler calling updateStepStatus
      const stepCompletedData = { stepId: 'step-1', status: 'completed' as const };
      useSessionStore.getState().updateStepStatus(stepCompletedData.stepId, stepCompletedData.status);

      const plan = useSessionStore.getState().plan;
      expect(plan?.steps[0].status).toBe('completed');
    });

    it('should handle implementation.progress event', () => {
      // Simulate socket event handler calling setImplementationProgress
      const progressData = {
        sessionId: 'session-1',
        projectId: 'proj-1',
        featureId: 'feat-1',
        status: 'in_progress' as const,
        currentStepId: 'step-2',
        completedSteps: 1,
        totalSteps: 3,
        timestamp: '2026-01-13T00:00:00Z',
      };

      useSessionStore.getState().setImplementationProgress(progressData);

      const progress = useSessionStore.getState().implementationProgress;
      expect(progress?.currentStepId).toBe('step-2');
      expect(progress?.completedSteps).toBe(1);
    });
  });
});
