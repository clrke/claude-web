/**
 * Tests for batch answers endpoint validation context integration.
 *
 * Verifies that the POST /api/sessions/:projectId/:featureId/questions/answers endpoint:
 * 1. Reads validation-logs.json when resuming Claude
 * 2. Extracts validation context from the logs
 * 3. Passes the context to buildBatchAnswersContinuationPrompt
 */

import type { ValidationContext } from '@claude-code-web/shared';
import type { ValidationLog } from '../../server/src/services/DecisionValidator';
import { extractValidationContext, createEmptyValidationContext, hasValidationContext } from '../../server/src/utils/validationContextExtractor';
import { buildBatchAnswersContinuationPrompt, formatValidationContextSection } from '../../server/src/prompts/stagePrompts';
import { Question } from '@claude-code-web/shared';

describe('Batch Answers Validation Context Integration', () => {
  // Mock question for testing
  const createMockQuestion = (id: string, answer: string): Question => ({
    id,
    sessionId: 'test-session',
    questionText: 'Which approach should we use?',
    questionType: 'decision',
    priority: 1,
    category: 'approach',
    options: [
      { label: 'Option A', recommended: true },
      { label: 'Option B', recommended: false },
    ],
    status: 'answered',
    batch: 1,
    stage: 1,
    createdAt: '2026-01-11T00:00:00Z',
    answer: { value: answer },
    answeredAt: '2026-01-11T00:01:00Z',
  });

  // Mock validation log structure
  const createMockValidationLogs = (entries: ValidationLog[]): { entries: ValidationLog[] } => ({
    entries,
  });

  const createFilteredValidationLog = (): ValidationLog => ({
    timestamp: '2026-01-11T00:00:00Z',
    totalDecisions: 3,
    passedCount: 1,
    filteredCount: 2,
    repurposedCount: 0,
    results: [
      {
        decision: {
          questionText: 'What database?',
          category: 'technical',
          priority: 2,
          options: [],
        },
        action: 'filter',
        reason: 'Already determined from codebase',
        validatedAt: '2026-01-11T00:00:01Z',
        durationMs: 1500,
        prompt: 'Validation prompt',
        output: '{"action": "filter", "reason": "Already determined"}',
      },
      {
        decision: {
          questionText: 'Should we use TypeScript?',
          category: 'technical',
          priority: 2,
          options: [],
        },
        action: 'filter',
        reason: 'Project already uses TypeScript',
        validatedAt: '2026-01-11T00:00:02Z',
        durationMs: 1200,
        prompt: 'Validation prompt',
        output: '{"action": "filter", "reason": "Project already uses TypeScript"}',
      },
      {
        decision: {
          questionText: 'Which auth method?',
          category: 'approach',
          priority: 1,
          options: [],
        },
        action: 'pass',
        reason: 'Valid question needing user input',
        validatedAt: '2026-01-11T00:00:03Z',
        durationMs: 1100,
        prompt: 'Validation prompt',
        output: '{"action": "pass"}',
      },
    ],
  });

  const createRepurposedValidationLog = (): ValidationLog => ({
    timestamp: '2026-01-11T00:00:00Z',
    totalDecisions: 2,
    passedCount: 0,
    filteredCount: 0,
    repurposedCount: 2,
    results: [
      {
        decision: {
          questionText: 'What tech stack?',
          category: 'approach',
          priority: 1,
          options: [],
        },
        action: 'repurpose',
        reason: 'Too broad - split into specific questions',
        repurposedQuestions: [
          {
            questionText: 'Which frontend framework?',
            category: 'technical',
            priority: 2,
            options: [{ label: 'React', recommended: true }],
          },
          {
            questionText: 'Which backend framework?',
            category: 'technical',
            priority: 2,
            options: [{ label: 'Express', recommended: true }],
          },
        ],
        validatedAt: '2026-01-11T00:00:01Z',
        durationMs: 2500,
        prompt: 'Validation prompt',
        output: '{"action": "repurpose"}',
      },
      {
        decision: {
          questionText: 'How to handle errors?',
          category: 'technical',
          priority: 2,
          options: [],
        },
        action: 'repurpose',
        reason: 'Made more specific',
        repurposedQuestions: [
          {
            questionText: 'Global error boundary or per-component?',
            category: 'technical',
            priority: 2,
            options: [],
          },
        ],
        validatedAt: '2026-01-11T00:00:02Z',
        durationMs: 1800,
        prompt: 'Validation prompt',
        output: '{"action": "repurpose"}',
      },
    ],
  });

  describe('extractValidationContext integration', () => {
    it('should extract context from validation logs with filtered questions', () => {
      const logs = createMockValidationLogs([createFilteredValidationLog()]);
      const context = extractValidationContext(logs);

      expect(context.summary.totalProcessed).toBe(3);
      expect(context.summary.filteredCount).toBe(2);
      expect(context.filteredQuestions).toHaveLength(2);
      expect(context.filteredQuestions[0].questionText).toBe('What database?');
      expect(context.filteredQuestions[0].reason).toBe('Already determined from codebase');
    });

    it('should extract context from validation logs with repurposed questions', () => {
      const logs = createMockValidationLogs([createRepurposedValidationLog()]);
      const context = extractValidationContext(logs);

      expect(context.summary.totalProcessed).toBe(2);
      expect(context.summary.repurposedCount).toBe(2);
      expect(context.repurposedQuestions).toHaveLength(2);
      expect(context.repurposedQuestions[0].originalQuestionText).toBe('What tech stack?');
      expect(context.repurposedQuestions[0].newQuestionTexts).toHaveLength(2);
    });

    it('should aggregate context across multiple validation batches', () => {
      const logs = createMockValidationLogs([
        createFilteredValidationLog(),
        createRepurposedValidationLog(),
      ]);
      const context = extractValidationContext(logs);

      expect(context.summary.totalProcessed).toBe(5); // 3 + 2
      expect(context.summary.filteredCount).toBe(2);
      expect(context.summary.repurposedCount).toBe(2);
      expect(context.filteredQuestions).toHaveLength(2);
      expect(context.repurposedQuestions).toHaveLength(2);
    });

    it('should return empty context when logs are null', () => {
      const context = extractValidationContext(null);

      expect(hasValidationContext(context)).toBe(false);
      expect(context.filteredQuestions).toHaveLength(0);
      expect(context.repurposedQuestions).toHaveLength(0);
    });

    it('should return empty context when logs have no entries', () => {
      const logs = createMockValidationLogs([]);
      const context = extractValidationContext(logs);

      expect(hasValidationContext(context)).toBe(false);
    });
  });

  describe('buildBatchAnswersContinuationPrompt with validation context', () => {
    it('should include validation context in Stage 1 continuation prompt', () => {
      const questions = [createMockQuestion('q1', 'Use approach A')];
      const logs = createMockValidationLogs([createFilteredValidationLog()]);
      const context = extractValidationContext(logs);

      const prompt = buildBatchAnswersContinuationPrompt(
        questions,
        1,
        '/path/to/plan.md',
        undefined,
        context
      );

      expect(prompt).toContain('Validation Context');
      expect(prompt).toContain('What database?');
      expect(prompt).toContain('Already determined from codebase');
      expect(prompt).toContain('Filtered: 2');
    });

    it('should include validation context in Stage 2 continuation prompt', () => {
      const questions = [createMockQuestion('q1', 'Accept the risk')];
      const logs = createMockValidationLogs([createRepurposedValidationLog()]);
      const context = extractValidationContext(logs);

      const prompt = buildBatchAnswersContinuationPrompt(
        questions,
        2,
        '/path/to/plan.md',
        undefined,
        context
      );

      expect(prompt).toContain('Validation Context');
      expect(prompt).toContain('What tech stack?');
      expect(prompt).toContain('Too broad - split into specific questions');
      expect(prompt).toContain('Repurposed: 2');
    });

    it('should not include validation context when no filtered/repurposed questions', () => {
      const questions = [createMockQuestion('q1', 'Answer')];
      const context = createEmptyValidationContext();

      const prompt = buildBatchAnswersContinuationPrompt(
        questions,
        1,
        '/path/to/plan.md',
        undefined,
        context
      );

      expect(prompt).not.toContain('Validation Context');
    });

    it('should include both remarks and validation context', () => {
      const questions = [createMockQuestion('q1', 'Answer')];
      const logs = createMockValidationLogs([createFilteredValidationLog()]);
      const context = extractValidationContext(logs);

      const prompt = buildBatchAnswersContinuationPrompt(
        questions,
        1,
        '/path/to/plan.md',
        'Please also consider security implications',
        context
      );

      expect(prompt).toContain('Please also consider security implications');
      expect(prompt).toContain('Validation Context');

      // Verify order: remarks before validation context
      const remarksIndex = prompt.indexOf('Please also consider security');
      const contextIndex = prompt.indexOf('Validation Context');
      expect(remarksIndex).toBeLessThan(contextIndex);
    });

    it('should preserve standard prompt sections with validation context', () => {
      const questions = [createMockQuestion('q1', 'My answer')];
      const logs = createMockValidationLogs([createFilteredValidationLog()]);
      const context = extractValidationContext(logs);

      const prompt = buildBatchAnswersContinuationPrompt(
        questions,
        1,
        '/path/to/plan.md',
        undefined,
        context
      );

      // Verify standard sections are present
      expect(prompt).toContain('Which approach should we use?');
      expect(prompt).toContain('My answer');
      expect(prompt).toContain('[DECISION_NEEDED');
      expect(prompt).toContain('[PLAN_STEP]');
    });
  });

  describe('End-to-end flow simulation', () => {
    it('should simulate reading validation logs and building prompt', () => {
      // Simulate the endpoint flow:
      // 1. Read validation logs (mocked)
      const validationLogs = createMockValidationLogs([
        createFilteredValidationLog(),
        createRepurposedValidationLog(),
      ]);

      // 2. Extract validation context
      const validationContext = extractValidationContext(validationLogs);

      // 3. Build the prompt with context
      const answeredQuestions = [
        createMockQuestion('q1', 'Use React'),
        createMockQuestion('q2', 'Use Express'),
      ];

      const prompt = buildBatchAnswersContinuationPrompt(
        answeredQuestions,
        1,
        '/test/plan.md',
        'Also add tests',
        validationContext
      );

      // Verify the complete prompt
      expect(prompt).toContain('Use React');
      expect(prompt).toContain('Use Express');
      expect(prompt).toContain('Also add tests');
      expect(prompt).toContain('Validation Context');
      expect(prompt).toContain('Total questions processed: 5');
      expect(prompt).toContain('Filtered: 2');
      expect(prompt).toContain('Repurposed: 2');
    });

    it('should handle the case when validation logs do not exist', () => {
      // Simulate reading null from storage (file doesn't exist)
      const validationLogs = null;

      const validationContext = extractValidationContext(validationLogs);
      const answeredQuestions = [createMockQuestion('q1', 'Answer')];

      const prompt = buildBatchAnswersContinuationPrompt(
        answeredQuestions,
        1,
        '/test/plan.md',
        undefined,
        validationContext
      );

      // Prompt should still work without validation context
      expect(prompt).toContain('Answer');
      expect(prompt).not.toContain('Validation Context');
    });
  });
});
