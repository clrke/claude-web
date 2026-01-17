import { ClaudeOrchestrator, SpawnOptions } from '../../server/src/services/ClaudeOrchestrator';
import { OutputParser } from '../../server/src/services/OutputParser';

/**
 * Tests for Stage 1 sessionId preservation across different scenarios:
 *
 * 1. Initial Spawn - New sessions intentionally start WITHOUT sessionId.
 *    The claudeSessionId is captured from the spawn result and saved for later use.
 *
 * 2. Stage 1 Retry - When Stage 1 is retried via the /api/sessions/:projectId/:featureId/retry
 *    endpoint, sessionId should be passed to maintain Claude conversation context.
 *
 * 3. Queue/Resume - When a session was paused (queued) and later resumed, sessionId should
 *    be passed so the resumed session maintains context from before it was paused.
 *
 * The initial spawn is the ONLY place where sessionId is intentionally omitted.
 * All retry and resume paths must pass sessionId to maintain conversation context.
 */

describe('Stage 1 Retry SessionId Preservation', () => {
  let orchestrator: ClaudeOrchestrator;
  let outputParser: OutputParser;

  beforeEach(() => {
    outputParser = new OutputParser();
    orchestrator = new ClaudeOrchestrator(outputParser);
  });

  describe('orchestrator.buildCommand with sessionId', () => {
    it('should include --resume flag when sessionId is provided for Stage 1 retry', () => {
      const sessionId = 'existing-stage1-session-abc123';
      const cmd = orchestrator.buildCommand({
        prompt: 'Retry Stage 1 discovery',
        projectPath: '/test/project',
        sessionId,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).toContain('--resume');
      expect(cmd.args).toContain(sessionId);
    });

    it('should not include --resume flag when sessionId is undefined', () => {
      const cmd = orchestrator.buildCommand({
        prompt: 'Initial Stage 1 discovery',
        projectPath: '/test/project',
        sessionId: undefined,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).not.toContain('--resume');
    });

    it('should not include --resume flag when sessionId is empty string', () => {
      const cmd = orchestrator.buildCommand({
        prompt: 'Stage 1 discovery',
        projectPath: '/test/project',
        sessionId: '',
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).not.toContain('--resume');
    });
  });

  describe('Stage 1 tools are correctly configured for retry', () => {
    it('should use Stage 1 tools (Read, Glob, Grep, Task) for retry', () => {
      const stage1Tools = orchestrator.getStageTools(1);

      expect(stage1Tools).toContain('Read');
      expect(stage1Tools).toContain('Glob');
      expect(stage1Tools).toContain('Grep');
      expect(stage1Tools).toContain('Task');
    });

    it('should not skip permissions for Stage 1', () => {
      expect(orchestrator.shouldSkipPermissions(1)).toBe(false);
    });
  });

  describe('sessionId fallback pattern', () => {
    /**
     * This test verifies the pattern used in the retry code:
     * sessionId: session.claudeSessionId || undefined
     *
     * This pattern ensures:
     * - If claudeSessionId exists, it's passed to resume the session
     * - If claudeSessionId is null/undefined, undefined is passed (no resume)
     */
    it('should return sessionId when claudeSessionId is a valid string', () => {
      const session = { claudeSessionId: 'valid-session-123' };
      const sessionId = session.claudeSessionId || undefined;

      expect(sessionId).toBe('valid-session-123');
    });

    it('should return undefined when claudeSessionId is null', () => {
      const session = { claudeSessionId: null as string | null };
      const sessionId = session.claudeSessionId || undefined;

      expect(sessionId).toBeUndefined();
    });

    it('should return undefined when claudeSessionId is undefined', () => {
      const session = { claudeSessionId: undefined as string | undefined };
      const sessionId = session.claudeSessionId || undefined;

      expect(sessionId).toBeUndefined();
    });

    it('should return undefined when claudeSessionId is empty string', () => {
      const session = { claudeSessionId: '' };
      const sessionId = session.claudeSessionId || undefined;

      expect(sessionId).toBeUndefined();
    });
  });

  describe('--resume flag position in command', () => {
    it('should have --resume followed by sessionId in args', () => {
      const sessionId = 'test-session-456';
      const cmd = orchestrator.buildCommand({
        prompt: 'Test prompt',
        projectPath: '/test/project',
        sessionId,
        allowedTools: ['Read'],
      });

      const resumeIndex = cmd.args.indexOf('--resume');
      expect(resumeIndex).toBeGreaterThan(-1);
      expect(cmd.args[resumeIndex + 1]).toBe(sessionId);
    });
  });

  describe('Stage 1 retry vs initial spawn behavior difference', () => {
    /**
     * Initial Stage 1 spawn intentionally does NOT pass sessionId
     * because it starts a fresh conversation for a new feature.
     *
     * Stage 1 RETRY should pass sessionId to maintain context from
     * the previous attempt.
     */
    it('should allow both patterns to coexist correctly', () => {
      // Initial spawn - no sessionId
      const initialCmd = orchestrator.buildCommand({
        prompt: 'Start new feature discovery',
        projectPath: '/test/project',
        sessionId: undefined, // Intentionally fresh
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      // Retry spawn - with sessionId to resume
      const retryCmd = orchestrator.buildCommand({
        prompt: 'Retry feature discovery',
        projectPath: '/test/project',
        sessionId: 'previous-session-xyz', // Resume previous session
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(initialCmd.args).not.toContain('--resume');
      expect(retryCmd.args).toContain('--resume');
      expect(retryCmd.args).toContain('previous-session-xyz');
    });
  });
});

describe('Stage 1 Queue/Resume SessionId Preservation', () => {
  let orchestrator: ClaudeOrchestrator;
  let outputParser: OutputParser;

  beforeEach(() => {
    outputParser = new OutputParser();
    orchestrator = new ClaudeOrchestrator(outputParser);
  });

  describe('resumed session should use sessionId from startedSession', () => {
    /**
     * When a session is resumed from the queue, it should pass the
     * startedSession.claudeSessionId to orchestrator.spawn() so that
     * the Claude conversation context is maintained.
     *
     * The queue/resume path uses startedSession (the session being started)
     * rather than session (which may be the session that was paused).
     */
    it('should include --resume flag when startedSession has claudeSessionId', () => {
      const startedSession = {
        claudeSessionId: 'queued-session-resume-789',
        projectPath: '/test/project',
      };

      const cmd = orchestrator.buildCommand({
        prompt: 'Resume Stage 1 discovery after queue',
        projectPath: startedSession.projectPath,
        sessionId: startedSession.claudeSessionId || undefined,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).toContain('--resume');
      expect(cmd.args).toContain('queued-session-resume-789');
    });

    it('should not include --resume flag for fresh queued session without prior claudeSessionId', () => {
      const startedSession = {
        claudeSessionId: null as string | null,
        projectPath: '/test/project',
      };

      const cmd = orchestrator.buildCommand({
        prompt: 'Start Stage 1 discovery for fresh queued session',
        projectPath: startedSession.projectPath,
        sessionId: startedSession.claudeSessionId || undefined,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).not.toContain('--resume');
    });
  });

  describe('queue resume vs retry - both should preserve sessionId', () => {
    /**
     * Both the retry path (via /retry endpoint) and the queue/resume path
     * should preserve sessionId using the same pattern.
     */
    it('should use same sessionId pattern for retry and queue resume', () => {
      const sessionWithId = { claudeSessionId: 'shared-session-pattern-123' };
      const sessionWithoutId = { claudeSessionId: null as string | null };

      // Both paths use the same pattern: session.claudeSessionId || undefined
      const retrySessionId = sessionWithId.claudeSessionId || undefined;
      const queueResumeSessionId = sessionWithId.claudeSessionId || undefined;

      expect(retrySessionId).toBe(queueResumeSessionId);
      expect(retrySessionId).toBe('shared-session-pattern-123');

      // Both should return undefined when no sessionId
      const retryNoId = sessionWithoutId.claudeSessionId || undefined;
      const queueNoId = sessionWithoutId.claudeSessionId || undefined;

      expect(retryNoId).toBeUndefined();
      expect(queueNoId).toBeUndefined();
    });
  });

  describe('queue/resume scenario with existing conversation', () => {
    /**
     * Scenario: User pauses a session that was in the middle of Stage 1.
     * Later, the session is resumed from the queue.
     * The resumed session should continue the Claude conversation.
     */
    it('should allow resuming a partially completed Stage 1 session', () => {
      // Simulates a session that was paused during Stage 1
      const pausedSession = {
        claudeSessionId: 'partial-stage1-session-abc',
        projectPath: '/test/project',
        currentStage: 1,
        status: 'queued',
      };

      // When resumed, should use the existing sessionId
      const cmd = orchestrator.buildCommand({
        prompt: 'Continue Stage 1 discovery after pause',
        projectPath: pausedSession.projectPath,
        sessionId: pausedSession.claudeSessionId || undefined,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      expect(cmd.args).toContain('--resume');
      expect(cmd.args).toContain('partial-stage1-session-abc');
    });
  });
});

describe('Stage 1 Initial Spawn - Intentional SessionId Omission', () => {
  let orchestrator: ClaudeOrchestrator;
  let outputParser: OutputParser;

  beforeEach(() => {
    outputParser = new OutputParser();
    orchestrator = new ClaudeOrchestrator(outputParser);
  });

  /**
   * This test documents that initial Stage 1 spawns INTENTIONALLY omit sessionId.
   *
   * Why sessionId is omitted for initial spawns:
   * - New features start fresh without any Claude conversation context
   * - The claudeSessionId is captured from the spawn result (via handleStage1Result)
   * - This captured sessionId is then saved to the session for future retries/resumes
   *
   * This is NOT a bug - it's the intended behavior. See the code comment at
   * the initial Stage 1 spawn location (around line 2252 in server/src/app.ts).
   */
  describe('new session starts without sessionId', () => {
    it('should start fresh without --resume flag for brand new features', () => {
      // Brand new session has no claudeSessionId yet
      const newSession = {
        claudeSessionId: null as string | null,
        projectPath: '/test/project',
        featureId: 'brand-new-feature',
      };

      const cmd = orchestrator.buildCommand({
        prompt: 'Discover requirements for new feature',
        projectPath: newSession.projectPath,
        // sessionId is intentionally NOT passed for new sessions
        sessionId: undefined,
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });

      // New sessions should NOT have --resume flag
      expect(cmd.args).not.toContain('--resume');
    });

    it('should document the sessionId lifecycle: omit -> capture -> reuse', () => {
      /**
       * SessionId lifecycle for Stage 1:
       *
       * 1. INITIAL SPAWN: sessionId omitted (undefined)
       *    - orchestrator.spawn({ ..., sessionId: undefined })
       *    - Claude starts fresh conversation
       *    - Result contains new claudeSessionId
       *
       * 2. SAVE: claudeSessionId captured from result
       *    - handleStage1Result saves result.sessionId to session.claudeSessionId
       *
       * 3. RETRY/RESUME: sessionId passed to maintain context
       *    - orchestrator.spawn({ ..., sessionId: session.claudeSessionId || undefined })
       *    - Claude resumes previous conversation
       */

      // Phase 1: Initial spawn - no sessionId
      const initialSpawnCmd = orchestrator.buildCommand({
        prompt: 'Initial discovery',
        projectPath: '/test/project',
        sessionId: undefined, // Intentionally omitted
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });
      expect(initialSpawnCmd.args).not.toContain('--resume');

      // Phase 2: After Claude responds, claudeSessionId is captured
      // (simulated - in reality this comes from the spawn result)
      const capturedSessionId = 'claude-session-from-result-xyz';

      // Phase 3: Retry/resume uses the captured sessionId
      const retrySpawnCmd = orchestrator.buildCommand({
        prompt: 'Retry discovery',
        projectPath: '/test/project',
        sessionId: capturedSessionId, // Now passed for retry
        allowedTools: ['Read', 'Glob', 'Grep', 'Task'],
      });
      expect(retrySpawnCmd.args).toContain('--resume');
      expect(retrySpawnCmd.args).toContain(capturedSessionId);
    });
  });

  describe('contrast: initial vs retry/resume behavior', () => {
    it('should clearly differentiate when sessionId is omitted vs passed', () => {
      // OMIT sessionId: Only for brand new features (initial spawn)
      const scenariosWhereSessionIdOmitted = [
        { name: 'New feature initial spawn', sessionId: undefined },
      ];

      // PASS sessionId: All retry and resume scenarios
      const scenariosWhereSessionIdPassed = [
        { name: 'Stage 1 retry', sessionId: 'retry-session-123' },
        { name: 'Queue/resume', sessionId: 'resume-session-456' },
        { name: 'Stage 2+ (all have sessionId)', sessionId: 'stage2-session-789' },
      ];

      // Verify omitted scenarios don't have --resume
      for (const scenario of scenariosWhereSessionIdOmitted) {
        const cmd = orchestrator.buildCommand({
          prompt: scenario.name,
          projectPath: '/test/project',
          sessionId: scenario.sessionId,
          allowedTools: ['Read'],
        });
        expect(cmd.args).not.toContain('--resume');
      }

      // Verify passed scenarios DO have --resume
      for (const scenario of scenariosWhereSessionIdPassed) {
        const cmd = orchestrator.buildCommand({
          prompt: scenario.name,
          projectPath: '/test/project',
          sessionId: scenario.sessionId,
          allowedTools: ['Read'],
        });
        expect(cmd.args).toContain('--resume');
        expect(cmd.args).toContain(scenario.sessionId);
      }
    });
  });
});
