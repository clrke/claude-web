import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionStore, usePlanStep, useQuestion } from './sessionStore';
import type { Plan, PlanStep, Question } from '@claude-code-web/shared';

describe('sessionStore selector hooks', () => {
  // Reset store state before each test
  beforeEach(() => {
    useSessionStore.setState({
      session: null,
      plan: null,
      questions: [],
      conversations: [],
      executionStatus: null,
      liveOutput: '',
      isOutputComplete: true,
      implementationProgress: null,
      isLoading: false,
      error: null,
    });
  });

  describe('usePlanStep', () => {
    const mockPlanSteps: PlanStep[] = [
      { id: 'step-1', title: 'First step', parentId: null, orderIndex: 0, description: 'Desc 1', status: 'pending', metadata: {} },
      { id: 'step-2', title: 'Second step', parentId: null, orderIndex: 1, description: 'Desc 2', status: 'completed', metadata: {} },
      { id: 'step-3', title: 'Third step', parentId: 'step-1', orderIndex: 2, description: 'Desc 3', status: 'in_progress', metadata: {} },
    ];

    const mockPlan: Plan = {
      version: '1.0',
      planVersion: 1,
      sessionId: 'test-session',
      isApproved: false,
      reviewCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      steps: mockPlanSteps,
    };

    it('returns undefined when stepId is undefined', () => {
      const { result } = renderHook(() => usePlanStep(undefined));
      expect(result.current).toBeUndefined();
    });

    it('returns undefined when plan is not loaded', () => {
      const { result } = renderHook(() => usePlanStep('step-1'));
      expect(result.current).toBeUndefined();
    });

    it('returns undefined when step is not found', () => {
      useSessionStore.setState({ plan: mockPlan });
      const { result } = renderHook(() => usePlanStep('nonexistent-step'));
      expect(result.current).toBeUndefined();
    });

    it('returns the correct step when found', () => {
      useSessionStore.setState({ plan: mockPlan });
      const { result } = renderHook(() => usePlanStep('step-2'));
      expect(result.current).toEqual(mockPlanSteps[1]);
      expect(result.current?.title).toBe('Second step');
    });

    it('updates when store changes', () => {
      useSessionStore.setState({ plan: mockPlan });
      const { result } = renderHook(() => usePlanStep('step-1'));
      expect(result.current?.status).toBe('pending');

      // Update the step status
      act(() => {
        useSessionStore.getState().updateStepStatus('step-1', 'completed');
      });

      expect(result.current?.status).toBe('completed');
    });
  });

  describe('useQuestion', () => {
    const mockQuestions: Question[] = [
      {
        id: 'q-1',
        stage: 'discovery',
        questionType: 'single_choice',
        category: 'scope',
        priority: 1,
        questionText: 'First question?',
        options: [{ value: 'a', label: 'Option A' }],
        answer: null,
        isRequired: true,
        askedAt: '2024-01-01T00:00:00Z',
        answeredAt: null,
      },
      {
        id: 'q-2',
        stage: 'planning',
        questionType: 'single_choice',
        category: 'approach',
        priority: 2,
        questionText: 'Second question?',
        options: [{ value: 'b', label: 'Option B' }],
        answer: { value: 'b' },
        isRequired: false,
        askedAt: '2024-01-01T01:00:00Z',
        answeredAt: '2024-01-01T02:00:00Z',
      },
    ];

    it('returns undefined when questionId is undefined', () => {
      const { result } = renderHook(() => useQuestion(undefined));
      expect(result.current).toBeUndefined();
    });

    it('returns undefined when questions array is empty', () => {
      const { result } = renderHook(() => useQuestion('q-1'));
      expect(result.current).toBeUndefined();
    });

    it('returns undefined when question is not found', () => {
      useSessionStore.setState({ questions: mockQuestions });
      const { result } = renderHook(() => useQuestion('nonexistent-question'));
      expect(result.current).toBeUndefined();
    });

    it('returns the correct question when found', () => {
      useSessionStore.setState({ questions: mockQuestions });
      const { result } = renderHook(() => useQuestion('q-2'));
      expect(result.current).toEqual(mockQuestions[1]);
      expect(result.current?.questionText).toBe('Second question?');
    });

    it('returns answered question correctly', () => {
      useSessionStore.setState({ questions: mockQuestions });
      const { result } = renderHook(() => useQuestion('q-2'));
      expect(result.current?.answeredAt).toBe('2024-01-01T02:00:00Z');
      expect(result.current?.answer).toEqual({ value: 'b' });
    });

    it('returns unanswered question correctly', () => {
      useSessionStore.setState({ questions: mockQuestions });
      const { result } = renderHook(() => useQuestion('q-1'));
      expect(result.current?.answeredAt).toBeNull();
      expect(result.current?.answer).toBeNull();
    });

    it('updates when store changes', () => {
      useSessionStore.setState({ questions: mockQuestions });
      const { result } = renderHook(() => useQuestion('q-1'));
      expect(result.current?.answer).toBeNull();

      // Answer the question
      act(() => {
        useSessionStore.getState().answerQuestion('q-1', { value: 'a' });
      });

      expect(result.current?.answer).toEqual({ value: 'a' });
      expect(result.current?.answeredAt).not.toBeNull();
    });
  });
});
