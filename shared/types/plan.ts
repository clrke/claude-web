export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped' | 'needs_review';

/**
 * Complexity rating for a plan step.
 * - low: Simple, straightforward implementation (< 1 hour)
 * - medium: Moderate complexity, may require some research (1-4 hours)
 * - high: Complex implementation, may need multiple iterations (> 4 hours)
 */
export type StepComplexity = 'low' | 'medium' | 'high';

export interface PlanStep {
  id: string;
  parentId: string | null;
  orderIndex: number;
  title: string;
  description: string;
  status: PlanStepStatus;
  metadata: Record<string, unknown>;
  /** Hash of step content (title + description) when completed. Used to skip re-implementation of unchanged steps. */
  contentHash?: string | null;
  /** Complexity rating for this step - helps LLM identify which steps need more clarity */
  complexity?: StepComplexity;
  /** IDs of acceptance criteria that this step addresses */
  acceptanceCriteriaIds?: string[];
  /** Estimated files that will be modified/created in this step */
  estimatedFiles?: string[];
}

export interface TestRequirement {
  required: boolean;
  reason: string;
  testTypes: string[];
  existingFramework: string | null;
  suggestedCoverage: string;
  assessedAt: string;
}

export interface Plan {
  version: string;
  planVersion: number;
  sessionId: string;
  isApproved: boolean;
  reviewCount: number;
  createdAt: string;
  steps: PlanStep[];
  /** Test requirement assessment result - set after plan approval */
  testRequirement?: TestRequirement;
}

export interface PlanHistoryEntry {
  version: number;
  plan: Plan;
  changedAt: string;
  changedBy: 'user' | 'claude' | 'system';
  changeReason: string;
}

// ============================================================================
// Composable Plan Types
// ============================================================================

/**
 * Plan metadata - contains version info, session reference, and approval status.
 */
export interface PlanMeta {
  /** Schema version for the composable plan format */
  version: string;
  /** Reference to the session this plan belongs to */
  sessionId: string;
  /** ISO timestamp when the plan was created */
  createdAt: string;
  /** ISO timestamp when the plan was last updated */
  updatedAt: string;
  /** Whether the plan has been approved for implementation */
  isApproved: boolean;
  /** Number of Stage 2 review iterations */
  reviewCount: number;
}

/**
 * Inter-step dependency definition.
 */
export interface StepDependency {
  /** ID of the step that depends on another */
  stepId: string;
  /** ID of the step that must be completed first */
  dependsOn: string;
  /** Optional reason for the dependency */
  reason?: string;
}

/**
 * External dependency required by the plan.
 */
export interface ExternalDependency {
  /** Name of the external dependency (e.g., package name, service name) */
  name: string;
  /** Type of dependency */
  type: 'npm' | 'api' | 'service' | 'file' | 'other';
  /** Version or specification */
  version?: string;
  /** Why this dependency is needed */
  reason: string;
  /** Which step(s) require this dependency */
  requiredBy: string[];
}

/**
 * Plan dependencies - both inter-step and external.
 */
export interface PlanDependencies {
  /** Dependencies between plan steps (forms DAG) */
  stepDependencies: StepDependency[];
  /** External dependencies required by the plan */
  externalDependencies: ExternalDependency[];
}

/**
 * Test coverage requirement for a specific step.
 */
export interface StepTestCoverage {
  /** ID of the step this coverage applies to */
  stepId: string;
  /** Types of tests required (e.g., 'unit', 'integration', 'e2e') */
  requiredTestTypes: string[];
  /** Minimum coverage percentage target (0-100) */
  coverageTarget?: number;
  /** Specific test cases or scenarios to cover */
  testCases?: string[];
}

/**
 * Plan-level test coverage configuration.
 */
export interface PlanTestCoverage {
  /** Testing framework to use (e.g., 'vitest', 'jest', 'mocha') */
  framework: string;
  /** Overall test types required for the plan */
  requiredTestTypes: string[];
  /** Per-step test coverage requirements */
  stepCoverage: StepTestCoverage[];
  /** Global coverage target percentage */
  globalCoverageTarget?: number;
}

/**
 * Mapping of an acceptance criterion to implementing steps.
 */
export interface AcceptanceCriteriaStepMapping {
  /** ID of the acceptance criterion (index-based or UUID) */
  criterionId: string;
  /** Text of the acceptance criterion for reference */
  criterionText: string;
  /** IDs of steps that implement this criterion */
  implementingStepIds: string[];
  /** Whether this criterion is fully covered by the listed steps */
  isFullyCovered: boolean;
}

/**
 * Complete mapping of acceptance criteria to plan steps.
 */
export interface PlanAcceptanceCriteriaMapping {
  /** Individual criterion-to-steps mappings */
  mappings: AcceptanceCriteriaStepMapping[];
  /** Timestamp when mapping was last updated */
  updatedAt: string;
}

/**
 * Validation status for each section of the composable plan.
 */
export interface PlanValidationStatus {
  /** Whether the meta section is valid */
  meta: boolean;
  /** Whether all steps are valid (have required fields, no placeholders) */
  steps: boolean;
  /** Whether dependencies are valid (no orphans, no cycles) */
  dependencies: boolean;
  /** Whether test coverage is properly defined */
  testCoverage: boolean;
  /** Whether all acceptance criteria are mapped to steps */
  acceptanceMapping: boolean;
  /** Overall validity (true only if all sections are valid) */
  overall: boolean;
  /** Human-readable validation errors by section */
  errors?: Record<string, string[]>;
}

/**
 * Composable plan structure - combines all sections with independent validation.
 * This is the new plan format that replaces the monolithic Plan interface.
 */
export interface ComposablePlan {
  /** Plan metadata */
  meta: PlanMeta;
  /** Plan steps (enhanced with complexity, acceptance criteria mapping) */
  steps: PlanStep[];
  /** Inter-step and external dependencies */
  dependencies: PlanDependencies;
  /** Test coverage requirements */
  testCoverage: PlanTestCoverage;
  /** Mapping of acceptance criteria to steps */
  acceptanceMapping: PlanAcceptanceCriteriaMapping;
  /** Validation status per section */
  validationStatus: PlanValidationStatus;
}

/**
 * Input for creating new steps via new-steps.json file.
 * Claude edits this file, server validates and explodes to steps/ directory.
 */
export interface NewStepsInput {
  /** Steps to add or update */
  steps: Omit<PlanStep, 'status'>[];
  /** Optional: steps to remove by ID */
  removeStepIds?: string[];
}

/**
 * Input for updating dependencies via new-dependencies.json file.
 */
export interface NewDependenciesInput {
  /** Step dependencies to add */
  addStepDependencies?: StepDependency[];
  /** Step dependencies to remove (by stepId + dependsOn pair) */
  removeStepDependencies?: { stepId: string; dependsOn: string }[];
  /** External dependencies to add or update */
  addExternalDependencies?: ExternalDependency[];
  /** External dependencies to remove by name */
  removeExternalDependencies?: string[];
}

/**
 * Input for updating test coverage via new-test-coverage.json file.
 */
export interface NewTestCoverageInput {
  /** Update framework */
  framework?: string;
  /** Update required test types */
  requiredTestTypes?: string[];
  /** Step coverage to add or update */
  stepCoverage?: StepTestCoverage[];
  /** Global coverage target */
  globalCoverageTarget?: number;
}

/**
 * Input for updating acceptance mapping via new-acceptance.json file.
 */
export interface NewAcceptanceMappingInput {
  /** Mappings to add or update (by criterionId) */
  mappings: AcceptanceCriteriaStepMapping[];
}
