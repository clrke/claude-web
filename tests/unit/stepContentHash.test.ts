import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeWhitespace,
  computeStepContentHash,
  computeStepHash,
  isStepContentUnchanged,
  setStepContentHash,
  HashableStep,
  computePlanHash,
  comparePlanHashes,
  savePlanSnapshot,
  loadPlanSnapshot,
  deletePlanSnapshot,
  hasPlanChangedSinceSnapshot,
  PlanSnapshot,
} from '../../server/src/utils/stepContentHash';
import type { Plan, PlanStep } from '@claude-code-web/shared';

describe('stepContentHash utility', () => {
  describe('normalizeWhitespace', () => {
    it('should return empty string for null/undefined/empty input', () => {
      expect(normalizeWhitespace('')).toBe('');
      expect(normalizeWhitespace(null as unknown as string)).toBe('');
      expect(normalizeWhitespace(undefined as unknown as string)).toBe('');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
      expect(normalizeWhitespace('\t\thello\t\t')).toBe('hello');
      expect(normalizeWhitespace('\n\nhello\n\n')).toBe('hello');
    });

    it('should collapse multiple spaces into single space', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world');
      expect(normalizeWhitespace('a  b  c  d')).toBe('a b c d');
    });

    it('should collapse multiple tabs into single space', () => {
      expect(normalizeWhitespace('hello\t\t\tworld')).toBe('hello world');
    });

    it('should normalize Windows line endings (CRLF) to LF', () => {
      expect(normalizeWhitespace('hello\r\nworld')).toBe('hello\nworld');
      expect(normalizeWhitespace('a\r\nb\r\nc')).toBe('a\nb\nc');
    });

    it('should normalize old Mac line endings (CR) to LF', () => {
      expect(normalizeWhitespace('hello\rworld')).toBe('hello\nworld');
    });

    it('should collapse multiple newlines into single newline', () => {
      expect(normalizeWhitespace('hello\n\n\nworld')).toBe('hello\nworld');
    });

    it('should handle mixed whitespace', () => {
      // After normalization: collapse spaces, collapse newlines, trim
      // '  hello  \n\n  world  ' -> ' hello \n\n world ' -> ' hello \n world ' -> 'hello \n world'
      expect(normalizeWhitespace('  hello  \n\n  world  ')).toBe('hello \n world');
    });

    it('should preserve single spaces and newlines', () => {
      expect(normalizeWhitespace('hello world')).toBe('hello world');
      expect(normalizeWhitespace('line1\nline2')).toBe('line1\nline2');
    });
  });

  describe('computeStepContentHash', () => {
    it('should compute a 16-character hex hash', () => {
      const hash = computeStepContentHash('Test Title', 'Test Description');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should be deterministic - same input produces same output', () => {
      const hash1 = computeStepContentHash('Title', 'Description');
      const hash2 = computeStepContentHash('Title', 'Description');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different titles', () => {
      const hash1 = computeStepContentHash('Title A', 'Same description');
      const hash2 = computeStepContentHash('Title B', 'Same description');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different descriptions', () => {
      const hash1 = computeStepContentHash('Same title', 'Description A');
      const hash2 = computeStepContentHash('Same title', 'Description B');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty description', () => {
      const hash1 = computeStepContentHash('Title', '');
      const hash2 = computeStepContentHash('Title', null);
      const hash3 = computeStepContentHash('Title', undefined);
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should normalize whitespace for consistent hashing', () => {
      const hash1 = computeStepContentHash('Title', 'Description');
      const hash2 = computeStepContentHash('  Title  ', '  Description  ');
      expect(hash1).toBe(hash2);
    });

    it('should normalize line endings for consistent hashing', () => {
      const hash1 = computeStepContentHash('Title', 'Line1\nLine2');
      const hash2 = computeStepContentHash('Title', 'Line1\r\nLine2');
      const hash3 = computeStepContentHash('Title', 'Line1\rLine2');
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should collapse multiple whitespace for consistent hashing', () => {
      const hash1 = computeStepContentHash('Title', 'hello world');
      const hash2 = computeStepContentHash('Title', 'hello    world');
      expect(hash1).toBe(hash2);
    });

    it('should distinguish between title/description content', () => {
      // "A|B" should differ from "A|" + "B" in description
      const hash1 = computeStepContentHash('Title|Extra', '');
      const hash2 = computeStepContentHash('Title', 'Extra');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeStepHash', () => {
    it('should compute hash from step object', () => {
      const step: HashableStep = {
        title: 'Test Step',
        description: 'Test Description',
      };
      const hash = computeStepHash(step);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should match computeStepContentHash output', () => {
      const step: HashableStep = {
        title: 'Test Step',
        description: 'Test Description',
      };
      const hashFromObject = computeStepHash(step);
      const hashFromValues = computeStepContentHash('Test Step', 'Test Description');
      expect(hashFromObject).toBe(hashFromValues);
    });

    it('should handle step with no description', () => {
      const step: HashableStep = {
        title: 'Test Step',
      };
      const hash = computeStepHash(step);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should handle step with null description', () => {
      const step: HashableStep = {
        title: 'Test Step',
        description: null,
      };
      const hash = computeStepHash(step);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('isStepContentUnchanged', () => {
    it('should return false when step has no contentHash', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
      };
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should return false when contentHash is null', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
        contentHash: null,
      };
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should return true when content matches hash', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
        contentHash: computeStepContentHash('Test Step', 'Test Description'),
      };
      expect(isStepContentUnchanged(step)).toBe(true);
    });

    it('should return false when title changed', () => {
      const originalHash = computeStepContentHash('Original Title', 'Description');
      const step = {
        title: 'Changed Title',
        description: 'Description',
        contentHash: originalHash,
      };
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should return false when description changed', () => {
      const originalHash = computeStepContentHash('Title', 'Original Description');
      const step = {
        title: 'Title',
        description: 'Changed Description',
        contentHash: originalHash,
      };
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should be whitespace-insensitive', () => {
      // Hash computed with extra whitespace
      const originalHash = computeStepContentHash('  Title  ', '  Description  ');
      // Step with normalized whitespace
      const step = {
        title: 'Title',
        description: 'Description',
        contentHash: originalHash,
      };
      expect(isStepContentUnchanged(step)).toBe(true);
    });
  });

  describe('setStepContentHash', () => {
    it('should set contentHash on step object', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);
      expect(step.contentHash).toBeDefined();
      expect(step.contentHash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should overwrite existing contentHash', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
        contentHash: 'oldhash123456789',
      };
      setStepContentHash(step);
      expect(step.contentHash).not.toBe('oldhash123456789');
    });

    it('should set correct hash for current content', () => {
      const step = {
        title: 'My Title',
        description: 'My Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);
      expect(step.contentHash).toBe(computeStepContentHash('My Title', 'My Description'));
    });

    it('should allow isStepContentUnchanged to return true after setting', () => {
      const step = {
        title: 'Test Step',
        description: 'Test Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);
      expect(isStepContentUnchanged(step)).toBe(true);
    });
  });

  describe('integration: step modification workflow', () => {
    it('should detect when step content changes after completion', () => {
      // Simulate step completion
      const step = {
        title: 'Original Title',
        description: 'Original Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);

      // Content unchanged - should skip
      expect(isStepContentUnchanged(step)).toBe(true);

      // Now modify the step content (during Stage 2 revision)
      step.title = 'Modified Title';

      // Content changed - should re-implement
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should handle description-only changes', () => {
      const step = {
        title: 'Same Title',
        description: 'Original Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);
      expect(isStepContentUnchanged(step)).toBe(true);

      // Modify only description
      step.description = 'Modified Description';
      expect(isStepContentUnchanged(step)).toBe(false);
    });

    it('should not trigger re-implementation for whitespace-only changes', () => {
      const step = {
        title: 'Title',
        description: 'Description',
        contentHash: undefined as string | undefined,
      };
      setStepContentHash(step);
      expect(isStepContentUnchanged(step)).toBe(true);

      // Add insignificant whitespace
      step.title = '  Title  ';
      step.description = '  Description  ';

      // Should still be considered unchanged
      expect(isStepContentUnchanged(step)).toBe(true);
    });

    it('should handle clearing contentHash to force re-implementation', () => {
      const step = {
        title: 'Title',
        description: 'Description',
        contentHash: undefined as string | undefined | null,
      };
      setStepContentHash(step);
      expect(isStepContentUnchanged(step)).toBe(true);

      // Clear hash to force re-implementation (as done when step is edited)
      step.contentHash = undefined;
      expect(isStepContentUnchanged(step)).toBe(false);

      // Or set to null
      step.contentHash = null;
      expect(isStepContentUnchanged(step)).toBe(false);
    });
  });

  describe('hash algorithm properties', () => {
    it('should use SHA256 (produces consistent length output)', () => {
      // SHA256 produces 64 hex chars, we take first 16
      const hash = computeStepContentHash('test', 'test');
      expect(hash.length).toBe(16);
    });

    it('should be collision-resistant for similar inputs', () => {
      const hashes = new Set<string>();
      const testCases = [
        ['Title', 'Description'],
        ['Title ', 'Description'],
        ['Title', ' Description'],
        ['Title1', 'Description'],
        ['Title', 'Description1'],
        ['Titl', 'eDescription'],
        ['T', 'itleDescription'],
      ];

      for (const [title, desc] of testCases) {
        hashes.add(computeStepContentHash(title, desc));
      }

      // After whitespace normalization, 'Title ' and 'Title' become same
      // So we expect fewer unique hashes than test cases
      expect(hashes.size).toBeGreaterThanOrEqual(5);
    });
  });
});

// =============================================================================
// Plan-Level Hash Tests
// =============================================================================

describe('plan-level hash functions', () => {
  // Helper to create mock plan steps
  function createMockStep(
    id: string,
    title: string,
    description: string,
    status: 'pending' | 'completed' = 'pending',
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): PlanStep {
    return {
      id,
      parentId: null,
      orderIndex: 0,
      title,
      description,
      status,
      metadata: {},
      complexity,
    };
  }

  // Helper to create mock plan
  function createMockPlan(steps: PlanStep[], planVersion = 1): Plan {
    return {
      version: '1.0.0',
      planVersion,
      sessionId: 'test-session',
      isApproved: true,
      reviewCount: 1,
      createdAt: new Date().toISOString(),
      steps,
    };
  }

  describe('computePlanHash', () => {
    it('should compute a 32-character hex hash', () => {
      const plan = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
      ]);
      const hash = computePlanHash(plan);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should be deterministic - same input produces same output', () => {
      const plan = createMockPlan([
        createMockStep('step-1', 'Title', 'Description'),
      ]);
      const hash1 = computePlanHash(plan);
      const hash2 = computePlanHash(plan);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes when step title changes', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Original Title', 'Description'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Changed Title', 'Description'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce different hashes when step description changes', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title', 'Original Description'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Title', 'Changed Description'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce different hashes when step status changes', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title', 'Description', 'pending'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Title', 'Description', 'completed'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce different hashes when step complexity changes', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title', 'Description', 'pending', 'low'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Title', 'Description', 'pending', 'high'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce different hashes when a step is added', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
        createMockStep('step-2', 'Title 2', 'Description 2'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce different hashes when a step is removed', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
        createMockStep('step-2', 'Title 2', 'Description 2'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
      ]);
      expect(computePlanHash(plan1)).not.toBe(computePlanHash(plan2));
    });

    it('should produce same hash regardless of step order in array', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title 1', 'Description 1'),
        createMockStep('step-2', 'Title 2', 'Description 2'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-2', 'Title 2', 'Description 2'),
        createMockStep('step-1', 'Title 1', 'Description 1'),
      ]);
      expect(computePlanHash(plan1)).toBe(computePlanHash(plan2));
    });

    it('should normalize whitespace for consistent hashing', () => {
      const plan1 = createMockPlan([
        createMockStep('step-1', 'Title', 'Description'),
      ]);
      const plan2 = createMockPlan([
        createMockStep('step-1', '  Title  ', '  Description  '),
      ]);
      expect(computePlanHash(plan1)).toBe(computePlanHash(plan2));
    });

    it('should handle empty plan', () => {
      const plan = createMockPlan([]);
      const hash = computePlanHash(plan);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should handle steps with null/undefined description', () => {
      const step = createMockStep('step-1', 'Title', '');
      step.description = null as unknown as string;
      const plan = createMockPlan([step]);
      const hash = computePlanHash(plan);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('comparePlanHashes', () => {
    it('should return true when hashes are different', () => {
      expect(comparePlanHashes('abc123', 'def456')).toBe(true);
    });

    it('should return false when hashes are the same', () => {
      expect(comparePlanHashes('abc123', 'abc123')).toBe(false);
    });
  });

  describe('plan snapshot file operations', () => {
    let testDir: string;

    beforeEach(() => {
      // Create a unique test directory for each test
      testDir = path.join('/tmp', `plan-hash-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up test directory
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('savePlanSnapshot', () => {
      it('should save snapshot to file', () => {
        const hash = 'abc123def456abc123def456abc12345';
        savePlanSnapshot(testDir, hash, 1);

        const snapshotPath = path.join(testDir, '.plan-snapshot.json');
        expect(fs.existsSync(snapshotPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        expect(content.hash).toBe(hash);
        expect(content.planVersion).toBe(1);
        expect(content.savedAt).toBeDefined();
      });

      it('should overwrite existing snapshot', () => {
        savePlanSnapshot(testDir, 'hash1', 1);
        savePlanSnapshot(testDir, 'hash2', 2);

        const snapshot = loadPlanSnapshot(testDir);
        expect(snapshot?.hash).toBe('hash2');
        expect(snapshot?.planVersion).toBe(2);
      });
    });

    describe('loadPlanSnapshot', () => {
      it('should load existing snapshot', () => {
        const hash = 'abc123def456abc123def456abc12345';
        savePlanSnapshot(testDir, hash, 3);

        const snapshot = loadPlanSnapshot(testDir);
        expect(snapshot).not.toBeNull();
        expect(snapshot?.hash).toBe(hash);
        expect(snapshot?.planVersion).toBe(3);
        expect(snapshot?.savedAt).toBeDefined();
      });

      it('should return null when no snapshot exists', () => {
        const snapshot = loadPlanSnapshot(testDir);
        expect(snapshot).toBeNull();
      });

      it('should return null for invalid JSON', () => {
        const snapshotPath = path.join(testDir, '.plan-snapshot.json');
        fs.writeFileSync(snapshotPath, 'invalid json', 'utf8');

        const snapshot = loadPlanSnapshot(testDir);
        expect(snapshot).toBeNull();
      });

      it('should return null for non-existent directory', () => {
        const snapshot = loadPlanSnapshot('/non/existent/path');
        expect(snapshot).toBeNull();
      });
    });

    describe('deletePlanSnapshot', () => {
      it('should delete existing snapshot', () => {
        savePlanSnapshot(testDir, 'hash', 1);
        const snapshotPath = path.join(testDir, '.plan-snapshot.json');
        expect(fs.existsSync(snapshotPath)).toBe(true);

        deletePlanSnapshot(testDir);
        expect(fs.existsSync(snapshotPath)).toBe(false);
      });

      it('should not throw when snapshot does not exist', () => {
        expect(() => deletePlanSnapshot(testDir)).not.toThrow();
      });

      it('should not throw for non-existent directory', () => {
        expect(() => deletePlanSnapshot('/non/existent/path')).not.toThrow();
      });
    });

    describe('hasPlanChangedSinceSnapshot', () => {
      it('should return null when no snapshot exists', () => {
        const plan = createMockPlan([
          createMockStep('step-1', 'Title', 'Description'),
        ]);
        const result = hasPlanChangedSinceSnapshot(testDir, plan);
        expect(result).toBeNull();
      });

      it('should return changed=false when plan is unchanged', () => {
        const plan = createMockPlan([
          createMockStep('step-1', 'Title', 'Description'),
        ]);
        const hash = computePlanHash(plan);
        savePlanSnapshot(testDir, hash, 1);

        const result = hasPlanChangedSinceSnapshot(testDir, plan);
        expect(result).not.toBeNull();
        expect(result?.changed).toBe(false);
        expect(result?.beforeHash).toBe(hash);
        expect(result?.afterHash).toBe(hash);
      });

      it('should return changed=true when plan is modified', () => {
        const originalPlan = createMockPlan([
          createMockStep('step-1', 'Original Title', 'Description'),
        ]);
        const hash = computePlanHash(originalPlan);
        savePlanSnapshot(testDir, hash, 1);

        const modifiedPlan = createMockPlan([
          createMockStep('step-1', 'Modified Title', 'Description'),
        ]);
        const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
        expect(result).not.toBeNull();
        expect(result?.changed).toBe(true);
        expect(result?.beforeHash).toBe(hash);
        expect(result?.afterHash).not.toBe(hash);
      });

      it('should detect added steps', () => {
        const originalPlan = createMockPlan([
          createMockStep('step-1', 'Title 1', 'Description 1'),
        ]);
        savePlanSnapshot(testDir, computePlanHash(originalPlan), 1);

        const modifiedPlan = createMockPlan([
          createMockStep('step-1', 'Title 1', 'Description 1'),
          createMockStep('step-2', 'Title 2', 'Description 2'),
        ]);
        const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
        expect(result?.changed).toBe(true);
      });

      it('should detect removed steps', () => {
        const originalPlan = createMockPlan([
          createMockStep('step-1', 'Title 1', 'Description 1'),
          createMockStep('step-2', 'Title 2', 'Description 2'),
        ]);
        savePlanSnapshot(testDir, computePlanHash(originalPlan), 1);

        const modifiedPlan = createMockPlan([
          createMockStep('step-1', 'Title 1', 'Description 1'),
        ]);
        const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
        expect(result?.changed).toBe(true);
      });

      it('should detect complexity changes', () => {
        const originalPlan = createMockPlan([
          createMockStep('step-1', 'Title', 'Description', 'pending', 'low'),
        ]);
        savePlanSnapshot(testDir, computePlanHash(originalPlan), 1);

        const modifiedPlan = createMockPlan([
          createMockStep('step-1', 'Title', 'Description', 'pending', 'high'),
        ]);
        const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
        expect(result?.changed).toBe(true);
      });
    });
  });

  describe('integration: Stage 5 plan change detection workflow', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = path.join('/tmp', `plan-hash-workflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should detect no changes in typical PR review without edits', () => {
      // Before Stage 5: save snapshot
      const plan = createMockPlan([
        createMockStep('step-1', 'Add authentication', 'Implement JWT auth'),
        createMockStep('step-2', 'Add tests', 'Write unit tests for auth'),
      ]);
      savePlanSnapshot(testDir, computePlanHash(plan), plan.planVersion);

      // After Stage 5: check for changes (no edits made)
      const result = hasPlanChangedSinceSnapshot(testDir, plan);
      expect(result?.changed).toBe(false);
    });

    it('should detect changes when Claude edits step description during PR review', () => {
      // Before Stage 5: save snapshot
      const originalPlan = createMockPlan([
        createMockStep('step-1', 'Add authentication', 'Implement JWT auth'),
      ]);
      savePlanSnapshot(testDir, computePlanHash(originalPlan), originalPlan.planVersion);

      // During Stage 5: Claude edits step description via Edit tool
      const modifiedPlan = createMockPlan([
        createMockStep('step-1', 'Add authentication', 'Implement JWT auth with refresh tokens and session management'),
      ]);

      // After Stage 5: detect changes
      const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
      expect(result?.changed).toBe(true);

      // System should now transition back to Stage 2
    });

    it('should detect changes when Claude adds a new step during PR review', () => {
      // Before Stage 5
      const originalPlan = createMockPlan([
        createMockStep('step-1', 'Add feature', 'Basic implementation'),
      ]);
      savePlanSnapshot(testDir, computePlanHash(originalPlan), originalPlan.planVersion);

      // During Stage 5: Claude realizes a step was missing
      const modifiedPlan = createMockPlan([
        createMockStep('step-1', 'Add feature', 'Basic implementation'),
        createMockStep('step-1a', 'Add error handling', 'Handle edge cases discovered during review'),
      ]);

      const result = hasPlanChangedSinceSnapshot(testDir, modifiedPlan);
      expect(result?.changed).toBe(true);
    });

    it('should clean up snapshot after workflow completes', () => {
      const plan = createMockPlan([createMockStep('step-1', 'Title', 'Desc')]);
      savePlanSnapshot(testDir, computePlanHash(plan), 1);

      // Verify snapshot exists
      expect(loadPlanSnapshot(testDir)).not.toBeNull();

      // Clean up after PR is approved/merged
      deletePlanSnapshot(testDir);

      // Verify snapshot is gone
      expect(loadPlanSnapshot(testDir)).toBeNull();
    });
  });
});
