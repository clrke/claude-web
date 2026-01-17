import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  PlanCompletionChecker,
  planCompletionChecker,
} from '../PlanCompletionChecker';
import {
  PlanValidator,
  PlanValidationResult,
} from '../PlanValidator';
import type { ComposablePlan, PlanStep } from '@claude-code-web/shared';

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
      createValidStep('step-2', { parentId: 'step-1', orderIndex: 1 }),
    ],
    dependencies: {
      stepDependencies: [
        { stepId: 'step-2', dependsOn: 'step-1' },
      ],
      externalDependencies: [],
    },
    testCoverage: {
      framework: 'vitest',
      requiredTestTypes: ['unit'],
      stepCoverage: [
        { stepId: 'step-1', requiredTestTypes: ['unit'] },
      ],
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
      createValidStep('step-1', { description: 'Short desc', complexity: undefined }), // Invalid - short description, missing complexity
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
          implementingStepIds: [],  // Invalid - empty implementing steps
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

// =============================================================================
// Complete Plans Pass Validation Tests
// =============================================================================

describe('PlanCompletionChecker - Complete Plans Validation', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('validates a complete plan with all sections', () => {
    const plan = createValidPlan();
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.missingContext).toBe('');
    expect(result.validationResult.overall).toBe(true);
  });

  it('validates complete plan with multiple steps', () => {
    const plan = createValidPlan({
      steps: [
        createValidStep('step-1', { complexity: 'low' }),
        createValidStep('step-2', { orderIndex: 1, complexity: 'medium' }),
        createValidStep('step-3', { orderIndex: 2, complexity: 'high' }),
      ],
      acceptanceMapping: {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-1', 'step-2', 'step-3'],
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

  it('validates complete plan with nested step hierarchy', () => {
    const plan = createValidPlan({
      steps: [
        createValidStep('step-1'),
        createValidStep('step-1.1', { parentId: 'step-1', orderIndex: 1 }),
        createValidStep('step-1.2', { parentId: 'step-1', orderIndex: 2 }),
        createValidStep('step-2', { orderIndex: 3 }),
      ],
      acceptanceMapping: {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-1'],
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

  it('validates complete plan with all complexity levels', () => {
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
        stepCoverage: [
          { stepId: 'step-low', requiredTestTypes: ['unit'] },
        ],
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
  });

  it('validates complete plan with external dependencies', () => {
    const plan = createValidPlan({
      dependencies: {
        stepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
        externalDependencies: [
          {
            name: 'zod',
            type: 'npm',
            version: '3.22.0',
            reason: 'Schema validation',
            requiredBy: ['step-1'],
          },
        ],
      },
    });
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.validationResult.dependencies.valid).toBe(true);
  });

  it('validates complete plan with detailed test coverage', () => {
    const plan = createValidPlan({
      testCoverage: {
        framework: 'jest',
        requiredTestTypes: ['unit', 'integration'],
        globalCoverageTarget: 80,
        stepCoverage: [
          {
            stepId: 'step-1',
            requiredTestTypes: ['unit'],
            coverageTarget: 90,
            testCases: ['should do X', 'should handle Y'],
          },
          {
            stepId: 'step-2',
            requiredTestTypes: ['unit', 'integration'],
            coverageTarget: 85,
          },
        ],
      },
    });
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.validationResult.testCoverage.valid).toBe(true);
  });

  it('validates complete plan with multiple acceptance criteria', () => {
    const plan = createValidPlan({
      acceptanceMapping: {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'User can log in',
            implementingStepIds: ['step-1'],
            isFullyCovered: true,
          },
          {
            criterionId: 'ac-2',
            criterionText: 'User can log out',
            implementingStepIds: ['step-2'],
            isFullyCovered: true,
          },
          {
            criterionId: 'ac-3',
            criterionText: 'Session persists',
            implementingStepIds: ['step-1', 'step-2'],
            isFullyCovered: false,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      },
    });
    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(true);
    expect(result.validationResult.acceptanceMapping.valid).toBe(true);
  });
});

// =============================================================================
// Incomplete Plans Missing Context Tests
// =============================================================================

describe('PlanCompletionChecker - Incomplete Plans Missing Context', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('returns missing context for plan with no meta version', () => {
    const plan = createValidPlan();
    plan.meta.version = '';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('Plan');
    expect(result.validationResult.meta.valid).toBe(false);
  });

  it('returns missing context for plan with short description', () => {
    const plan = createValidPlan();
    plan.steps[0].description = 'Too short';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('description');
    expect(result.validationResult.steps.valid).toBe(false);
  });

  it('returns missing context for plan with no steps', () => {
    const plan = createValidPlan();
    plan.steps = [];

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('step');
    expect(result.validationResult.steps.valid).toBe(false);
  });

  it('returns missing context for plan with circular dependencies', () => {
    const plan = createValidPlan();
    plan.dependencies.stepDependencies = [
      { stepId: 'step-1', dependsOn: 'step-2' },
      { stepId: 'step-2', dependsOn: 'step-1' },
    ];

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext.toLowerCase()).toContain('circular');
    expect(result.validationResult.dependencies.valid).toBe(false);
  });

  it('returns missing context for plan with empty framework', () => {
    const plan = createValidPlan();
    plan.testCoverage.framework = '';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('framework');
    expect(result.validationResult.testCoverage.valid).toBe(false);
  });

  it('returns missing context for acceptance criteria with no implementing steps', () => {
    const plan = createValidPlan();
    plan.acceptanceMapping.mappings[0].implementingStepIds = [];

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.acceptanceMapping.valid).toBe(false);
  });

  it('returns missing context for null plan', () => {
    const result = checker.checkPlanCompletenessSync(null);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan provided');
    expect(result.validationResult.overall).toBe(false);
  });

  it('returns missing context for undefined plan', () => {
    const result = checker.checkPlanCompletenessSync(undefined);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan');
  });

  it('returns missing context for empty object plan', () => {
    const result = checker.checkPlanCompletenessSync({});

    expect(result.complete).toBe(false);
    expect(result.validationResult.overall).toBe(false);
  });

  it('returns comprehensive missing context for multiple issues', () => {
    const plan = createIncompletePlan();

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.meta.valid).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(result.validationResult.testCoverage.valid).toBe(false);
    expect(result.validationResult.acceptanceMapping.valid).toBe(false);
  });

  it('returns missing context with orphaned parent references', () => {
    const plan = createValidPlan();
    plan.steps[1].parentId = 'non-existent-step';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(result.validationResult.steps.errors.some(e => e.includes('orphaned'))).toBe(true);
  });

  it('returns missing context for placeholder text in description', () => {
    const plan = createValidPlan();
    plan.steps[0].description = 'This is a sufficiently long description but contains TBD placeholder that needs filling in.';

    const result = checker.checkPlanCompletenessSync(plan);

    expect(result.complete).toBe(false);
    expect(result.validationResult.steps.valid).toBe(false);
    expect(result.validationResult.steps.errors.some(e => e.includes('placeholder'))).toBe(true);
  });
});

// =============================================================================
// Reprompt Context Tests
// =============================================================================

describe('PlanCompletionChecker - Reprompt Context', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('builds reprompt context with all incomplete sections listed', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: false, errors: ['Version is required'] },
      steps: { valid: false, errors: ['Steps missing complexity rating: step-1, step-2'] },
      dependencies: { valid: false, errors: ['Circular dependency detected'] },
      testCoverage: { valid: false, errors: ['Framework is required'] },
      acceptanceMapping: { valid: false, errors: ['Acceptance criteria "ac-1" has no implementing steps'] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.incompleteSections).toContain('meta');
    expect(context.incompleteSections).toContain('steps');
    expect(context.incompleteSections).toContain('dependencies');
    expect(context.incompleteSections).toContain('testCoverage');
    expect(context.incompleteSections).toContain('acceptanceMapping');
    expect(context.incompleteSections).toHaveLength(5);
  });

  it('builds reprompt context with steps lacking complexity', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: false, errors: ['Steps missing complexity rating: step-1, step-3, step-5'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.stepsLackingComplexity).toContain('step-1');
    expect(context.stepsLackingComplexity).toContain('step-3');
    expect(context.stepsLackingComplexity).toContain('step-5');
    expect(context.stepsLackingComplexity).toHaveLength(3);
  });

  it('builds reprompt context with unmapped acceptance criteria', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: {
        valid: false,
        errors: [
          'Acceptance criteria "AC-1" has no implementing steps',
          'Acceptance criteria "AC-2" has no implementing steps',
        ],
      },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.unmappedAcceptanceCriteria).toContain('AC-1');
    expect(context.unmappedAcceptanceCriteria).toContain('AC-2');
    expect(context.unmappedAcceptanceCriteria).toHaveLength(2);
  });

  it('builds reprompt context with insufficient descriptions', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: {
        valid: false,
        errors: [
          'Step 1 (step-1): description must be at least 50 characters',
          'Step 2 (step-2): description must be at least 50 characters',
        ],
      },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.insufficientDescriptions).toContain('step-1');
    expect(context.insufficientDescriptions).toContain('step-2');
    expect(context.insufficientDescriptions).toHaveLength(2);
  });

  it('builds summary with all issue types', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: false, errors: ['Error'] },
      steps: { valid: false, errors: ['Steps missing complexity rating: step-1'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: false, errors: ['Acceptance criteria "ac-1" has no implementing steps'] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.summary).toContain('incomplete');
    expect(context.summary).toContain('meta');
    expect(context.summary).toContain('step');
    expect(context.summary).toContain('acceptance');
  });

  it('builds detailed context string with section headers', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: false, errors: ['version: Required'] },
      steps: { valid: false, errors: ['Error in steps'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.detailedContext).toContain('## Plan Validation Failed');
    expect(context.detailedContext).toContain('### Incomplete Sections');
    expect(context.detailedContext).toContain('#### Plan Metadata');
    expect(context.detailedContext).toContain('version: Required');
  });

  it('includes instructions for editing plan files', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: false, errors: ['Error'] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.detailedContext).toContain('### Instructions');
    expect(context.detailedContext).toContain('new-steps.json');
    expect(context.detailedContext).toContain('new-dependencies.json');
    expect(context.detailedContext).toContain('new-test-coverage.json');
    expect(context.detailedContext).toContain('new-acceptance.json');
  });

  it('returns success message when validation passes', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: true,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.summary).toContain('passed');
    expect(context.incompleteSections).toHaveLength(0);
    expect(context.stepsLackingComplexity).toHaveLength(0);
    expect(context.unmappedAcceptanceCriteria).toHaveLength(0);
    expect(context.insufficientDescriptions).toHaveLength(0);
  });

  it('includes complexity guidance section when steps lack complexity', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: false, errors: ['Steps missing complexity rating: step-1'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    const context = checker.buildRepromptContext(validationResult);

    expect(context.detailedContext).toContain('Steps Missing Complexity Ratings');
    expect(context.detailedContext).toContain('low, medium, or high');
    expect(context.detailedContext).toContain('step-1');
  });

  it('includes unmapped criteria section when acceptance criteria unmapped', () => {
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

    const context = checker.buildRepromptContext(validationResult);

    expect(context.detailedContext).toContain('Unmapped Acceptance Criteria');
    expect(context.detailedContext).toContain('not mapped to any implementing steps');
    expect(context.detailedContext).toContain('AC-1');
  });
});

// =============================================================================
// shouldReturnToStage2 Tests
// =============================================================================

describe('PlanCompletionChecker - shouldReturnToStage2', () => {
  let checker: PlanCompletionChecker;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
  });

  it('returns true when overall validation fails', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    expect(checker.shouldReturnToStage2(validationResult)).toBe(true);
  });

  it('returns false when overall validation passes', () => {
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

  it('returns true when meta section is invalid', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: false, errors: ['Error'] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    expect(checker.shouldReturnToStage2(validationResult)).toBe(true);
  });

  it('returns true when steps section is invalid', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: false, errors: ['Error'] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    expect(checker.shouldReturnToStage2(validationResult)).toBe(true);
  });

  it('returns true when dependencies section is invalid', () => {
    const validationResult: PlanValidationResult = {
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: false, errors: ['Circular'] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    };

    expect(checker.shouldReturnToStage2(validationResult)).toBe(true);
  });
});

// =============================================================================
// Integration with Storage Layer Tests
// =============================================================================

describe('PlanCompletionChecker - Storage Layer Integration', () => {
  let checker: PlanCompletionChecker;
  let tempDir: string;

  beforeEach(() => {
    checker = new PlanCompletionChecker();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-completion-storage-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reads and validates plan.json from filesystem', async () => {
    const plan = createValidPlan();
    const planPath = path.join(tempDir, 'plan.json');
    await fs.promises.writeFile(planPath, JSON.stringify(plan, null, 2));

    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.complete).toBe(true);
    expect(result.validationResult.overall).toBe(true);
  });

  it('returns missing context when plan.json does not exist', async () => {
    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan found');
  });

  it('handles invalid JSON in plan.json gracefully', async () => {
    const planPath = path.join(tempDir, 'plan.json');
    await fs.promises.writeFile(planPath, '{ invalid json }');

    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan found');
  });

  it('reads plan from plan/ directory structure', async () => {
    const planDir = path.join(tempDir, 'plan');
    const stepsDir = path.join(planDir, 'steps');
    await fs.promises.mkdir(stepsDir, { recursive: true });

    // Write meta.json
    await fs.promises.writeFile(
      path.join(planDir, 'meta.json'),
      JSON.stringify({
        version: '1.0.0',
        sessionId: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 1,
      })
    );

    // Write step file
    await fs.promises.writeFile(
      path.join(stepsDir, 'step-1.json'),
      JSON.stringify(createValidStep('step-1'))
    );

    // Write dependencies.json
    await fs.promises.writeFile(
      path.join(planDir, 'dependencies.json'),
      JSON.stringify({ stepDependencies: [], externalDependencies: [] })
    );

    // Write test-coverage.json
    await fs.promises.writeFile(
      path.join(planDir, 'test-coverage.json'),
      JSON.stringify({
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [{ stepId: 'step-1', requiredTestTypes: ['unit'] }],
      })
    );

    // Write acceptance-mapping.json
    await fs.promises.writeFile(
      path.join(planDir, 'acceptance-mapping.json'),
      JSON.stringify({
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Feature works',
          implementingStepIds: ['step-1'],
          isFullyCovered: true,
        }],
        updatedAt: '2024-01-15T10:00:00Z',
      })
    );

    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.validationResult.meta.valid).toBe(true);
    expect(result.validationResult.steps.valid).toBe(true);
  });

  it('handles missing plan/ directory gracefully', async () => {
    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan');
  });

  it('converts legacy plan format from filesystem', async () => {
    const legacyPlan = {
      sessionId: 'legacy-session',
      steps: [createValidStep('step-1')],
      isApproved: false,
      createdAt: '2024-01-15T10:00:00Z',
    };
    const planPath = path.join(tempDir, 'plan.json');
    await fs.promises.writeFile(planPath, JSON.stringify(legacyPlan));

    const result = await checker.checkPlanCompleteness(tempDir);

    // Legacy plan should be converted - steps should be valid
    expect(result.validationResult.steps.valid).toBe(true);
    // But other sections may not be complete after conversion
    expect(result.validationResult).toBeDefined();
  });

  it('legacy plan conversion reads from separate JSON files', async () => {
    // Create legacy plan.json (without embedded testCoverage, dependencies, acceptanceMapping)
    const legacyPlan = {
      sessionId: 'legacy-with-separate-files',
      steps: [createValidStep('step-1')],
      isApproved: false,
      createdAt: '2024-01-15T10:00:00Z',
    };
    const planPath = path.join(tempDir, 'plan.json');
    await fs.promises.writeFile(planPath, JSON.stringify(legacyPlan));

    // Create separate test-coverage.json with valid data
    await fs.promises.writeFile(
      path.join(tempDir, 'test-coverage.json'),
      JSON.stringify({
        framework: 'vitest',
        requiredTestTypes: ['unit', 'integration'],
        stepCoverage: [{ stepId: 'step-1', requiredTestTypes: ['unit'] }],
      })
    );

    // Create separate dependencies.json
    await fs.promises.writeFile(
      path.join(tempDir, 'dependencies.json'),
      JSON.stringify({
        stepDependencies: [],
        externalDependencies: [],
      })
    );

    // Create separate acceptance-mapping.json
    await fs.promises.writeFile(
      path.join(tempDir, 'acceptance-mapping.json'),
      JSON.stringify({
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Feature works',
          implementingStepIds: ['step-1'],
          isFullyCovered: true,
        }],
        updatedAt: '2024-01-15T10:00:00Z',
      })
    );

    const result = await checker.checkPlanCompleteness(tempDir);

    // Steps should be valid
    expect(result.validationResult.steps.valid).toBe(true);
    // Test coverage should be valid because it was read from separate file
    expect(result.validationResult.testCoverage.valid).toBe(true);
    // Dependencies should be valid
    expect(result.validationResult.dependencies.valid).toBe(true);
    // Acceptance mapping should be valid
    expect(result.validationResult.acceptanceMapping.valid).toBe(true);
  });

  it('reads multiple step files from steps/ directory', async () => {
    const planDir = path.join(tempDir, 'plan');
    const stepsDir = path.join(planDir, 'steps');
    await fs.promises.mkdir(stepsDir, { recursive: true });

    // Write meta.json
    await fs.promises.writeFile(
      path.join(planDir, 'meta.json'),
      JSON.stringify({
        version: '1.0.0',
        sessionId: 'test',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 1,
      })
    );

    // Write multiple step files
    await fs.promises.writeFile(
      path.join(stepsDir, '001-step-a.json'),
      JSON.stringify(createValidStep('step-a'))
    );
    await fs.promises.writeFile(
      path.join(stepsDir, '002-step-b.json'),
      JSON.stringify(createValidStep('step-b', { orderIndex: 1 }))
    );
    await fs.promises.writeFile(
      path.join(stepsDir, '003-step-c.json'),
      JSON.stringify(createValidStep('step-c', { orderIndex: 2 }))
    );

    // Write other required files
    await fs.promises.writeFile(
      path.join(planDir, 'dependencies.json'),
      JSON.stringify({ stepDependencies: [], externalDependencies: [] })
    );
    await fs.promises.writeFile(
      path.join(planDir, 'test-coverage.json'),
      JSON.stringify({
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [],
      })
    );
    await fs.promises.writeFile(
      path.join(planDir, 'acceptance-mapping.json'),
      JSON.stringify({
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Feature works',
          implementingStepIds: ['step-a'],
          isFullyCovered: true,
        }],
        updatedAt: '2024-01-15T10:00:00Z',
      })
    );

    const result = await checker.checkPlanCompleteness(tempDir);

    expect(result.validationResult.steps.valid).toBe(true);
  });

  it('handles non-existent session directory', async () => {
    const result = await checker.checkPlanCompleteness('/non/existent/path');

    expect(result.complete).toBe(false);
    expect(result.missingContext).toContain('No plan');
  });

  it('prefers plan.json over plan/ directory', async () => {
    // Create plan.json with valid plan
    const planJson = createValidPlan();
    const planPath = path.join(tempDir, 'plan.json');
    await fs.promises.writeFile(planPath, JSON.stringify(planJson));

    // Create plan/ directory with invalid data
    const planDir = path.join(tempDir, 'plan');
    await fs.promises.mkdir(planDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(planDir, 'meta.json'),
      JSON.stringify({ version: '' }) // Invalid
    );

    const result = await checker.checkPlanCompleteness(tempDir);

    // Should use plan.json (valid) not plan/ directory (invalid)
    expect(result.complete).toBe(true);
    expect(result.validationResult.overall).toBe(true);
  });
});

// =============================================================================
// Custom Validator Injection Tests
// =============================================================================

describe('PlanCompletionChecker - Custom Validator', () => {
  it('uses injected validator for validation', () => {
    const mockValidator = new PlanValidator();
    const validatePlanSpy = jest.spyOn(mockValidator, 'validatePlan');
    validatePlanSpy.mockReturnValue({
      meta: { valid: true, errors: [] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: true,
    });

    const customChecker = new PlanCompletionChecker(mockValidator);
    const result = customChecker.checkPlanCompletenessSync({});

    expect(validatePlanSpy).toHaveBeenCalled();
    expect(result.complete).toBe(true);
  });

  it('uses injected validator for context generation', () => {
    const mockValidator = new PlanValidator();
    const generateContextSpy = jest.spyOn(mockValidator, 'generateValidationContext');
    generateContextSpy.mockReturnValue('Custom validation context');

    jest.spyOn(mockValidator, 'validatePlan').mockReturnValue({
      meta: { valid: false, errors: ['Error'] },
      steps: { valid: true, errors: [] },
      dependencies: { valid: true, errors: [] },
      testCoverage: { valid: true, errors: [] },
      acceptanceMapping: { valid: true, errors: [] },
      overall: false,
    });

    const customChecker = new PlanCompletionChecker(mockValidator);
    const result = customChecker.checkPlanCompletenessSync({});

    expect(generateContextSpy).toHaveBeenCalled();
    expect(result.missingContext).toBe('Custom validation context');
  });
});

// =============================================================================
// Singleton Export Tests
// =============================================================================

describe('planCompletionChecker singleton', () => {
  it('exports a singleton instance', () => {
    expect(planCompletionChecker).toBeInstanceOf(PlanCompletionChecker);
  });

  it('has all public methods available', () => {
    expect(typeof planCompletionChecker.checkPlanCompleteness).toBe('function');
    expect(typeof planCompletionChecker.checkPlanCompletenessSync).toBe('function');
    expect(typeof planCompletionChecker.shouldReturnToStage2).toBe('function');
    expect(typeof planCompletionChecker.buildRepromptContext).toBe('function');
  });
});
