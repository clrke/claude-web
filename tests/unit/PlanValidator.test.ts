import {
  PlanValidator,
  planValidator,
  SectionValidationResult,
  PlanValidationResult,
  IncompleteSectionInfo,
} from '../../server/src/services/PlanValidator';
import { planMetaSchema, planStepSchema } from '../../server/src/validation/planSchema';

describe('PlanValidator', () => {
  let validator: PlanValidator;

  beforeEach(() => {
    validator = new PlanValidator();
  });

  // =========================================================================
  // validateSection Tests
  // =========================================================================

  describe('validateSection', () => {
    it('should return valid for correct data', () => {
      const validMeta = {
        version: '1.0.0',
        sessionId: 'session-123',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 0,
      };

      const result = validator.validateSection(validMeta, planMetaSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid data', () => {
      const invalidMeta = {
        version: '',
        sessionId: 'session-123',
        createdAt: 'not-a-date',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: -1,
      };

      const result = validator.validateSection(invalidMeta, planMetaSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should format error messages with paths', () => {
      const invalidStep = {
        id: 'step-1',
        parentId: null,
        orderIndex: 0,
        title: '',
        description: 'short',
        status: 'pending',
        metadata: {},
      };

      const result = validator.validateSection(invalidStep, planStepSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('title'))).toBe(true);
      expect(result.errors.some(e => e.includes('description'))).toBe(true);
    });
  });

  // =========================================================================
  // validateMeta Tests
  // =========================================================================

  describe('validateMeta', () => {
    it('should validate correct meta', () => {
      const meta = {
        version: '1.0.0',
        sessionId: 'session-123',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 1,
      };

      const result = validator.validateMeta(meta);
      expect(result.valid).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = validator.validateMeta({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid datetime', () => {
      const meta = {
        version: '1.0.0',
        sessionId: 'session-123',
        createdAt: 'invalid',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 0,
      };

      const result = validator.validateMeta(meta);
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // validateSteps Tests
  // =========================================================================

  describe('validateSteps', () => {
    const validStep = {
      id: 'step-1',
      parentId: null,
      orderIndex: 0,
      title: 'Create feature branch',
      description: 'Create and checkout a new feature branch from the main branch for implementation.',
      status: 'pending',
      metadata: {},
    };

    it('should validate correct steps', () => {
      const result = validator.validateSteps([validStep]);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array input', () => {
      const result = validator.validateSteps('not an array');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('array');
    });

    it('should reject empty steps array', () => {
      const result = validator.validateSteps([]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least one step');
    });

    it('should detect duplicate step IDs', () => {
      const steps = [
        { ...validStep, id: 'step-1' },
        { ...validStep, id: 'step-1', orderIndex: 1 },
      ];

      const result = validator.validateSteps(steps);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate step ID'))).toBe(true);
    });

    it('should detect orphaned parentIds', () => {
      const steps = [
        { ...validStep, id: 'step-1', parentId: 'step-999' },
      ];

      const result = validator.validateSteps(steps);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('orphaned parentId'))).toBe(true);
    });

    it('should validate valid parent-child relationships', () => {
      const steps = [
        { ...validStep, id: 'step-1', parentId: null },
        { ...validStep, id: 'step-2', parentId: 'step-1', orderIndex: 1 },
      ];

      const result = validator.validateSteps(steps);
      expect(result.valid).toBe(true);
    });

    it('should collect errors from multiple invalid steps', () => {
      const steps = [
        { ...validStep, id: 'step-1', title: '' },
        { ...validStep, id: 'step-2', description: 'too short', orderIndex: 1 },
      ];

      const result = validator.validateSteps(steps);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  // =========================================================================
  // validateStepsComplete Tests
  // =========================================================================

  describe('validateStepsComplete', () => {
    const validCompleteStep = {
      id: 'step-1',
      parentId: null,
      orderIndex: 0,
      title: 'Create feature branch',
      description: 'Create and checkout a new feature branch from the main branch for implementation.',
      status: 'pending',
      metadata: {},
      complexity: 'low',
    };

    it('should validate complete steps with complexity', () => {
      const result = validator.validateStepsComplete([validCompleteStep]);
      expect(result.valid).toBe(true);
    });

    it('should detect steps missing complexity', () => {
      const stepWithoutComplexity = { ...validCompleteStep };
      delete (stepWithoutComplexity as { complexity?: string }).complexity;

      const result = validator.validateStepsComplete([stepWithoutComplexity]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('complexity'))).toBe(true);
    });

    it('should list all steps missing complexity', () => {
      const steps = [
        { ...validCompleteStep, id: 'step-1', complexity: undefined },
        { ...validCompleteStep, id: 'step-2', complexity: undefined, orderIndex: 1 },
        { ...validCompleteStep, id: 'step-3', complexity: 'high', orderIndex: 2 },
      ];

      const result = validator.validateStepsComplete(steps);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('step-1'))).toBe(true);
      expect(result.errors.some(e => e.includes('step-2'))).toBe(true);
    });
  });

  // =========================================================================
  // validateDependencies Tests
  // =========================================================================

  describe('validateDependencies', () => {
    it('should validate correct dependencies', () => {
      const dependencies = {
        stepDependencies: [
          { stepId: 'step-2', dependsOn: 'step-1' },
        ],
        externalDependencies: [
          { name: 'zod', type: 'npm', reason: 'Validation', requiredBy: ['step-1'] },
        ],
      };

      const result = validator.validateDependencies(dependencies, ['step-1', 'step-2']);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid step references', () => {
      const dependencies = {
        stepDependencies: [
          { stepId: 'step-999', dependsOn: 'step-1' },
        ],
        externalDependencies: [],
      };

      const result = validator.validateDependencies(dependencies, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('step-999'))).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const dependencies = {
        stepDependencies: [
          { stepId: 'step-1', dependsOn: 'step-2' },
          { stepId: 'step-2', dependsOn: 'step-1' },
        ],
        externalDependencies: [],
      };

      const result = validator.validateDependencies(dependencies, ['step-1', 'step-2']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Circular dependency'))).toBe(true);
    });

    it('should validate empty dependencies', () => {
      const dependencies = {
        stepDependencies: [],
        externalDependencies: [],
      };

      const result = validator.validateDependencies(dependencies, ['step-1']);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // validateTestCoverage Tests
  // =========================================================================

  describe('validateTestCoverage', () => {
    it('should validate correct test coverage', () => {
      const testCoverage = {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [
          { stepId: 'step-1', requiredTestTypes: ['unit'] },
        ],
      };

      const result = validator.validateTestCoverage(testCoverage, ['step-1']);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid step references', () => {
      const testCoverage = {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [
          { stepId: 'step-999', requiredTestTypes: ['unit'] },
        ],
      };

      const result = validator.validateTestCoverage(testCoverage, ['step-1']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('step-999'))).toBe(true);
    });

    it('should reject missing framework', () => {
      const testCoverage = {
        framework: '',
        requiredTestTypes: ['unit'],
        stepCoverage: [],
      };

      const result = validator.validateTestCoverage(testCoverage, []);
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // validateAcceptanceMapping Tests
  // =========================================================================

  describe('validateAcceptanceMapping', () => {
    it('should validate correct acceptance mapping', () => {
      const mapping = {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-1'],
            isFullyCovered: true,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      };

      const result = validator.validateAcceptanceMapping(mapping, ['step-1']);
      expect(result.valid).toBe(true);
    });

    it('should reject criterion with no implementing steps', () => {
      const mapping = {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: [],
            isFullyCovered: false,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      };

      const result = validator.validateAcceptanceMapping(mapping, ['step-1']);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid step references', () => {
      const mapping = {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works',
            implementingStepIds: ['step-999'],
            isFullyCovered: true,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      };

      const result = validator.validateAcceptanceMapping(mapping, ['step-1']);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('step-999'))).toBe(true);
    });
  });

  // =========================================================================
  // validatePlan Tests
  // =========================================================================

  describe('validatePlan', () => {
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
          status: 'pending',
          metadata: {},
        },
      ],
      dependencies: {
        stepDependencies: [],
        externalDependencies: [],
      },
      testCoverage: {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [],
      },
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
      validationStatus: {
        meta: true,
        steps: true,
        dependencies: true,
        testCoverage: true,
        acceptanceMapping: true,
        overall: true,
      },
    };

    it('should validate a complete valid plan', () => {
      const result = validator.validatePlan(validPlan);
      expect(result.overall).toBe(true);
      expect(result.meta.valid).toBe(true);
      expect(result.steps.valid).toBe(true);
      expect(result.dependencies.valid).toBe(true);
      expect(result.testCoverage.valid).toBe(true);
      expect(result.acceptanceMapping.valid).toBe(true);
    });

    it('should return per-section results for invalid plan', () => {
      const invalidPlan = {
        ...validPlan,
        meta: { ...validPlan.meta, version: '' },
        steps: [],
      };

      const result = validator.validatePlan(invalidPlan);
      expect(result.overall).toBe(false);
      expect(result.meta.valid).toBe(false);
      expect(result.steps.valid).toBe(false);
    });

    it('should handle null/undefined plan', () => {
      const result = validator.validatePlan(null);
      expect(result.overall).toBe(false);
    });

    it('should cross-validate dependencies against steps', () => {
      const planWithBadDeps = {
        ...validPlan,
        dependencies: {
          stepDependencies: [{ stepId: 'step-999', dependsOn: 'step-1' }],
          externalDependencies: [],
        },
      };

      const result = validator.validatePlan(planWithBadDeps);
      expect(result.dependencies.valid).toBe(false);
    });
  });

  // =========================================================================
  // getIncompleteSections Tests
  // =========================================================================

  describe('getIncompleteSections', () => {
    it('should return empty array for valid plan', () => {
      const validPlan = {
        meta: {
          version: '1.0.0',
          sessionId: 'session-123',
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          isApproved: false,
          reviewCount: 0,
        },
        steps: [
          {
            id: 'step-1',
            parentId: null,
            orderIndex: 0,
            title: 'Create feature branch',
            description: 'Create and checkout a new feature branch from the main branch for implementation.',
            status: 'pending',
            metadata: {},
          },
        ],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: 'vitest', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: {
          mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }],
          updatedAt: '2024-01-15T10:00:00Z',
        },
        validationStatus: { meta: true, steps: true, dependencies: true, testCoverage: true, acceptanceMapping: true, overall: true },
      };

      const result = validator.getIncompleteSections(validPlan);
      expect(result).toHaveLength(0);
    });

    it('should return incomplete sections with errors', () => {
      const invalidPlan = {
        meta: { version: '', sessionId: '', createdAt: 'bad', updatedAt: 'bad', isApproved: false, reviewCount: 0 },
        steps: [],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: '', requiredTestTypes: [], stepCoverage: [] },
        acceptanceMapping: { mappings: [], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: false, steps: false, dependencies: false, testCoverage: false, acceptanceMapping: false, overall: false },
      };

      const result = validator.getIncompleteSections(invalidPlan);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(s => s.section === 'meta')).toBe(true);
      expect(result.some(s => s.section === 'steps')).toBe(true);
    });

    it('should include missing fields information', () => {
      const planWithMissingFields = {
        meta: { version: '', sessionId: 'session-123', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', isApproved: false, reviewCount: 0 },
        steps: [{ id: 'step-1', parentId: null, orderIndex: 0, title: 'Test', description: 'A valid description that is long enough to pass validation.', status: 'pending', metadata: {} }],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: 'vitest', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: { mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: false, steps: true, dependencies: true, testCoverage: true, acceptanceMapping: true, overall: false },
      };

      const result = validator.getIncompleteSections(planWithMissingFields);
      const metaSection = result.find(s => s.section === 'meta');
      expect(metaSection).toBeDefined();
      expect(metaSection!.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // generateValidationContext Tests
  // =========================================================================

  describe('generateValidationContext', () => {
    it('should return empty string for valid plan', () => {
      const validPlan = {
        meta: { version: '1.0.0', sessionId: 'session-123', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', isApproved: false, reviewCount: 0 },
        steps: [{ id: 'step-1', parentId: null, orderIndex: 0, title: 'Test', description: 'A valid description that is long enough to pass validation check.', status: 'pending', metadata: {} }],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: 'vitest', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: { mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: true, steps: true, dependencies: true, testCoverage: true, acceptanceMapping: true, overall: true },
      };

      const context = validator.generateValidationContext(validPlan);
      expect(context).toBe('');
    });

    it('should generate human-readable context for invalid plan', () => {
      const invalidPlan = {
        meta: { version: '', sessionId: '', createdAt: 'bad', updatedAt: 'bad', isApproved: false, reviewCount: 0 },
        steps: [],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: '', requiredTestTypes: [], stepCoverage: [] },
        acceptanceMapping: { mappings: [], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: false, steps: false, dependencies: false, testCoverage: false, acceptanceMapping: false, overall: false },
      };

      const context = validator.generateValidationContext(invalidPlan);
      expect(context).toContain('Plan Validation Issues');
      expect(context).toContain('Plan Metadata');
      expect(context).toContain('Plan Steps');
    });

    it('should include guidance for common issues', () => {
      const planWithPlaceholders = {
        meta: { version: '1.0.0', sessionId: 'session-123', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', isApproved: false, reviewCount: 0 },
        steps: [{ id: 'step-1', parentId: null, orderIndex: 0, title: 'TBD Step', description: 'A valid description that is long enough to pass validation check.', status: 'pending', metadata: {} }],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: 'vitest', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: { mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: true, steps: false, dependencies: true, testCoverage: true, acceptanceMapping: true, overall: false },
      };

      const context = validator.generateValidationContext(planWithPlaceholders);
      expect(context).toContain('placeholder');
    });

    it('should include framework guidance', () => {
      const planWithMissingFramework = {
        meta: { version: '1.0.0', sessionId: 'session-123', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', isApproved: false, reviewCount: 0 },
        steps: [{ id: 'step-1', parentId: null, orderIndex: 0, title: 'Test', description: 'A valid description that is long enough to pass validation check.', status: 'pending', metadata: {} }],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: '', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: { mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: true, steps: true, dependencies: true, testCoverage: false, acceptanceMapping: true, overall: false },
      };

      const context = validator.generateValidationContext(planWithMissingFramework);
      expect(context).toContain('framework');
    });
  });

  // =========================================================================
  // createValidationStatus Tests
  // =========================================================================

  describe('createValidationStatus', () => {
    it('should create status from validation result', () => {
      const validationResult: PlanValidationResult = {
        meta: { valid: true, errors: [] },
        steps: { valid: false, errors: ['Step 1: description too short'] },
        dependencies: { valid: true, errors: [] },
        testCoverage: { valid: true, errors: [] },
        acceptanceMapping: { valid: true, errors: [] },
        overall: false,
      };

      const status = validator.createValidationStatus(validationResult);
      expect(status.meta).toBe(true);
      expect(status.steps).toBe(false);
      expect(status.overall).toBe(false);
      expect(status.errors?.steps).toContain('Step 1: description too short');
    });

    it('should not include errors key when all valid', () => {
      const validationResult: PlanValidationResult = {
        meta: { valid: true, errors: [] },
        steps: { valid: true, errors: [] },
        dependencies: { valid: true, errors: [] },
        testCoverage: { valid: true, errors: [] },
        acceptanceMapping: { valid: true, errors: [] },
        overall: true,
      };

      const status = validator.createValidationStatus(validationResult);
      expect(status.overall).toBe(true);
      expect(status.errors).toBeUndefined();
    });
  });

  // =========================================================================
  // isPlanValid Tests
  // =========================================================================

  describe('isPlanValid', () => {
    it('should return true for valid plan', () => {
      const validPlan = {
        meta: { version: '1.0.0', sessionId: 'session-123', createdAt: '2024-01-15T10:00:00Z', updatedAt: '2024-01-15T10:00:00Z', isApproved: false, reviewCount: 0 },
        steps: [{ id: 'step-1', parentId: null, orderIndex: 0, title: 'Test', description: 'A valid description that is long enough to pass validation check.', status: 'pending', metadata: {} }],
        dependencies: { stepDependencies: [], externalDependencies: [] },
        testCoverage: { framework: 'vitest', requiredTestTypes: ['unit'], stepCoverage: [] },
        acceptanceMapping: { mappings: [{ criterionId: 'ac-1', criterionText: 'Test', implementingStepIds: ['step-1'], isFullyCovered: true }], updatedAt: '2024-01-15T10:00:00Z' },
        validationStatus: { meta: true, steps: true, dependencies: true, testCoverage: true, acceptanceMapping: true, overall: true },
      };

      expect(validator.isPlanValid(validPlan)).toBe(true);
    });

    it('should return false for invalid plan', () => {
      expect(validator.isPlanValid({})).toBe(false);
      expect(validator.isPlanValid(null)).toBe(false);
    });
  });

  // =========================================================================
  // Singleton Export Test
  // =========================================================================

  describe('planValidator singleton', () => {
    it('should export a singleton instance', () => {
      expect(planValidator).toBeInstanceOf(PlanValidator);
    });

    it('should have all methods available', () => {
      expect(typeof planValidator.validateSection).toBe('function');
      expect(typeof planValidator.validatePlan).toBe('function');
      expect(typeof planValidator.getIncompleteSections).toBe('function');
      expect(typeof planValidator.generateValidationContext).toBe('function');
    });
  });
});
