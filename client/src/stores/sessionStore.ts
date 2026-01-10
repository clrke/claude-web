import { create } from 'zustand';
import type { Session, Plan, Question } from '@claude-code-web/shared';

interface SessionState {
  // Current session data
  session: Session | null;
  plan: Plan | null;
  questions: Question[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setSession: (session: Session | null) => void;
  setPlan: (plan: Plan | null) => void;
  setQuestions: (questions: Question[]) => void;
  addQuestion: (question: Question) => void;
  answerQuestion: (questionId: string, answer: Question['answer']) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Async actions
  fetchSession: (projectId: string, featureId: string) => Promise<void>;
  submitQuestionAnswer: (questionId: string, answer: Question['answer']) => Promise<void>;
  approvePlan: () => Promise<void>;
  requestPlanChanges: (feedback: string) => Promise<void>;
}

const initialState = {
  session: null,
  plan: null,
  questions: [],
  isLoading: false,
  error: null,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialState,

  setSession: (session) => set({ session }),
  setPlan: (plan) => set({ plan }),
  setQuestions: (questions) => set({ questions }),

  addQuestion: (question) =>
    set((state) => ({
      questions: [...state.questions, question],
    })),

  answerQuestion: (questionId, answer) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === questionId ? { ...q, answer, answeredAt: new Date().toISOString() } : q
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),

  fetchSession: async (projectId, featureId) => {
    set({ isLoading: true, error: null });
    try {
      const [sessionRes, planRes, questionsRes] = await Promise.all([
        fetch(`/api/sessions/${projectId}/${featureId}`),
        fetch(`/api/sessions/${projectId}/${featureId}/plan`),
        fetch(`/api/sessions/${projectId}/${featureId}/questions`),
      ]);

      if (!sessionRes.ok) {
        throw new Error('Session not found');
      }

      const session = await sessionRes.json();
      const plan = planRes.ok ? await planRes.json() : null;
      const questionsData = questionsRes.ok ? await questionsRes.json() : { questions: [] };

      set({
        session,
        plan,
        questions: questionsData.questions || [],
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch session',
        isLoading: false,
      });
    }
  },

  submitQuestionAnswer: async (questionId, answer) => {
    const { session, questions } = get();
    if (!session) return;

    const question = questions.find((q) => q.id === questionId);
    if (!question) return;

    try {
      const response = await fetch(
        `/api/sessions/${session.projectId}/${session.featureId}/questions/${questionId}/answer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to submit answer');
      }

      // Update local state
      get().answerQuestion(questionId, answer);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to submit answer',
      });
    }
  },

  approvePlan: async () => {
    const { session, plan } = get();
    if (!session || !plan) return;

    try {
      const response = await fetch(
        `/api/sessions/${session.projectId}/${session.featureId}/plan/approve`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to approve plan');
      }

      const updatedPlan = await response.json();
      set({ plan: updatedPlan });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to approve plan',
      });
    }
  },

  requestPlanChanges: async (feedback) => {
    const { session } = get();
    if (!session) return;

    try {
      const response = await fetch(
        `/api/sessions/${session.projectId}/${session.featureId}/plan/request-changes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to request changes');
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to request changes',
      });
    }
  },
}));
