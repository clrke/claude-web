import type {
  StepComplexity,
  PlanStep,
  PlanMeta,
  StepDependency,
  ExternalDependency,
  PlanDependencies,
  StepTestCoverage,
  PlanTestCoverage,
  AcceptanceCriteriaStepMapping,
  PlanAcceptanceCriteriaMapping,
  PlanValidationStatus,
  ComposablePlan,
  NewStepsInput,
  NewDependenciesInput,
  NewTestCoverageInput,
  NewAcceptanceMappingInput,
} from '../../shared/types/plan';

describe('Composable Plan Types', () => {
  describe('StepComplexity', () => {
    it('should allow valid complexity values', () => {
      const low: StepComplexity = 'low';
      const medium: StepComplexity = 'medium';
      const high: StepComplexity = 'high';

      expect(low).toBe('low');
      expect(medium).toBe('medium');
      expect(high).toBe('high');
    });
  });

  describe('PlanStep', () => {
    it('should create a valid PlanStep with all fields', () => {
      const step: PlanStep = {
        id: 'step-1',
        parentId: null,
        orderIndex: 0,
        title: 'Create feature branch',
        description: 'Create and checkout feature branch from main',
        status: 'pending',
        metadata: {},
        contentHash: null,
        complexity: 'low',
        acceptanceCriteriaIds: ['ac-1', 'ac-2'],
        estimatedFiles: ['src/index.ts', 'src/utils.ts'],
      };

      expect(step.id).toBe('step-1');
      expect(step.complexity).toBe('low');
      expect(step.acceptanceCriteriaIds).toEqual(['ac-1', 'ac-2']);
      expect(step.estimatedFiles).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should allow PlanStep without optional fields', () => {
      const step: PlanStep = {
        id: 'step-1',
        parentId: null,
        orderIndex: 0,
        title: 'Create feature branch',
        description: 'Create and checkout feature branch from main',
        status: 'pending',
        metadata: {},
      };

      expect(step.complexity).toBeUndefined();
      expect(step.acceptanceCriteriaIds).toBeUndefined();
      expect(step.estimatedFiles).toBeUndefined();
    });

    it('should allow all valid status values', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked', 'skipped', 'needs_review'] as const;
      statuses.forEach((status) => {
        const step: PlanStep = {
          id: 'step-1',
          parentId: null,
          orderIndex: 0,
          title: 'Test step',
          description: 'Test description',
          status,
          metadata: {},
        };
        expect(step.status).toBe(status);
      });
    });
  });

  describe('PlanMeta', () => {
    it('should create a valid PlanMeta', () => {
      const meta: PlanMeta = {
        version: '1.0.0',
        sessionId: 'session-123',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        isApproved: false,
        reviewCount: 0,
      };

      expect(meta.version).toBe('1.0.0');
      expect(meta.sessionId).toBe('session-123');
      expect(meta.isApproved).toBe(false);
      expect(meta.reviewCount).toBe(0);
    });
  });

  describe('PlanDependencies', () => {
    it('should create valid step dependencies', () => {
      const stepDep: StepDependency = {
        stepId: 'step-2',
        dependsOn: 'step-1',
        reason: 'Step 2 requires step 1 to be complete',
      };

      expect(stepDep.stepId).toBe('step-2');
      expect(stepDep.dependsOn).toBe('step-1');
    });

    it('should create valid external dependencies', () => {
      const extDep: ExternalDependency = {
        name: 'zod',
        type: 'npm',
        version: '^3.22.0',
        reason: 'Schema validation',
        requiredBy: ['step-3', 'step-4'],
      };

      expect(extDep.name).toBe('zod');
      expect(extDep.type).toBe('npm');
      expect(extDep.requiredBy).toEqual(['step-3', 'step-4']);
    });

    it('should allow all external dependency types', () => {
      const types = ['npm', 'api', 'service', 'file', 'other'] as const;
      types.forEach((type) => {
        const dep: ExternalDependency = {
          name: 'test',
          type,
          reason: 'Test reason',
          requiredBy: ['step-1'],
        };
        expect(dep.type).toBe(type);
      });
    });

    it('should create valid PlanDependencies', () => {
      const deps: PlanDependencies = {
        stepDependencies: [
          { stepId: 'step-2', dependsOn: 'step-1' },
        ],
        externalDependencies: [
          { name: 'zod', type: 'npm', reason: 'Validation', requiredBy: ['step-1'] },
        ],
      };

      expect(deps.stepDependencies).toHaveLength(1);
      expect(deps.externalDependencies).toHaveLength(1);
    });
  });

  describe('PlanTestCoverage', () => {
    it('should create valid step test coverage', () => {
      const stepCoverage: StepTestCoverage = {
        stepId: 'step-5',
        requiredTestTypes: ['unit', 'integration'],
        coverageTarget: 80,
        testCases: ['Should validate input', 'Should handle errors'],
      };

      expect(stepCoverage.stepId).toBe('step-5');
      expect(stepCoverage.requiredTestTypes).toContain('unit');
      expect(stepCoverage.coverageTarget).toBe(80);
    });

    it('should create valid PlanTestCoverage', () => {
      const coverage: PlanTestCoverage = {
        framework: 'vitest',
        requiredTestTypes: ['unit'],
        stepCoverage: [
          { stepId: 'step-1', requiredTestTypes: ['unit'] },
        ],
        globalCoverageTarget: 70,
      };

      expect(coverage.framework).toBe('vitest');
      expect(coverage.globalCoverageTarget).toBe(70);
    });
  });

  describe('PlanAcceptanceCriteriaMapping', () => {
    it('should create valid acceptance criteria mapping', () => {
      const mapping: AcceptanceCriteriaStepMapping = {
        criterionId: 'ac-1',
        criterionText: 'All tests pass',
        implementingStepIds: ['step-5', 'step-6'],
        isFullyCovered: true,
      };

      expect(mapping.criterionId).toBe('ac-1');
      expect(mapping.implementingStepIds).toContain('step-5');
      expect(mapping.isFullyCovered).toBe(true);
    });

    it('should create valid PlanAcceptanceCriteriaMapping', () => {
      const acceptanceMapping: PlanAcceptanceCriteriaMapping = {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature works correctly',
            implementingStepIds: ['step-3'],
            isFullyCovered: false,
          },
        ],
        updatedAt: '2024-01-15T10:00:00Z',
      };

      expect(acceptanceMapping.mappings).toHaveLength(1);
      expect(acceptanceMapping.mappings[0].isFullyCovered).toBe(false);
    });
  });

  describe('PlanValidationStatus', () => {
    it('should create valid validation status with all sections passing', () => {
      const status: PlanValidationStatus = {
        meta: true,
        steps: true,
        dependencies: true,
        testCoverage: true,
        acceptanceMapping: true,
        overall: true,
      };

      expect(status.overall).toBe(true);
    });

    it('should create validation status with errors', () => {
      const status: PlanValidationStatus = {
        meta: true,
        steps: false,
        dependencies: true,
        testCoverage: false,
        acceptanceMapping: true,
        overall: false,
        errors: {
          steps: ['Step description too short', 'Missing complexity rating'],
          testCoverage: ['No test types specified for step-3'],
        },
      };

      expect(status.overall).toBe(false);
      expect(status.errors?.steps).toHaveLength(2);
      expect(status.errors?.testCoverage).toHaveLength(1);
    });
  });

  describe('ComposablePlan', () => {
    it('should create a complete ComposablePlan', () => {
      const plan: ComposablePlan = {
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
            description: 'Create and checkout a new feature branch from main branch',
            status: 'completed',
            metadata: {},
            complexity: 'low',
            acceptanceCriteriaIds: [],
            estimatedFiles: [],
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
          mappings: [],
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

      expect(plan.meta.version).toBe('1.0.0');
      expect(plan.steps).toHaveLength(1);
      expect(plan.validationStatus.overall).toBe(true);
    });
  });

  describe('New*Input types', () => {
    it('should create valid NewStepsInput', () => {
      const input: NewStepsInput = {
        steps: [
          {
            id: 'step-2',
            parentId: 'step-1',
            orderIndex: 1,
            title: 'Implement feature',
            description: 'Implement the main feature logic with proper error handling',
            metadata: {},
            complexity: 'medium',
          },
        ],
        removeStepIds: ['step-old'],
      };

      expect(input.steps).toHaveLength(1);
      expect(input.removeStepIds).toContain('step-old');
    });

    it('should create valid NewDependenciesInput', () => {
      const input: NewDependenciesInput = {
        addStepDependencies: [
          { stepId: 'step-3', dependsOn: 'step-2' },
        ],
        removeStepDependencies: [
          { stepId: 'step-2', dependsOn: 'step-1' },
        ],
        addExternalDependencies: [
          { name: 'lodash', type: 'npm', reason: 'Utility functions', requiredBy: ['step-3'] },
        ],
        removeExternalDependencies: ['moment'],
      };

      expect(input.addStepDependencies).toHaveLength(1);
      expect(input.removeExternalDependencies).toContain('moment');
    });

    it('should create valid NewTestCoverageInput', () => {
      const input: NewTestCoverageInput = {
        framework: 'jest',
        requiredTestTypes: ['unit', 'integration'],
        stepCoverage: [
          { stepId: 'step-5', requiredTestTypes: ['unit'], coverageTarget: 90 },
        ],
        globalCoverageTarget: 80,
      };

      expect(input.framework).toBe('jest');
      expect(input.globalCoverageTarget).toBe(80);
    });

    it('should create valid NewAcceptanceMappingInput', () => {
      const input: NewAcceptanceMappingInput = {
        mappings: [
          {
            criterionId: 'ac-1',
            criterionText: 'Feature is accessible',
            implementingStepIds: ['step-4', 'step-5'],
            isFullyCovered: true,
          },
        ],
      };

      expect(input.mappings).toHaveLength(1);
      expect(input.mappings[0].isFullyCovered).toBe(true);
    });
  });
});
