import { z } from 'zod';
import type {
  ComposablePlan,
  PlanMeta,
  PlanStep,
  PlanDependencies,
  PlanTestCoverage,
  PlanAcceptanceCriteriaMapping,
  PlanValidationStatus,
} from '@claude-code-web/shared';
import {
  planMetaSchema,
  planStepSchema,
  planStepCompleteSchema,
  planDependenciesSchema,
  planTestCoverageSchema,
  planAcceptanceMappingSchema,
  composablePlanSchema,
  validateDependenciesAgainstSteps,
  validateTestCoverageAgainstSteps,
  validateAcceptanceMappingAgainstSteps,
} from '../validation/planSchema';

/**
 * Result of validating a single section
 */
export interface SectionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Result of validating the entire plan
 */
export interface PlanValidationResult {
  meta: SectionValidationResult;
  steps: SectionValidationResult;
  dependencies: SectionValidationResult;
  testCoverage: SectionValidationResult;
  acceptanceMapping: SectionValidationResult;
  overall: boolean;
}

/**
 * Information about an incomplete section
 */
export interface IncompleteSectionInfo {
  section: string;
  errors: string[];
  missingFields: string[];
}

/**
 * PlanValidator provides deterministic validation of composable plan structures.
 * This is a pure synchronous validation service - no subprocess spawning.
 *
 * Used after Stage 2 Claude sessions to verify plan completeness before
 * allowing transition to Stage 3 implementation.
 */
export class PlanValidator {
  /**
   * Validate an individual section using the appropriate Zod schema.
   * Returns { valid: boolean, errors: string[] }
   */
  validateSection<T>(
    data: unknown,
    schema: z.ZodType<T>
  ): SectionValidationResult {
    const result = schema.safeParse(data);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    // Extract human-readable error messages from Zod errors
    const errors = result.error.issues.map(issue => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    });

    return { valid: false, errors };
  }

  /**
   * Validate the meta section of a plan.
   */
  validateMeta(meta: unknown): SectionValidationResult {
    return this.validateSection(meta, planMetaSchema);
  }

  /**
   * Validate plan steps.
   * Checks each step individually and collects all errors.
   */
  validateSteps(steps: unknown): SectionValidationResult {
    if (!Array.isArray(steps)) {
      return { valid: false, errors: ['Steps must be an array'] };
    }

    if (steps.length === 0) {
      return { valid: false, errors: ['Plan must have at least one step'] };
    }

    const errors: string[] = [];
    const stepIds = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = this.validateSection(step, planStepSchema);

      if (!stepResult.valid) {
        errors.push(...stepResult.errors.map(e => `Step ${i + 1} (${step?.id || 'unknown'}): ${e}`));
      }

      // Check for duplicate step IDs
      if (step?.id) {
        if (stepIds.has(step.id)) {
          errors.push(`Duplicate step ID: ${step.id}`);
        }
        stepIds.add(step.id);
      }
    }

    // Validate parentIds reference valid steps
    const stepIdArray = Array.from(stepIds);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step?.parentId && !stepIds.has(step.parentId)) {
        errors.push(`Step ${i + 1} (${step.id}): orphaned parentId "${step.parentId}" does not reference a valid step`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate steps for Stage 2 completion (more strict - requires complexity).
   */
  validateStepsComplete(steps: unknown): SectionValidationResult {
    if (!Array.isArray(steps)) {
      return { valid: false, errors: ['Steps must be an array'] };
    }

    if (steps.length === 0) {
      return { valid: false, errors: ['Plan must have at least one step'] };
    }

    const errors: string[] = [];
    const stepsWithoutComplexity: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = this.validateSection(step, planStepCompleteSchema);

      if (!stepResult.valid) {
        // Check if it's specifically missing complexity
        if (!step?.complexity) {
          stepsWithoutComplexity.push(step?.id || `Step ${i + 1}`);
        } else {
          errors.push(...stepResult.errors.map(e => `Step ${i + 1} (${step?.id || 'unknown'}): ${e}`));
        }
      }
    }

    if (stepsWithoutComplexity.length > 0) {
      errors.push(`Steps missing complexity rating: ${stepsWithoutComplexity.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate dependencies section.
   * Checks for circular dependencies and orphaned references.
   */
  validateDependencies(
    dependencies: unknown,
    stepIds: string[]
  ): SectionValidationResult {
    // First validate the schema
    const schemaResult = this.validateSection(dependencies, planDependenciesSchema);
    if (!schemaResult.valid) {
      return schemaResult;
    }

    // Then validate references against actual step IDs
    const deps = dependencies as PlanDependencies;
    const refValidation = validateDependenciesAgainstSteps(deps, stepIds);

    if (!refValidation.valid) {
      return { valid: false, errors: refValidation.errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate test coverage section.
   */
  validateTestCoverage(
    testCoverage: unknown,
    stepIds: string[]
  ): SectionValidationResult {
    // First validate the schema
    const schemaResult = this.validateSection(testCoverage, planTestCoverageSchema);
    if (!schemaResult.valid) {
      return schemaResult;
    }

    // Then validate references against actual step IDs
    const coverage = testCoverage as PlanTestCoverage;
    const refValidation = validateTestCoverageAgainstSteps(coverage, stepIds);

    if (!refValidation.valid) {
      return { valid: false, errors: refValidation.errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate acceptance criteria mapping section.
   */
  validateAcceptanceMapping(
    acceptanceMapping: unknown,
    stepIds: string[]
  ): SectionValidationResult {
    // First validate the schema
    const schemaResult = this.validateSection(acceptanceMapping, planAcceptanceMappingSchema);
    if (!schemaResult.valid) {
      return schemaResult;
    }

    // Then validate references against actual step IDs
    const mapping = acceptanceMapping as PlanAcceptanceCriteriaMapping;
    const refValidation = validateAcceptanceMappingAgainstSteps(mapping, stepIds);

    if (!refValidation.valid) {
      return { valid: false, errors: refValidation.errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate an entire composable plan.
   * Returns per-section validation results plus overall status.
   */
  validatePlan(plan: unknown): PlanValidationResult {
    // Type guard for plan structure
    const planObj = plan as Partial<ComposablePlan> | null;

    // Validate meta
    const metaResult = this.validateMeta(planObj?.meta);

    // Validate steps - get step IDs for cross-validation
    const stepsResult = this.validateSteps(planObj?.steps);
    const stepIds = Array.isArray(planObj?.steps)
      ? planObj.steps
          .filter((s): s is PlanStep => s?.id != null)
          .map(s => s.id)
      : [];

    // Validate dependencies against step IDs
    const dependenciesResult = this.validateDependencies(planObj?.dependencies, stepIds);

    // Validate test coverage against step IDs
    const testCoverageResult = this.validateTestCoverage(planObj?.testCoverage, stepIds);

    // Validate acceptance mapping against step IDs
    const acceptanceMappingResult = this.validateAcceptanceMapping(planObj?.acceptanceMapping, stepIds);

    // Overall is valid only if all sections are valid
    const overall =
      metaResult.valid &&
      stepsResult.valid &&
      dependenciesResult.valid &&
      testCoverageResult.valid &&
      acceptanceMappingResult.valid;

    return {
      meta: metaResult,
      steps: stepsResult,
      dependencies: dependenciesResult,
      testCoverage: testCoverageResult,
      acceptanceMapping: acceptanceMappingResult,
      overall,
    };
  }

  /**
   * Get list of incomplete sections with specific missing fields.
   */
  getIncompleteSections(plan: unknown): IncompleteSectionInfo[] {
    const validationResult = this.validatePlan(plan);
    const incompleteSections: IncompleteSectionInfo[] = [];

    const sectionNames: Array<keyof Omit<PlanValidationResult, 'overall'>> = [
      'meta',
      'steps',
      'dependencies',
      'testCoverage',
      'acceptanceMapping',
    ];

    for (const section of sectionNames) {
      const result = validationResult[section];
      if (!result.valid) {
        // Extract missing fields from error messages
        const missingFields = this.extractMissingFields(result.errors);

        incompleteSections.push({
          section,
          errors: result.errors,
          missingFields,
        });
      }
    }

    return incompleteSections;
  }

  /**
   * Extract field names from error messages.
   */
  private extractMissingFields(errors: string[]): string[] {
    const fields = new Set<string>();

    for (const error of errors) {
      // Match patterns like "fieldName: Required" or "field.subfield: ..."
      const fieldMatch = error.match(/^([a-zA-Z_][a-zA-Z0-9_.]*?):/);
      if (fieldMatch) {
        fields.add(fieldMatch[1]);
      }

      // Match patterns like "missing complexity rating"
      const missingMatch = error.match(/missing\s+([a-zA-Z_][a-zA-Z0-9_\s]*)/i);
      if (missingMatch) {
        fields.add(missingMatch[1].trim());
      }
    }

    return Array.from(fields);
  }

  /**
   * Generate human-readable validation context for re-prompting Claude.
   * This context string describes what's missing so Stage 2 can continue.
   */
  generateValidationContext(plan: unknown): string {
    const incompleteSections = this.getIncompleteSections(plan);

    if (incompleteSections.length === 0) {
      return '';
    }

    const lines: string[] = [
      '## Plan Validation Issues',
      '',
      'The plan structure is incomplete. Please address the following issues:',
      '',
    ];

    for (const section of incompleteSections) {
      lines.push(`### ${this.formatSectionName(section.section)}`);
      lines.push('');

      for (const error of section.errors) {
        lines.push(`- ${error}`);
      }

      lines.push('');
    }

    // Add guidance based on common issues
    const guidance = this.generateGuidance(incompleteSections);
    if (guidance.length > 0) {
      lines.push('## How to Fix');
      lines.push('');
      lines.push(...guidance);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format section name for human readability.
   */
  private formatSectionName(section: string): string {
    const names: Record<string, string> = {
      meta: 'Plan Metadata',
      steps: 'Plan Steps',
      dependencies: 'Dependencies',
      testCoverage: 'Test Coverage',
      acceptanceMapping: 'Acceptance Criteria Mapping',
    };
    return names[section] || section;
  }

  /**
   * Generate guidance based on common validation issues.
   */
  private generateGuidance(incompleteSections: IncompleteSectionInfo[]): string[] {
    const guidance: string[] = [];

    for (const section of incompleteSections) {
      switch (section.section) {
        case 'steps':
          if (section.errors.some(e => e.includes('placeholder'))) {
            guidance.push('- Replace placeholder text (TBD, TODO, etc.) with actual implementation details');
          }
          if (section.errors.some(e => e.includes('description') && e.includes('50 characters'))) {
            guidance.push('- Expand step descriptions to be at least 50 characters with clear implementation details');
          }
          if (section.errors.some(e => e.includes('complexity'))) {
            guidance.push('- Add complexity ratings (low/medium/high) to all steps to help estimate effort');
          }
          if (section.errors.some(e => e.includes('orphaned parentId'))) {
            guidance.push('- Fix step parent references - ensure parentId values reference existing step IDs');
          }
          break;

        case 'dependencies':
          if (section.errors.some(e => e.includes('circular'))) {
            guidance.push('- Remove circular dependencies between steps - ensure the dependency graph is a DAG');
          }
          if (section.errors.some(e => e.includes('unknown step'))) {
            guidance.push('- Fix dependency references - ensure all step IDs in dependencies exist in the plan');
          }
          break;

        case 'testCoverage':
          if (section.errors.some(e => e.includes('framework'))) {
            guidance.push('- Specify the testing framework to use (e.g., vitest, jest, mocha)');
          }
          if (section.errors.some(e => e.includes('test type'))) {
            guidance.push('- Define required test types (e.g., unit, integration, e2e)');
          }
          break;

        case 'acceptanceMapping':
          if (section.errors.some(e => e.includes('no implementing steps'))) {
            guidance.push('- Map all acceptance criteria to at least one implementing step');
          }
          break;

        case 'meta':
          if (section.errors.some(e => e.includes('version'))) {
            guidance.push('- Set a version string for the plan (e.g., "1.0.0")');
          }
          if (section.errors.some(e => e.includes('sessionId'))) {
            guidance.push('- Ensure sessionId is set correctly');
          }
          break;
      }
    }

    return [...new Set(guidance)]; // Remove duplicates
  }

  /**
   * Create a PlanValidationStatus object from validation results.
   * Useful for updating the plan's validationStatus field.
   */
  createValidationStatus(validationResult: PlanValidationResult): PlanValidationStatus {
    const errors: Record<string, string[]> = {};

    if (!validationResult.meta.valid) {
      errors.meta = validationResult.meta.errors;
    }
    if (!validationResult.steps.valid) {
      errors.steps = validationResult.steps.errors;
    }
    if (!validationResult.dependencies.valid) {
      errors.dependencies = validationResult.dependencies.errors;
    }
    if (!validationResult.testCoverage.valid) {
      errors.testCoverage = validationResult.testCoverage.errors;
    }
    if (!validationResult.acceptanceMapping.valid) {
      errors.acceptanceMapping = validationResult.acceptanceMapping.errors;
    }

    return {
      meta: validationResult.meta.valid,
      steps: validationResult.steps.valid,
      dependencies: validationResult.dependencies.valid,
      testCoverage: validationResult.testCoverage.valid,
      acceptanceMapping: validationResult.acceptanceMapping.valid,
      overall: validationResult.overall,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    };
  }

  /**
   * Quick check if a plan is valid (for use in conditionals).
   */
  isPlanValid(plan: unknown): boolean {
    return this.validatePlan(plan).overall;
  }
}

// Export a singleton instance for convenience
export const planValidator = new PlanValidator();
