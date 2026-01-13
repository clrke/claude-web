import { ClaudeOrchestrator, MAX_PLAN_VALIDATION_ATTEMPTS } from '../services/ClaudeOrchestrator';
import { OutputParser } from '../services/OutputParser';
import { PlanCompletionChecker } from '../services/PlanCompletionChecker';
import {
  PlanValidator,
  PlanValidationResult,
} from '../services/PlanValidator';
import { buildStage2Prompt } from '../prompts/stagePrompts';
import type { Session, ComposablePlan, PlanStep } from '@claude-code-web/shared';

/**
 * Helper function that mirrors buildPlanValidationPrompt from app.ts
 * Used for testing the prompt generation logic.
 */
function buildPlanValidationPrompt(missingContext: string): string {
  return `The plan structure is incomplete and needs additional sections before we can proceed to implementation.

${missingContext}

Please review and complete the plan file with all missing sections. Ensure all required sections are properly filled out:
- Meta section with title, description, status, and completedSteps tracking
- Steps array with all implementation steps (id, title, description, status, orderIndex, parentId, complexity, testStrategy)
- Dependencies array mapping step relationships
- TestCoverage section with coverage strategy and target percentage
- AcceptanceMapping linking acceptance criteria to implementing steps

After completing the plan, output [PLAN_APPROVED] to indicate readiness for implementation.`;
}

/**
 * Integration tests for Stage 2 validation loop.
 *
 * This tests the plan validation flow which:
 * 1. Validates plan completeness after Stage 2 Claude session
 * 2. Re-prompts Claude with validation context if plan is incomplete
 * 3. Prevents infinite loops with max attempt limit
 * 4. Allows progression to Stage 3 when plan is complete
 */

// =============================================================================
// Test Data Factories
// =============================================================================

function createValidStep(id: string, overrides = {}): PlanStep {
  return {
    id,
    parentId: null,
    orderIndex: 0,
    title: `Step ${id} Title`,
    description: 'This is a sufficiently detailed description that is more than 50 characters long for validation purposes.',
    status: 'pending',
    complexity: 'medium',
    acceptanceCriteriaIds: [],
    estimatedFiles: [],
    metadata: {},
    ...overrides,
  };
}

function createValidPlan(overrides = {}): ComposablePlan {
  return {
    meta: {
      version: '1.0.0',
      sessionId: 'test-session',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      isApproved: false,
      reviewCount: 1,
    },
    steps: [
      createValidStep('step-1'),
      createValidStep('step-2', { orderIndex: 1 }),
    ],
    dependencies: {
      stepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
      externalDependencies: [],
    },
    testCoverage: {
      framework: 'vitest',
      requiredTestTypes: ['unit'],
      stepCoverage: [{ stepId: 'step-1', requiredTestTypes: ['unit'] }],
    },
    acceptanceMapping: {
      mappings: [
        {
          criterionId: 'ac-1',
          criterionText: 'Feature works correctly',
          implementingStepIds: ['step-1'],
          isFullyCovered: true,
        },
      ],
      updatedAt: '2024-01-15T10:00:00Z',
    },
    validationStatus: {
      meta: true,
      steps: true,
      dependencies: true,
      testCoverage: true,
      acceptanceMapping: true,
      overall: true,
    },
    ...overrides,
  };
}

function createIncompletePlan(overrides = {}): ComposablePlan {
  return {
    meta: {
      version: '',  // Invalid - empty version
      sessionId: 'test-session',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      isApproved: false,
      reviewCount: 0,
    },
    steps: [
      createValidStep('step-1', { description: 'Short desc', complexity: undefined }), // Invalid
    ],
    dependencies: {
      stepDependencies: [],
      externalDependencies: [],
    },
    testCoverage: {
      framework: '',  // Invalid - empty framework
      requiredTestTypes: ['unit'],
      stepCoverage: [],
    },
    acceptanceMapping: {
      mappings: [
        {
          criterionId: 'ac-1',
          criterionText: 'Feature works',
          implementingStepIds: [],  // Invalid - empty
          isFullyCovered: false,
        },
      ],
      updatedAt: '2024-01-15T10:00:00Z',
    },
    validationStatus: {
      meta: false,
      steps: false,
      dependencies: true,
      testCoverage: false,
      acceptanceMapping: false,
      overall: false,
    },
    ...overrides,
  };
}

function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    version: '1.0.0',
    id: 'session-123',
    projectId: 'project-1',
    featureId: 'feature-a',
    title: 'Test Feature',
    featureDescription: 'A test feature for validation loop testing',
    projectPath: '/test/project',
    acceptanceCriteria: [{ text: 'Feature works correctly', checked: false, type: 'manual' }],
    affectedFiles: [],
    technicalNotes: '',
    baseBranch: 'main',
    featureBranch: 'feature/test-feature',
    baseCommitSha: 'abc123',
    status: 'planning',
    currentStage: 2,
    replanningCount: 0,
    claudeSessionId: null,
    claudePlanFilePath: null,
    currentPlanVersion: 1,
    claudeStage3SessionId: null,
    prUrl: null,
    sessionExpiresAt: '2024-01-16T10:00:00Z',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    planValidationAttempts: 0,
    planValidationContext: null,
    ...overrides,
  };
}

// =============================================================================
// Incomplete Plan Triggers Re-entry to Stage 2
// =============================================================================

describe('Stage 2 Validation Loop - Incomplete Plan Triggers Re-entry', () => {
  let checker: PlanCompletionChecker;
  let orchestrator: ClaudeOrchestrator;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
    orchestrator = new ClaudeOrchestrator(new OutputParser());
  });

  it('detects incomplete plan and returns false for complete', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext).not.toBe('');
  });

  it('shouldReturnToStage2 returns true for incomplete plan', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(checker.shouldReturnToStage2(result.validationResult)).toBe(true);
  });

  it('shouldContinueValidation allows re-entry when attempts available', () => {
    // First attempt
    expect(orchestrator.shouldContinueValidation(0)).toBe(true);
    // Second attempt
    expect(orchestrator.shouldContinueValidation(1)).toBe(true);
    // Third attempt (last allowed)
    expect(orchestrator.shouldContinueValidation(2)).toBe(true);
  });

  it('detects multiple validation issues in incomplete plan', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);

    // Meta section should be invalid (empty version)
    expect(result.validationResult.meta.valid).toBe(false);
    // Steps section should be invalid (short description, missing complexity)
    expect(result.validationResult.steps.valid).toBe(false);
    // Test coverage should be invalid (empty framework)
    expect(result.validationResult.testCoverage.valid).toBe(false);
    // Acceptance mapping should be invalid (empty implementing steps)
    expect(result.validationResult.acceptanceMapping.valid).toBe(false);
  });

  it('generates validation context for each incomplete section', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.missingContext).toContain('Plan');
    expect(result.missingContext.length).toBeGreaterThan(50);
  });

  it('validation loop respects attempt counter', () => {
    // Simulate validation loop with attempt counter
    const maxAttempts = MAX_PLAN_VALIDATION_ATTEMPTS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      expect(orchestrator.shouldContinueValidation(attempt, maxAttempts)).toBe(true);
    }

    // At max attempts, should stop
    expect(orchestrator.shouldContinueValidation(maxAttempts, maxAttempts)).toBe(false);
  });
});

// =============================================================================
// Validation Context in Re-prompt
// =============================================================================

describe('Stage 2 Validation Loop - Validation Context in Re-prompt', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('includes missing sections in reprompt context', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);
    const repromptContext = checker.buildRepromptContext(result.validationResult);

    expect(repromptContext.incompleteSections).toContain('meta');
    expect(repromptContext.incompleteSections).toContain('steps');
    expect(repromptContext.incompleteSections).toContain('testCoverage');
    expect(repromptContext.incompleteSections).toContain('acceptanceMapping');
  });

  it('includes steps lacking complexity in reprompt context', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: false, errors: ['Steps missing complexity rating: step-1, step-2'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const repromptContext = checker.buildRepromptContext(validationResult);

    expect(repromptContext.stepsLackingComplexity).toContain('step-1');
    expect(repromptContext.stepsLackingComplexity).toContain('step-2');
  });

  it('includes unmapped acceptance criteria in reprompt context', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: {
        valid: false,
        errors: ['Acceptance criteria "AC-1" has no implementing steps'],
      },
      overall: false,
    };

    const repromptContext = checker.buildRepromptContext(validationResult);

    expect(repromptContext.unmappedAcceptanceCriteria).toContain('AC-1');
  });

  it('includes detailed context with fix instructions', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);
    const repromptContext = checker.buildRepromptContext(result.validationResult);

    expect(repromptContext.detailedContext).toContain('Plan Validation Failed');
    expect(repromptContext.detailedContext).toContain('Instructions');
    expect(repromptContext.detailedContext).toContain('new-steps.json');
    expect(repromptContext.detailedContext).toContain('new-dependencies.json');
    expect(repromptContext.detailedContext).toContain('new-test-coverage.json');
    expect(repromptContext.detailedContext).toContain('new-acceptance.json');
  });

  it('generates summary of all issues', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);
    const repromptContext = checker.buildRepromptContext(result.validationResult);

    expect(repromptContext.summary).toContain('incomplete');
    expect(repromptContext.summary.length).toBeGreaterThan(10);
  });

  it('buildPlanValidationPrompt includes missing context', () => {
    const missingContext = `## Plan Validation Issues
The following sections are incomplete:
- meta: Version is required
- testCoverage: Framework is required`;

    const prompt = buildPlanValidationPrompt(missingContext);

    expect(prompt).toContain('Plan Validation Issues');
    expect(prompt).toContain('Version is required');
    expect(prompt).toContain('Framework is required');
  });

  it('session planValidationContext is set when plan is incomplete', () => {
    const plan = createIncompletePlan();
    const result = checker.checkPlanCompletenessSync(plan);

    // Simulate what ClaudeResultHandler does
    const updatedSession = createMockSession({
      planValidationContext: result.complete ? null : result.missingContext,
    });

    expect(updatedSession.planValidationContext).not.toBeNull();
    expect(updatedSession.planValidationContext).toContain('Plan');
  });

  it('session planValidationContext is cleared when plan is complete', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    // Simulate what ClaudeResultHandler does
    const updatedSession = createMockSession({
      planValidationContext: result.complete ? null : result.missingContext,
    });

    expect(updatedSession.planValidationContext).toBeNull();
  });
});

// =============================================================================
// Complete Plan Allows Progression to Stage 3
// =============================================================================

describe('Stage 2 Validation Loop - Complete Plan Allows Stage 3 Progression', () => {
  let checker: PlanCompletionChecker;
  let orchestrator: ClaudeOrchestrator;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
    orchestrator = new ClaudeOrchestrator(new OutputParser());
  });

  it('detects complete plan and returns true for complete', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.missingContext).toBe('');
  });

  it('shouldReturnToStage2 returns false for complete plan', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(checker.shouldReturnToStage2(result.validationResult)).toBe(false);
  });

  it('all validation sections are valid for complete plan', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.validationResult.meta.valid).toBe(true);
    expect(result.validationResult.steps.valid).toBe(true);
    expect(result.validationResult.dependencies.valid).toBe(true);
    expect(result.validationResult.testCoverage.valid).toBe(true);
    expect(result.validationResult.acceptanceMapping.valid).toBe(true);
    expect(result.validationResult.overall).toBe(true);
  });

  it('validation success is logged correctly', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    orchestrator.logValidationSuccess('feature-test', 2);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Plan Validation]')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('succeeded')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 attempt(s)')
    );

    consoleSpy.mockRestore();
  });

  it('session planValidationAttempts is reset on success', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    // Simulate session update on successful validation
    const session = createMockSession({ planValidationAttempts: 2 });

    if (result.complete) {
      // Reset attempts on success
      session.planValidationAttempts = 0;
      session.planValidationContext = null;
    }

    expect(session.planValidationAttempts).toBe(0);
    expect(session.planValidationContext).toBeNull();
  });

  it('reprompt context returns success message for complete plan', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);
    const repromptContext = checker.buildRepromptContext(result.validationResult);

    expect(repromptContext.summary).toContain('passed');
    expect(repromptContext.incompleteSections).toHaveLength(0);
    expect(repromptContext.stepsLackingComplexity).toHaveLength(0);
    expect(repromptContext.unmappedAcceptanceCriteria).toHaveLength(0);
    expect(repromptContext.insufficientDescriptions).toHaveLength(0);
  });

  it('validates plan with all step complexity levels', () => {
    const plan = createValidPlan({
      steps: [
        createValidStep('step-low', { complexity: 'low' }),
        createValidStep('step-medium', { orderIndex: 1, complexity: 'medium' }),
        createValidStep('step-high', { orderIndex: 2, complexity: 'high' }),
      ],
      dependencies: {
        stepDependencies: [],
        externalDependencies: [],
      },
      testCoverage: {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [{ stepId: 'step-low', requiredTestTypes: ['unit'] }],
      },
      acceptanceMapping: {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-low', 'step-medium', 'step-high'],
            isFullyCovered: true,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      },
    });

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.validationResult.steps.valid).toBe(true);
  });
});

// =============================================================================
// Max Validation Attempts Prevents Infinite Loop
// =============================================================================

describe('Stage 2 Validation Loop - Max Attempts Prevents Infinite Loop', () => {
  let orchestrator: ClaudeOrchestrator;

  beforeEach(() => {
    orchestrator = new ClaudeOrchestrator(new OutputParser());
  });

  it('MAX_PLAN_VALIDATION_ATTEMPTS is set to 3', () => {
    expect(MAX_PLAN_VALIDATION_ATTEMPTS).toBe(3);
  });

  it('shouldContinueValidation returns false at max attempts', () => {
    expect(orchestrator.shouldContinueValidation(MAX_PLAN_VALIDATION_ATTEMPTS)).toBe(false);
  });

  it('shouldContinueValidation returns false when exceeding max attempts', () => {
    expect(orchestrator.shouldContinueValidation(MAX_PLAN_VALIDATION_ATTEMPTS + 1)).toBe(false);
    expect(orchestrator.shouldContinueValidation(10)).toBe(false);
    expect(orchestrator.shouldContinueValidation(100)).toBe(false);
  });

  it('shouldContinueValidation accepts custom max attempts', () => {
    // Custom max of 5
    expect(orchestrator.shouldContinueValidation(4, 5)).toBe(true);
    expect(orchestrator.shouldContinueValidation(5, 5)).toBe(false);

    // Custom max of 1 (very restrictive)
    expect(orchestrator.shouldContinueValidation(0, 1)).toBe(true);
    expect(orchestrator.shouldContinueValidation(1, 1)).toBe(false);
  });

  it('logValidationMaxAttemptsReached logs warning', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    orchestrator.logValidationMaxAttemptsReached('feature-test', MAX_PLAN_VALIDATION_ATTEMPTS);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Plan Validation]')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Max attempts')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${MAX_PLAN_VALIDATION_ATTEMPTS}`)
    );

    consoleWarnSpy.mockRestore();
  });

  it('logValidationAttempt logs each attempt', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    for (let attempt = 1; attempt <= MAX_PLAN_VALIDATION_ATTEMPTS; attempt++) {
      orchestrator.logValidationAttempt('feature-test', attempt, MAX_PLAN_VALIDATION_ATTEMPTS, 'Missing sections');
    }

    expect(consoleSpy).toHaveBeenCalledTimes(MAX_PLAN_VALIDATION_ATTEMPTS);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1/3'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2/3'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3/3'));

    consoleSpy.mockRestore();
  });

  it('simulates full validation loop with max attempts', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    let currentAttempts = 0;

    // Simulate incomplete plan that never gets fixed
    while (orchestrator.shouldContinueValidation(currentAttempts)) {
      currentAttempts++;
      orchestrator.logValidationAttempt('feature-loop', currentAttempts, MAX_PLAN_VALIDATION_ATTEMPTS, 'Plan still incomplete');
    }

    // At this point, max attempts reached
    orchestrator.logValidationMaxAttemptsReached('feature-loop', MAX_PLAN_VALIDATION_ATTEMPTS);

    expect(currentAttempts).toBe(MAX_PLAN_VALIDATION_ATTEMPTS);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Max attempts'));

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('simulates validation loop with successful fix on second attempt', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const _checker = new PlanCompletionChecker(); // Used to verify it can be instantiated

    let currentAttempts = 0;
    let planIsComplete = false;

    // Simulate plan that gets fixed on attempt 2
    while (orchestrator.shouldContinueValidation(currentAttempts) && !planIsComplete) {
      currentAttempts++;
      orchestrator.logValidationAttempt('feature-fix', currentAttempts, MAX_PLAN_VALIDATION_ATTEMPTS, 'Fixing plan');

      // Simulate plan being fixed on attempt 2
      if (currentAttempts === 2) {
        planIsComplete = true;
      }
    }

    if (planIsComplete) {
      orchestrator.logValidationSuccess('feature-fix', currentAttempts);
    }

    expect(currentAttempts).toBe(2);
    expect(planIsComplete).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('succeeded after 2 attempt(s)'));

    consoleSpy.mockRestore();
  });

  it('handles edge case of zero max attempts', () => {
    // With max of 0, should never allow continuation
    expect(orchestrator.shouldContinueValidation(0, 0)).toBe(false);
  });

  it('handles negative current attempts gracefully', () => {
    // Negative attempts should still compare against max
    expect(orchestrator.shouldContinueValidation(-1)).toBe(true);
    expect(orchestrator.shouldContinueValidation(-10)).toBe(true);
  });
});

// =============================================================================
// Integration: Validation Flow Simulation
// =============================================================================

describe('Stage 2 Validation Loop - Full Flow Integration', () => {
  let checker: PlanCompletionChecker;
  let orchestrator: ClaudeOrchestrator;
  let validator: PlanValidator;

  beforeEach(() => {
    validator = new PlanValidator();
    checker = new PlanCompletionChecker(validator);
    orchestrator = new ClaudeOrchestrator(new OutputParser());
  });

  it('simulates complete validation flow from incomplete to complete', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Initial incomplete plan
    let plan = createIncompletePlan();
    const session = createMockSession({ planValidationAttempts: 0 });
    let result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);

    // First validation attempt
    if (!result.complete && orchestrator.shouldContinueValidation(session.planValidationAttempts ?? 0)) {
      session.planValidationAttempts = (session.planValidationAttempts ?? 0) + 1;
      orchestrator.logValidationAttempt(session.featureId, session.planValidationAttempts, MAX_PLAN_VALIDATION_ATTEMPTS);

      // Plan still incomplete after attempt 1
      result = checker.checkPlanCompletenessSync(plan);
      expect(result.complete).toBe(false);
    }

    // Second validation attempt
    if (!result.complete && orchestrator.shouldContinueValidation(session.planValidationAttempts ?? 0)) {
      session.planValidationAttempts = (session.planValidationAttempts ?? 0) + 1;
      orchestrator.logValidationAttempt(session.featureId, session.planValidationAttempts, MAX_PLAN_VALIDATION_ATTEMPTS);

      // Simulate plan being fixed
      plan = createValidPlan();
      result = checker.checkPlanCompletenessSync(plan);
      expect(result.complete).toBe(true);
    }

    // Successful completion
    if (result.complete) {
      orchestrator.logValidationSuccess(session.featureId, session.planValidationAttempts ?? 0);
      session.planValidationAttempts = 0;
      session.planValidationContext = null;
    }

    expect(session.planValidationAttempts).toBe(0);
    expect(session.planValidationContext).toBeNull();

    consoleSpy.mockRestore();
  });

  it('simulates validation flow that reaches max attempts', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const plan = createIncompletePlan();
    const session = createMockSession({ planValidationAttempts: 0 });
    let result = checker.checkPlanCompletenessSync(plan);

    // Run validation loop until max attempts
    while (!result.complete && orchestrator.shouldContinueValidation(session.planValidationAttempts ?? 0)) {
      session.planValidationAttempts = (session.planValidationAttempts ?? 0) + 1;
      orchestrator.logValidationAttempt(
        session.featureId,
        session.planValidationAttempts,
        MAX_PLAN_VALIDATION_ATTEMPTS,
        result.missingContext
      );

      // Plan never gets fixed in this test
      result = checker.checkPlanCompletenessSync(plan);
    }

    // Max attempts reached
    expect(session.planValidationAttempts).toBe(MAX_PLAN_VALIDATION_ATTEMPTS);
    expect(result.complete).toBe(false);

    // Log max attempts warning
    orchestrator.logValidationMaxAttemptsReached(session.featureId, MAX_PLAN_VALIDATION_ATTEMPTS);

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Max attempts'));

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('validates that buildStage2Prompt includes validation context when set', () => {
    const session = createMockSession({
      planValidationContext: '## Plan Validation Issues\n- Meta: Version is required',
    });
    const plan = createValidPlan();

    const prompt = buildStage2Prompt(session, plan as any, 1);

    // The prompt should include the validation context
    expect(prompt).toContain('Plan Validation Issues');
    expect(prompt).toContain('Version is required');
  });

  it('validates that buildStage2Prompt works without validation context', () => {
    const session = createMockSession({
      planValidationContext: null,
    });
    const plan = createValidPlan();

    const prompt = buildStage2Prompt(session, plan as any, 1);

    expect(prompt).not.toContain('Plan Validation Issues');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('circular dependency detection prevents Stage 3 progression', () => {
    const plan = createValidPlan({
      dependencies: {
        stepDependencies: [
          { stepId: 'step-1', dependsOn: 'step-2' },
          { stepId: 'step-2', dependsOn: 'step-1' }, // Circular!
        ],
        externalDependencies: [],
      },
    });

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.dependencies.valid).toBe(false);
    expect(result.validationResult.dependencies.errors.some(e =>
      e.toLowerCase().includes('circular')
    )).toBe(true);
    expect(checker.shouldReturnToStage2(result.validationResult)).toBe(true);
  });

  it('orphaned step references prevent Stage 3 progression', () => {
    const plan = createValidPlan();
    plan.steps[1].parentId = 'non-existent-step';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(checker.shouldReturnToStage2(result.validationResult)).toBe(true);
  });

  it('placeholder text in description prevents Stage 3 progression', () => {
    const plan = createValidPlan();
    plan.steps[0].description = 'This is a sufficiently long description but contains TBD placeholder that needs work.';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(result.validationResult.steps.errors.some(e => e.includes('placeholder'))).toBe(true);
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Stage 2 Validation Loop - Edge Cases', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('handles null plan gracefully', () => {
    const result = checker.checkPlanCompletenessSync(null);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan');
  });

  it('handles undefined plan gracefully', () => {
    const result = checker.checkPlanCompletenessSync(undefined);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan');
  });

  it('handles empty object plan gracefully', () => {
    const result = checker.checkPlanCompletenessSync({});

    expect(result.complete).toBe(false);
    expect(result.validationResult.overall).toBe(false);
  });

  it('handles plan with empty steps array', () => {
    const plan = createValidPlan({ steps: [] });

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(result.validationResult.steps.errors[0]).toContain('at least one step');
  });

  it('handles plan with only partial sections', () => {
    const partialPlan = {
      meta: {
        version: '1.0.0',
        sessionId: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 0,
      },
      steps: [createValidStep('step-1')],
      // Missing: dependencies, testCoverage, acceptanceMapping
    };

    const result = checker.checkPlanCompletenessSync(partialPlan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.meta.valid).toBe(true);
    expect(result.validationResult.steps.valid).toBe(true);
    expect(result.validationResult.dependencies.valid).toBe(false);
    expect(result.validationResult.testCoverage.valid).toBe(false);
    expect(result.validationResult.acceptanceMapping.valid).toBe(false);
  });

  it('handles validation result with empty error arrays', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: true,
    };

    expect(checker.shouldReturnToStage2(validationResult)).toBe(false);
  });

  it('handles very long validation context in logging', () => {
    const orchestrator = new ClaudeOrchestrator(new OutputParser());
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const longContext = 'A'.repeat(500); // Very long context

    orchestrator.logValidationAttempt('feature-long', 1, 3, longContext);

    // Should truncate with ellipsis
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('...'));

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// buildPlanValidationPrompt Tests
// =============================================================================

describe('buildPlanValidationPrompt', () => {
  it('includes the missing context in the prompt', () => {
    const missingContext = `## Plan Validation Issues
- Meta: Version is required
- Steps: Description too short for step-1`;

    const prompt = buildPlanValidationPrompt(missingContext);

    expect(prompt).toContain('Plan Validation Issues');
    expect(prompt).toContain('Version is required');
    expect(prompt).toContain('Description too short');
  });

  it('includes instruction to fix incomplete plan structure', () => {
    const missingContext = '## Test Issues\n- Some issue';

    const prompt = buildPlanValidationPrompt(missingContext);

    expect(prompt).toContain('incomplete');
  });

  it('works with empty missing context', () => {
    const prompt = buildPlanValidationPrompt('');

    expect(prompt.length).toBeGreaterThan(0);
  });

  it('works with multiline missing context', () => {
    const missingContext = `## Issues
Line 1
Line 2
Line 3

### Section
- Item A
- Item B`;

    const prompt = buildPlanValidationPrompt(missingContext);

    expect(prompt).toContain('Line 1');
    expect(prompt).toContain('Item A');
  });
});
