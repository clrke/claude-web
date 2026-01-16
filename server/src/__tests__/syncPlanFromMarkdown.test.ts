/**
 * Unit tests for syncPlanFromMarkdown utility
 *
 * Tests the synchronization of plan.json with plan.md after direct Edit tool modifications.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parsePlanMarkdown,
  syncPlanFromMarkdown,
  getPlanMdPath,
  getValidPlanMdPath,
} from '../utils/syncPlanFromMarkdown';
import type { Plan, PlanStep } from '@claude-code-web/shared';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockStep(
  id: string,
  title: string,
  description: string,
  status: 'pending' | 'completed' = 'pending'
): PlanStep {
  return {
    id,
    parentId: null,
    orderIndex: 0,
    title,
    description,
    status,
    metadata: {},
  };
}

function createMockPlan(steps: PlanStep[], planVersion = 1): Plan {
  return {
    version: '1.0.0',
    planVersion,
    sessionId: 'test-session',
    isApproved: false,
    reviewCount: 1,
    createdAt: new Date().toISOString(),
    steps,
  };
}

function createPlanMarkdown(steps: Array<{ id: string; title: string; description: string; parentId?: string | null }>): string {
  return steps.map(step => {
    const parentAttr = step.parentId ? ` parent="${step.parentId}"` : '';
    return `[PLAN_STEP id="${step.id}"${parentAttr}]
${step.title}
${step.description}
[/PLAN_STEP]`;
  }).join('\n\n');
}

// =============================================================================
// Test Suite
// =============================================================================

describe('syncPlanFromMarkdown', () => {
  let testDir: string;
  let planMdPath: string;

  beforeEach(() => {
    testDir = path.join('/tmp', `sync-plan-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(testDir, { recursive: true });
    planMdPath = path.join(testDir, 'plan.md');
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('parsePlanMarkdown', () => {
    it('should parse plan steps from markdown file', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'First Step', description: 'Description of first step' },
        { id: 'step-2', title: 'Second Step', description: 'Description of second step' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const steps = await parsePlanMarkdown(planMdPath);

      expect(steps).not.toBeNull();
      expect(steps).toHaveLength(2);
      expect(steps![0].id).toBe('step-1');
      expect(steps![0].title).toBe('First Step');
      expect(steps![1].id).toBe('step-2');
      expect(steps![1].title).toBe('Second Step');
    });

    it('should return null for non-existent file', async () => {
      const steps = await parsePlanMarkdown('/non/existent/plan.md');
      expect(steps).toBeNull();
    });

    it('should return empty array for file with no plan steps', async () => {
      fs.writeFileSync(planMdPath, '# Plan\n\nNo steps here.', 'utf8');

      const steps = await parsePlanMarkdown(planMdPath);

      expect(steps).not.toBeNull();
      expect(steps).toHaveLength(0);
    });

    it('should parse parent relationships', async () => {
      const markdown = `[PLAN_STEP id="step-1"]
Parent Step
This is the parent
[/PLAN_STEP]

[PLAN_STEP id="step-1a" parent="step-1"]
Child Step
This is the child
[/PLAN_STEP]`;
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const steps = await parsePlanMarkdown(planMdPath);

      expect(steps).toHaveLength(2);
      expect(steps![0].parentId).toBeNull();
      expect(steps![1].parentId).toBe('step-1');
    });
  });

  describe('syncPlanFromMarkdown', () => {
    it('should detect no changes when plan.md matches plan.json', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Description one' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Description one'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(false);
      expect(result!.syncResult.addedCount).toBe(0);
      expect(result!.syncResult.updatedCount).toBe(0);
      expect(result!.syncResult.removedCount).toBe(0);
    });

    it('should detect added steps', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Description one' },
        { id: 'step-2', title: 'Step Two', description: 'Description two' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Description one'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.syncResult.addedCount).toBe(1);
      expect(result!.syncResult.addedStepIds).toContain('step-2');
      expect(result!.updatedPlan.steps).toHaveLength(2);
    });

    it('should detect removed steps', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Description one' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Description one'),
        createMockStep('step-2', 'Step Two', 'Description two'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.syncResult.removedCount).toBe(1);
      expect(result!.syncResult.removedStepIds).toContain('step-2');
      expect(result!.updatedPlan.steps).toHaveLength(1);
    });

    it('should detect updated step titles', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Updated Title', description: 'Description one' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Original Title', 'Description one'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.syncResult.updatedCount).toBe(1);
      expect(result!.syncResult.updatedStepIds).toContain('step-1');
      expect(result!.updatedPlan.steps[0].title).toBe('Updated Title');
    });

    it('should detect updated step descriptions', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Updated description' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Original description'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.syncResult.updatedCount).toBe(1);
      expect(result!.updatedPlan.steps[0].description).toBe('Updated description');
    });

    it('should reset completed step to pending when content changes', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Updated Title', description: 'Updated description' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const completedStep = createMockStep('step-1', 'Original Title', 'Original description', 'completed');
      completedStep.contentHash = 'abc123';
      const currentPlan = createMockPlan([completedStep]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.updatedPlan.steps[0].status).toBe('pending');
      expect(result!.updatedPlan.steps[0].contentHash).toBeUndefined();
    });

    it('should preserve step status when content unchanged', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Description one' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const completedStep = createMockStep('step-1', 'Step One', 'Description one', 'completed');
      const currentPlan = createMockPlan([completedStep]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(false);
      expect(result!.updatedPlan.steps[0].status).toBe('completed');
    });

    it('should increment planVersion when changes detected', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Updated Title', description: 'Description' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Original Title', 'Description'),
      ], 3);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.updatedPlan.planVersion).toBe(4);
    });

    it('should not increment planVersion when no changes', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Step One', description: 'Description' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Description'),
      ], 3);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.updatedPlan.planVersion).toBe(3);
    });

    it('should handle multiple changes at once', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-1', title: 'Updated Step 1', description: 'Updated desc' },
        { id: 'step-3', title: 'New Step 3', description: 'New description' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Original Step 1', 'Original desc'),
        createMockStep('step-2', 'Step 2', 'Will be removed'),
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.syncResult.changed).toBe(true);
      expect(result!.syncResult.addedCount).toBe(1);
      expect(result!.syncResult.updatedCount).toBe(1);
      expect(result!.syncResult.removedCount).toBe(1);
      expect(result!.updatedPlan.steps).toHaveLength(2);
    });

    it('should return null when plan.md does not exist', async () => {
      const currentPlan = createMockPlan([
        createMockStep('step-1', 'Step One', 'Description'),
      ]);

      const result = await syncPlanFromMarkdown('/non/existent/plan.md', currentPlan);

      expect(result).toBeNull();
    });

    it('should update orderIndex based on position in markdown', async () => {
      const markdown = createPlanMarkdown([
        { id: 'step-2', title: 'Now First', description: 'Reordered' },
        { id: 'step-1', title: 'Now Second', description: 'Reordered' },
      ]);
      fs.writeFileSync(planMdPath, markdown, 'utf8');

      const currentPlan = createMockPlan([
        { ...createMockStep('step-1', 'Now Second', 'Reordered'), orderIndex: 0 },
        { ...createMockStep('step-2', 'Now First', 'Reordered'), orderIndex: 1 },
      ]);

      const result = await syncPlanFromMarkdown(planMdPath, currentPlan);

      expect(result).not.toBeNull();
      expect(result!.updatedPlan.steps[0].id).toBe('step-2');
      expect(result!.updatedPlan.steps[0].orderIndex).toBe(0);
      expect(result!.updatedPlan.steps[1].id).toBe('step-1');
      expect(result!.updatedPlan.steps[1].orderIndex).toBe(1);
    });
  });

  describe('getPlanMdPath', () => {
    it('should derive plan.md path from plan.json path', () => {
      expect(getPlanMdPath('/path/to/session/plan.json')).toBe('/path/to/session/plan.md');
      expect(getPlanMdPath('relative/plan.json')).toBe('relative/plan.md');
    });
  });

  describe('getValidPlanMdPath', () => {
    it('should return path if it ends with plan.md', () => {
      expect(getValidPlanMdPath('/path/to/plan.md')).toBe('/path/to/plan.md');
    });

    it('should return null for non-plan.md paths', () => {
      expect(getValidPlanMdPath('/path/to/plan.json')).toBeNull();
      expect(getValidPlanMdPath('/path/to/file.txt')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(getValidPlanMdPath(null)).toBeNull();
      expect(getValidPlanMdPath(undefined)).toBeNull();
    });

    it('should append plan.md to directory paths', () => {
      expect(getValidPlanMdPath('/path/to/session')).toBe('/path/to/session/plan.md');
    });
  });
});

describe('integration: Stage 2 direct Edit workflow', () => {
  let testDir: string;
  let planMdPath: string;

  beforeEach(() => {
    testDir = path.join('/tmp', `sync-plan-integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(testDir, { recursive: true });
    planMdPath = path.join(testDir, 'plan.md');
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should sync plan after Claude edits step description via Edit tool', async () => {
    // Initial plan state
    const initialPlan = createMockPlan([
      createMockStep('step-1', 'Add authentication', 'Implement basic auth', 'completed'),
      createMockStep('step-2', 'Add tests', 'Write unit tests'),
    ], 1);

    // Claude uses Edit tool to update step-1 description in plan.md
    const updatedMarkdown = createPlanMarkdown([
      { id: 'step-1', title: 'Add authentication', description: 'Implement JWT authentication with refresh tokens' },
      { id: 'step-2', title: 'Add tests', description: 'Write unit tests' },
    ]);
    fs.writeFileSync(planMdPath, updatedMarkdown, 'utf8');

    // Sync detects the change
    const result = await syncPlanFromMarkdown(planMdPath, initialPlan);

    expect(result).not.toBeNull();
    expect(result!.syncResult.changed).toBe(true);
    expect(result!.syncResult.updatedCount).toBe(1);
    expect(result!.syncResult.updatedStepIds).toContain('step-1');
    // Completed step should be reset to pending since content changed
    expect(result!.updatedPlan.steps[0].status).toBe('pending');
  });

  it('should sync plan after Claude adds new step via Edit tool', async () => {
    // Initial plan state
    const initialPlan = createMockPlan([
      createMockStep('step-1', 'Step 1', 'Description 1'),
    ], 1);

    // Claude uses Edit tool to add a new step
    const updatedMarkdown = createPlanMarkdown([
      { id: 'step-1', title: 'Step 1', description: 'Description 1' },
      { id: 'step-1a', title: 'New Step', description: 'Added during review', parentId: 'step-1' },
    ]);
    fs.writeFileSync(planMdPath, updatedMarkdown, 'utf8');

    const result = await syncPlanFromMarkdown(planMdPath, initialPlan);

    expect(result).not.toBeNull();
    expect(result!.syncResult.changed).toBe(true);
    expect(result!.syncResult.addedCount).toBe(1);
    expect(result!.syncResult.addedStepIds).toContain('step-1a');
    expect(result!.updatedPlan.steps).toHaveLength(2);
    expect(result!.updatedPlan.steps[1].parentId).toBe('step-1');
  });

  it('should sync plan after Claude removes step via Edit tool', async () => {
    // Initial plan state
    const initialPlan = createMockPlan([
      createMockStep('step-1', 'Step 1', 'Description 1'),
      createMockStep('step-2', 'Step 2', 'Description 2'),
      createMockStep('step-3', 'Step 3', 'Description 3'),
    ], 1);

    // Claude uses Edit tool to remove step-2
    const updatedMarkdown = createPlanMarkdown([
      { id: 'step-1', title: 'Step 1', description: 'Description 1' },
      { id: 'step-3', title: 'Step 3', description: 'Description 3' },
    ]);
    fs.writeFileSync(planMdPath, updatedMarkdown, 'utf8');

    const result = await syncPlanFromMarkdown(planMdPath, initialPlan);

    expect(result).not.toBeNull();
    expect(result!.syncResult.changed).toBe(true);
    expect(result!.syncResult.removedCount).toBe(1);
    expect(result!.syncResult.removedStepIds).toContain('step-2');
    expect(result!.updatedPlan.steps).toHaveLength(2);
  });
});
