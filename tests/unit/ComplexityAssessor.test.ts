import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import type { AcceptanceCriterion } from '@claude-code-web/shared';

// Mock child_process.spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
import { ComplexityAssessor } from '../../server/src/services/ComplexityAssessor';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('ComplexityAssessor', () => {
  let assessor: ComplexityAssessor;
  let mockChildProcess: EventEmitter & Partial<ChildProcess>;

  const mockTitle = 'Change button label';
  const mockDescription = 'Update the submit button text from "Submit" to "Save"';
  const mockCriteria: AcceptanceCriterion[] = [
    { text: 'Button shows "Save" text', checked: false, type: 'manual' },
  ];

  beforeEach(() => {
    assessor = new ComplexityAssessor();
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter() as any;
    mockChildProcess.kill = jest.fn();

    mockSpawn.mockReturnValue(mockChildProcess as ChildProcess);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assess', () => {
    it('should return trivial complexity for simple changes', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'trivial',
          reason: 'Single button label change - one file, one line',
          suggestedAgents: ['frontend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('trivial');
      expect(result.reason).toBe('Single button label change - one file, one line');
      expect(result.suggestedAgents).toEqual(['frontend']);
      expect(result.useLeanPrompts).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return simple complexity with appropriate agents', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'simple',
          reason: 'Localized UI change with styling update',
          suggestedAgents: ['frontend', 'testing'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('simple');
      expect(result.suggestedAgents).toEqual(['frontend', 'testing']);
      expect(result.useLeanPrompts).toBe(true);
    });

    it('should return normal complexity for standard features', async () => {
      const resultPromise = assessor.assess(
        'Add new API endpoint',
        'Create a REST endpoint for user preferences',
        [{ text: 'Endpoint returns user prefs', checked: false, type: 'manual' }],
        '/project'
      );

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'normal',
          reason: 'New API endpoint with backend logic and tests',
          suggestedAgents: ['backend', 'database', 'testing'],
          useLeanPrompts: false,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.suggestedAgents).toEqual(['backend', 'database', 'testing']);
      expect(result.useLeanPrompts).toBe(false);
    });

    it('should return complex complexity for large features', async () => {
      const resultPromise = assessor.assess(
        'Add authentication system',
        'Implement OAuth2 with JWT tokens',
        [],
        '/project'
      );

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'complex',
          reason: 'Cross-cutting authentication system affecting many files',
          suggestedAgents: ['frontend', 'backend', 'database', 'testing', 'infrastructure', 'documentation'],
          useLeanPrompts: false,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('complex');
      expect(result.suggestedAgents).toHaveLength(6);
      expect(result.useLeanPrompts).toBe(false);
    });

    it('should use normal complexity conservatively on timeout', async () => {
      jest.useFakeTimers();

      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      // Advance past the 2-minute timeout
      jest.advanceTimersByTime(120_001);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.reason).toContain('timed out');
      expect(result.suggestedAgents).toHaveLength(4);
      expect(result.useLeanPrompts).toBe(false);
      expect(mockChildProcess.kill).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should use normal complexity conservatively on process error', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      mockChildProcess.emit('close', 1);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.reason).toContain('failed (code 1)');
      expect(result.suggestedAgents).toHaveLength(4);
    });

    it('should use normal complexity conservatively on spawn error', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      mockChildProcess.emit('error', new Error('spawn ENOENT'));

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.reason).toContain('spawn error');
      expect(result.suggestedAgents).toHaveLength(4);
    });

    it('should use normal complexity conservatively on invalid JSON response', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      mockChildProcess.stdout!.emit('data', Buffer.from('not valid json'));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.reason).toContain('parse');
    });

    it('should use normal complexity when JSON lacks required fields', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: '{"something": "else"}',
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
      expect(result.reason).toContain('parse');
    });

    it('should spawn claude with correct arguments', async () => {
      assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      expect(mockSpawn).toHaveBeenCalledWith('claude', expect.arrayContaining([
        '--print',
        '--output-format', 'json',
        '--model', 'haiku',
        '--allowedTools', 'Read,Glob,Grep',
        '-p', expect.any(String),
      ]), expect.objectContaining({
        cwd: '/project',
      }));
    });

    it('should include prompt and output in result', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'simple',
          reason: 'Simple change',
          suggestedAgents: ['frontend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.prompt).toBeDefined();
      expect(result.prompt.length).toBeGreaterThan(0);
      expect(result.output).toBe(response);
    });

    it('should handle response with extra text around JSON', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: 'Here is my assessment:\n\n{"complexity": "trivial", "reason": "Single line change"}\n\nLet me know if you need more info.',
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('trivial');
      expect(result.reason).toBe('Single line change');
    });

    it('should filter invalid agent types from response', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'simple',
          reason: 'Simple change',
          suggestedAgents: ['frontend', 'invalid_agent', 'backend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.suggestedAgents).toEqual(['frontend', 'backend']);
      expect(result.suggestedAgents).not.toContain('invalid_agent');
    });

    it('should provide default agents when suggestedAgents is empty', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'simple',
          reason: 'Simple change',
          suggestedAgents: [],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.suggestedAgents.length).toBeGreaterThan(0);
    });

    it('should provide default agents when suggestedAgents is not an array', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'normal',
          reason: 'Normal change',
          suggestedAgents: 'frontend', // Wrong type - should be array
          useLeanPrompts: false,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(Array.isArray(result.suggestedAgents)).toBe(true);
      expect(result.suggestedAgents.length).toBeGreaterThan(0);
    });

    it('should infer useLeanPrompts from complexity when not provided', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'trivial',
          reason: 'Trivial change',
          suggestedAgents: ['frontend'],
          // useLeanPrompts not provided - should be inferred as true for trivial
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.useLeanPrompts).toBe(true);
    });

    it('should infer useLeanPrompts as false for normal/complex', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'complex',
          reason: 'Complex change',
          suggestedAgents: ['frontend', 'backend'],
          // useLeanPrompts not provided - should be inferred as false for complex
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.useLeanPrompts).toBe(false);
    });

    it('should handle invalid complexity value by falling back to normal', async () => {
      const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'invalid_complexity',
          reason: 'Some reason',
          suggestedAgents: ['frontend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('normal');
    });

    it('should handle empty acceptance criteria', async () => {
      const resultPromise = assessor.assess(
        'Simple title',
        'Simple description',
        [], // Empty criteria
        '/project'
      );

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'trivial',
          reason: 'No criteria, simple change',
          suggestedAgents: ['frontend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.complexity).toBe('trivial');
      // Verify the prompt was built correctly (it should contain "No acceptance criteria specified")
      expect(result.prompt).toContain('No acceptance criteria specified');
    });

    it('should include acceptance criteria in prompt', async () => {
      const criteria: AcceptanceCriterion[] = [
        { text: 'First criterion', checked: false, type: 'manual' },
        { text: 'Second criterion', checked: false, type: 'manual' },
      ];

      const resultPromise = assessor.assess('Title', 'Description', criteria, '/project');

      const response = JSON.stringify({
        result: JSON.stringify({
          complexity: 'simple',
          reason: 'Simple change',
          suggestedAgents: ['frontend'],
          useLeanPrompts: true,
        }),
      });
      mockChildProcess.stdout!.emit('data', Buffer.from(response));
      mockChildProcess.emit('close', 0);

      const result = await resultPromise;

      expect(result.prompt).toContain('First criterion');
      expect(result.prompt).toContain('Second criterion');
    });
  });

  describe('default agents for complexity', () => {
    it('should provide appropriate agents for each complexity level on fallback', async () => {
      // Test each complexity level's default agents
      const complexityTests = [
        { complexity: 'trivial', expectedCount: 1 },
        { complexity: 'simple', expectedCount: 2 },
        { complexity: 'normal', expectedCount: 4 },
        { complexity: 'complex', expectedCount: 6 },
      ];

      for (const test of complexityTests) {
        const resultPromise = assessor.assess(mockTitle, mockDescription, mockCriteria, '/project');

        const response = JSON.stringify({
          result: JSON.stringify({
            complexity: test.complexity,
            reason: `${test.complexity} change`,
            suggestedAgents: [], // Empty to trigger default
            useLeanPrompts: test.complexity === 'trivial' || test.complexity === 'simple',
          }),
        });
        mockChildProcess.stdout!.emit('data', Buffer.from(response));
        mockChildProcess.emit('close', 0);

        const result = await resultPromise;

        expect(result.suggestedAgents.length).toBe(test.expectedCount);

        // Reset for next test
        mockChildProcess = new EventEmitter();
        mockChildProcess.stdout = new EventEmitter() as any;
        mockChildProcess.stderr = new EventEmitter() as any;
        mockChildProcess.kill = jest.fn();
        mockSpawn.mockReturnValue(mockChildProcess as ChildProcess);
      }
    });
  });
});
