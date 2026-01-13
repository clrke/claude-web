import {
  planMetaSchema,
  planStepSchema,
  planStepCompleteSchema,
  stepComplexitySchema,
  planDependenciesSchema,
  planTestCoverageSchema,
  planAcceptanceMappingSchema,
  composablePlanSchema,
  newStepsInputSchema,
  newDependenciesInputSchema,
  newTestCoverageInputSchema,
  newAcceptanceMappingInputSchema,
  validateDependenciesAgainstSteps,
  validateTestCoverageAgainstSteps,
  validateAcceptanceMappingAgainstSteps,
  containsPlaceholder,
  containsMarkerPattern,
  hasCircularDependencies,
} from '../../server/src/validation/planSchema';

describe('Plan Schema Validation', () => {
  // =========================================================================
  // Helper Functions Tests
  // =========================================================================

  describe('containsPlaceholder', () => {
    it('should detect TBD placeholder', () => {
      expect(containsPlaceholder('This is TBD')).toBe(true);
      expect(containsPlaceholder('TBD')).toBe(true);
      expect(containsPlaceholder('tbd later')).toBe(true);
    });

    it('should detect TODO placeholder', () => {
      expect(containsPlaceholder('TODO: implement this')).toBe(true);
      expect(containsPlaceholder('This is a todo item')).toBe(true);
    });

    it('should detect FIXME placeholder', () => {
      expect(containsPlaceholder('FIXME: broken')).toBe(true);
    });

    it('should detect other placeholder patterns', () => {
      expect(containsPlaceholder('This needs to be filled')).toBe(true);
      expect(containsPlaceholder('To be determined later')).toBe(true);
      expect(containsPlaceholder('[...]')).toBe(true);
      expect(containsPlaceholder('<...>')).toBe(true);
      expect(containsPlaceholder('PLACEHOLDER text')).toBe(true);
    });

    it('should not flag normal text', () => {
      expect(containsPlaceholder('Create the authentication flow')).toBe(false);
      expect(containsPlaceholder('Implement user login with JWT tokens')).toBe(false);
    });
  });

  describe('containsMarkerPattern', () => {
    it('should detect DECISION_NEEDED markers', () => {
      expect(containsMarkerPattern('[DECISION_NEEDED]')).toBe(true);
      expect(containsMarkerPattern('[DECISION_NEEDED priority="1"]')).toBe(true);
      expect(containsMarkerPattern('[/DECISION_NEEDED]')).toBe(true);
    });

    it('should detect PLAN_STEP markers', () => {
      expect(containsMarkerPattern('[PLAN_STEP id="step-1"]')).toBe(true);
      expect(containsMarkerPattern('[/PLAN_STEP]')).toBe(true);
    });

    it('should detect other marker patterns', () => {
      expect(containsMarkerPattern('[STEP_COMPLETE id="1"]')).toBe(true);
      expect(containsMarkerPattern('[IMPLEMENTATION_COMPLETE]')).toBe(true);
      expect(containsMarkerPattern('[RETURN_TO_STAGE_2]')).toBe(true);
    });

    it('should not flag normal brackets', () => {
      expect(containsMarkerPattern('This is [normal] text')).toBe(false);
      expect(containsMarkerPattern('Array [0] access')).toBe(false);
    });
  });

  describe('hasCircularDependencies', () => {
    it('should detect simple circular dependency', () => {
      const deps = [
        { stepId: 'step-1', dependsOn: 'step-2' },
        { stepId: 'step-2', dependsOn: 'step-1' },
      ];
      const result = hasCircularDependencies(deps);
      expect(result.hasCycle).toBe(true);
      expect(result.cycle).toBeDefined();
    });

    it('should detect longer circular dependency chain', () => {
      const deps = [
        { stepId: 'step-1', dependsOn: 'step-2' },
        { stepId: 'step-2', dependsOn: 'step-3' },
        { stepId: 'step-3', dependsOn: 'step-1' },
      ];
      const result = hasCircularDependencies(deps);
      expect(result.hasCycle).toBe(true);
    });

    it('should not flag valid DAG', () => {
      const deps = [
        { stepId: 'step-2', dependsOn: 'step-1' },
        { stepId: 'step-3', dependsOn: 'step-1' },
        { stepId: 'step-4', dependsOn: 'step-2' },
        { stepId: 'step-4', dependsOn: 'step-3' },
      ];
      const result = hasCircularDependencies(deps);
      expect(result.hasCycle).toBe(false);
    });

    it('should handle empty dependencies', () => {
      const result = hasCircularDependencies([]);
      expect(result.hasCycle).toBe(false);
    });
  });

  // =========================================================================
  // Plan Meta Schema Tests
  // =========================================================================

  describe('planMetaSchema', () => {
    const validMeta = {
      version: '1.0.0',
      sessionId: 'session-123',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      isApproved: false,
      reviewCount: 0,
    };

    it('should accept valid meta', () => {
      const result = planMetaSchema.safeParse(validMeta);
      expect(result.success).toBe(true);
    });

    it('should reject missing version', () => {
      const result = planMetaSchema.safeParse({ ...validMeta, version: '' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime format', () => {
      const result = planMetaSchema.safeParse({ ...validMeta, createdAt: 'invalid-date' });
      expect(result.success).toBe(false);
    });

    it('should reject negative review count', () => {
      const result = planMetaSchema.safeParse({ ...validMeta, reviewCount: -1 });
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // Plan Step Schema Tests
  // =========================================================================

  describe('planStepSchema', () => {
    const validStep = {
      id: 'step-1',
      parentId: null,
      orderIndex: 0,
      title: 'Create feature branch',
      description: 'Create and checkout a new feature branch from the main branch for implementing the new feature.',
      status: 'pending',
      metadata: {},
    };

    it('should accept valid step', () => {
      const result = planStepSchema.safeParse(validStep);
      expect(result.success).toBe(true);
    });

    it('should accept step with complexity', () => {
      const result = planStepSchema.safeParse({ ...validStep, complexity: 'medium' });
      expect(result.success).toBe(true);
    });

    it('should reject short description', () => {
      const result = planStepSchema.safeParse({ ...validStep, description: 'Too short' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 50 characters');
      }
    });

    it('should reject placeholder in title', () => {
      const result = planStepSchema.safeParse({ ...validStep, title: 'TBD - needs title' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('placeholder');
      }
    });

    it('should reject placeholder in description', () => {
      const result = planStepSchema.safeParse({
        ...validStep,
        description: 'This needs to be filled later with more details about implementation TODO.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject marker patterns in title', () => {
      const result = planStepSchema.safeParse({
        ...validStep,
        title: 'Step with [DECISION_NEEDED] marker',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('marker patterns');
      }
    });

    it('should reject marker patterns in description', () => {
      const result = planStepSchema.safeParse({
        ...validStep,
        description: 'This description contains [PLAN_STEP id="bad"] which should not be allowed in step content.',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid status values', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked', 'skipped', 'needs_review'];
      for (const status of statuses) {
        const result = planStepSchema.safeParse({ ...validStep, status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = planStepSchema.safeParse({ ...validStep, status: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('planStepCompleteSchema', () => {
    const validStep = {
      id: 'step-1',
      parentId: null,
      orderIndex: 0,
      title: 'Create feature branch',
      description: 'Create and checkout a new feature branch from the main branch for implementing the new feature.',
      status: 'pending',
      metadata: {},
      complexity: 'low',
    };

    it('should accept complete step with complexity', () => {
      const result = planStepCompleteSchema.safeParse(validStep);
      expect(result.success).toBe(true);
    });

    it('should reject step without complexity', () => {
      const { complexity: _, ...stepWithoutComplexity } = validStep;
      const result = planStepCompleteSchema.safeParse(stepWithoutComplexity);
      expect(result.success).toBe(false);
    });
  });

  describe('stepComplexitySchema', () => {
    it('should accept valid complexity values', () => {
      expect(stepComplexitySchema.safeParse('low').success).toBe(true);
      expect(stepComplexitySchema.safeParse('medium').success).toBe(true);
      expect(stepComplexitySchema.safeParse('high').success).toBe(true);
    });

    it('should reject invalid complexity', () => {
      expect(stepComplexitySchema.safeParse('very-high').success).toBe(false);
      expect(stepComplexitySchema.safeParse('').success).toBe(false);
    });
  });

  // =========================================================================
  // Plan Dependencies Schema Tests
  // =========================================================================

  describe('planDependenciesSchema', () => {
    const validDependencies = {
      stepDependencies: [
        { stepId: 'step-2', dependsOn: 'step-1' },
      ],
      externalDependencies: [
        { name: 'zod', type: 'npm', reason: 'Schema validation', requiredBy: ['step-3'] },
      ],
    };

    it('should accept valid dependencies', () => {
      const result = planDependenciesSchema.safeParse(validDependencies);
      expect(result.success).toBe(true);
    });

    it('should accept empty dependencies', () => {
      const result = planDependenciesSchema.safeParse({
        stepDependencies: [],
        externalDependencies: [],
      });
      expect(result.success).toBe(true);
    });

    it('should reject circular dependencies', () => {
      const circular = {
        stepDependencies: [
          { stepId: 'step-1', dependsOn: 'step-2' },
          { stepId: 'step-2', dependsOn: 'step-1' },
        ],
        externalDependencies: [],
      };
      const result = planDependenciesSchema.safeParse(circular);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Circular dependency');
      }
    });

    it('should require reason for external dependencies', () => {
      const result = planDependenciesSchema.safeParse({
        stepDependencies: [],
        externalDependencies: [
          { name: 'lodash', type: 'npm', reason: '', requiredBy: ['step-1'] },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('should require at least one step for external dependency', () => {
      const result = planDependenciesSchema.safeParse({
        stepDependencies: [],
        externalDependencies: [
          { name: 'lodash', type: 'npm', reason: 'Utilities', requiredBy: [] },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid dependency types', () => {
      const types = ['npm', 'api', 'service', 'file', 'other'];
      for (const type of types) {
        const result = planDependenciesSchema.safeParse({
          stepDependencies: [],
          externalDependencies: [
            { name: 'test', type, reason: 'Test reason', requiredBy: ['step-1'] },
          ],
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('validateDependenciesAgainstSteps', () => {
    it('should validate references to existing steps', () => {
      const deps = {
        stepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
        externalDependencies: [{ name: 'zod', type: 'npm' as const, reason: 'Validation', requiredBy: ['step-3'] }],
      };
      const result = validateDependenciesAgainstSteps(deps, ['step-1', 'step-2', 'step-3']);
      expect(result.valid).toBe(true);
    });

    it('should detect orphaned step references', () => {
      const deps = {
        stepDependencies: [{ stepId: 'step-999', dependsOn: 'step-1' }],
        externalDependencies: [],
      };
      const result = validateDependenciesAgainstSteps(deps, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('step-999');
    });

    it('should detect orphaned dependency references', () => {
      const deps = {
        stepDependencies: [{ stepId: 'step-2', dependsOn: 'step-999' }],
        externalDependencies: [],
      };
      const result = validateDependenciesAgainstSteps(deps, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('step-999');
    });
  });

  // =========================================================================
  // Plan Test Coverage Schema Tests
  // =========================================================================

  describe('planTestCoverageSchema', () => {
    const validTestCoverage = {
      framework: 'vitest',
      requiredTestTypes: ['unit'],
      stepCoverage: [
        { stepId: 'step-3', requiredTestTypes: ['unit', 'integration'] },
      ],
    };

    it('should accept valid test coverage', () => {
      const result = planTestCoverageSchema.safeParse(validTestCoverage);
      expect(result.success).toBe(true);
    });

    it('should accept test coverage with global target', () => {
      const result = planTestCoverageSchema.safeParse({
        ...validTestCoverage,
        globalCoverageTarget: 80,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty framework', () => {
      const result = planTestCoverageSchema.safeParse({
        ...validTestCoverage,
        framework: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty required test types', () => {
      const result = planTestCoverageSchema.safeParse({
        ...validTestCoverage,
        requiredTestTypes: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject coverage target over 100', () => {
      const result = planTestCoverageSchema.safeParse({
        ...validTestCoverage,
        globalCoverageTarget: 150,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative coverage target', () => {
      const result = planTestCoverageSchema.safeParse({
        ...validTestCoverage,
        globalCoverageTarget: -10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateTestCoverageAgainstSteps', () => {
    it('should validate coverage references to existing steps', () => {
      const coverage = {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [{ stepId: 'step-3', requiredTestTypes: ['unit'] }],
      };
      const result = validateTestCoverageAgainstSteps(coverage, ['step-1', 'step-2', 'step-3']);
      expect(result.valid).toBe(true);
    });

    it('should detect invalid step references', () => {
      const coverage = {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [{ stepId: 'step-999', requiredTestTypes: ['unit'] }],
      };
      const result = validateTestCoverageAgainstSteps(coverage, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('step-999');
    });
  });

  // =========================================================================
  // Plan Acceptance Mapping Schema Tests
  // =========================================================================

  describe('planAcceptanceMappingSchema', () => {
    const validMapping = {
      mappings: [
        {
          criterionId: 'ac-1',
          criterionText: 'Feature works correctly',
          implementingStepIds: ['step-3', 'step-4'],
          isFullyCovered: true,
        },
      ],
      updatedAt: '2024-01-15T10:00:00Z',
    };

    it('should accept valid acceptance mapping', () => {
      const result = planAcceptanceMappingSchema.safeParse(validMapping);
      expect(result.success).toBe(true);
    });

    it('should reject criterion with no implementing steps', () => {
      const result = planAcceptanceMappingSchema.safeParse({
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: [],
            isFullyCovered: false,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('no implementing steps');
      }
    });

    it('should reject invalid datetime', () => {
      const result = planAcceptanceMappingSchema.safeParse({
        ...validMapping,
        updatedAt: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateAcceptanceMappingAgainstSteps', () => {
    it('should validate mapping references to existing steps', () => {
      const mapping = {
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Test',
          implementingStepIds: ['step-1', 'step-2'],
          isFullyCovered: true,
        }],
        updatedAt: '2024-01-15T10:00:00Z',
      };
      const result = validateAcceptanceMappingAgainstSteps(mapping, ['step-1', 'step-2', 'step-3']);
      expect(result.valid).toBe(true);
    });

    it('should detect invalid step references', () => {
      const mapping = {
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Test',
          implementingStepIds: ['step-1', 'step-999'],
          isFullyCovered: true,
        }],
        updatedAt: '2024-01-15T10:00:00Z',
      };
      const result = validateAcceptanceMappingAgainstSteps(mapping, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('step-999');
    });
  });

  // =========================================================================
  // Composable Plan Schema Tests
  // =========================================================================

  describe('composablePlanSchema', () => {
    const validPlan = {
      meta: {
        version: '1.0.0',
        sessionId: 'session-123',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 1,
      },
      steps: [
        {
          id: 'step-1',
          parentId: null,
          orderIndex: 0,
          title: 'Create feature branch',
          description: 'Create and checkout a new feature branch from the main branch for implementation.',
          status: 'completed',
          metadata: {},
          complexity: 'low',
        },
        {
          id: 'step-2',
          parentId: 'step-1',
          orderIndex: 1,
          title: 'Implement core logic',
          description: 'Implement the core business logic for the feature with proper error handling and validation.',
          status: 'pending',
          metadata: {},
          complexity: 'medium',
        },
      ],
      dependencies: {
        stepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
        externalDependencies: [],
      },
      testCoverage: {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [{ stepId: 'step-2', requiredTestTypes: ['unit'] }],
      },
      acceptanceMapping: {
        mappings: [{
          criterionId: 'ac-1',
          criterionText: 'Feature works correctly',
          implementingStepIds: ['step-2'],
          isFullyCovered: true,
        }],
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
    };

    it('should accept valid composable plan', () => {
      const result = composablePlanSchema.safeParse(validPlan);
      expect(result.success).toBe(true);
    });

    it('should reject plan with no steps', () => {
      const result = composablePlanSchema.safeParse({
        ...validPlan,
        steps: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject plan with orphaned parentId', () => {
      const planWithOrphan = {
        ...validPlan,
        steps: [
          {
            id: 'step-1',
            parentId: 'step-999', // Orphaned!
            orderIndex: 0,
            title: 'Create feature branch',
            description: 'Create and checkout a new feature branch from the main branch for implementation.',
            status: 'pending',
            metadata: {},
          },
        ],
      };
      const result = composablePlanSchema.safeParse(planWithOrphan);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('orphaned parentId'))).toBe(true);
      }
    });

    it('should reject plan with invalid dependency references', () => {
      const planWithBadDeps = {
        ...validPlan,
        dependencies: {
          stepDependencies: [{ stepId: 'step-999', dependsOn: 'step-1' }],
          externalDependencies: [],
        },
      };
      const result = composablePlanSchema.safeParse(planWithBadDeps);
      expect(result.success).toBe(false);
    });

    it('should reject plan with invalid test coverage references', () => {
      const planWithBadCoverage = {
        ...validPlan,
        testCoverage: {
          framework: 'vitest',
          requiredTestTypes: ['unit'],
          stepCoverage: [{ stepId: 'step-999', requiredTestTypes: ['unit'] }],
        },
      };
      const result = composablePlanSchema.safeParse(planWithBadCoverage);
      expect(result.success).toBe(false);
    });

    it('should reject plan with invalid acceptance mapping references', () => {
      const planWithBadMapping = {
        ...validPlan,
        acceptanceMapping: {
          mappings: [{
            criterionId: 'ac-1',
            criterionText: 'Test',
            implementingStepIds: ['step-999'],
            isFullyCovered: true,
          }],
          updatedAt: '2024-01-15T10:00:00Z',
        },
      };
      const result = composablePlanSchema.safeParse(planWithBadMapping);
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // New*Input Schema Tests
  // =========================================================================

  describe('newStepsInputSchema', () => {
    it('should accept valid new steps input', () => {
      const result = newStepsInputSchema.safeParse({
        steps: [
          {
            id: 'step-1',
            parentId: null,
            orderIndex: 0,
            title: 'New step',
            description: 'A new step with sufficient description that is at least fifty characters long.',
            metadata: {},
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept input with removeStepIds', () => {
      const result = newStepsInputSchema.safeParse({
        steps: [],
        removeStepIds: ['step-old-1', 'step-old-2'],
      });
      expect(result.success).toBe(true);
    });

    it('should not require status field', () => {
      const result = newStepsInputSchema.safeParse({
        steps: [
          {
            id: 'step-1',
            parentId: null,
            orderIndex: 0,
            title: 'Step without status',
            description: 'Steps in new-steps.json should not require status since server sets it.',
            metadata: {},
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('newDependenciesInputSchema', () => {
    it('should accept valid dependencies input', () => {
      const result = newDependenciesInputSchema.safeParse({
        addStepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
        addExternalDependencies: [
          { name: 'zod', type: 'npm', reason: 'Validation', requiredBy: ['step-1'] },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept removal operations', () => {
      const result = newDependenciesInputSchema.safeParse({
        removeStepDependencies: [{ stepId: 'step-2', dependsOn: 'step-1' }],
        removeExternalDependencies: ['lodash'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty input', () => {
      const result = newDependenciesInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('newTestCoverageInputSchema', () => {
    it('should accept valid test coverage input', () => {
      const result = newTestCoverageInputSchema.safeParse({
        framework: 'jest',
        requiredTestTypes: ['unit', 'integration'],
        globalCoverageTarget: 80,
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial updates', () => {
      const result = newTestCoverageInputSchema.safeParse({
        globalCoverageTarget: 90,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty input', () => {
      const result = newTestCoverageInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('newAcceptanceMappingInputSchema', () => {
    it('should accept valid acceptance mapping input', () => {
      const result = newAcceptanceMappingInputSchema.safeParse({
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-1'],
            isFullyCovered: true,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject input without mappings', () => {
      const result = newAcceptanceMappingInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
