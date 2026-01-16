import {
  BackoutReason,
  BACKOUT_REASONS,
  Session,
} from '../../shared/types/session';

describe('BackoutReason', () => {
  describe('BACKOUT_REASONS constant', () => {
    it('should contain all valid backout reason values', () => {
      expect(BACKOUT_REASONS).toContain('user_requested');
      expect(BACKOUT_REASONS).toContain('blocked');
      expect(BACKOUT_REASONS).toContain('deprioritized');
    });

    it('should have exactly 3 backout reasons', () => {
      expect(BACKOUT_REASONS).toHaveLength(3);
    });

    it('should be a valid array for runtime validation', () => {
      expect(Array.isArray(BACKOUT_REASONS)).toBe(true);
    });
  });

  describe('BackoutReason type', () => {
    it('should accept user_requested as a valid reason', () => {
      const reason: BackoutReason = 'user_requested';
      expect(reason).toBe('user_requested');
      expect(BACKOUT_REASONS.includes(reason)).toBe(true);
    });

    it('should accept blocked as a valid reason', () => {
      const reason: BackoutReason = 'blocked';
      expect(reason).toBe('blocked');
      expect(BACKOUT_REASONS.includes(reason)).toBe(true);
    });

    it('should accept deprioritized as a valid reason', () => {
      const reason: BackoutReason = 'deprioritized';
      expect(reason).toBe('deprioritized');
      expect(BACKOUT_REASONS.includes(reason)).toBe(true);
    });
  });

  describe('Session with backout fields', () => {
    const baseSession: Omit<Session, 'backoutReason' | 'backoutTimestamp'> = {
      version: '1.0.0',
      id: 'test-session-id',
      projectId: 'test-project',
      featureId: 'test-feature',
      title: 'Test Session',
      featureDescription: 'A test session',
      projectPath: '/test/path',
      acceptanceCriteria: [],
      affectedFiles: [],
      technicalNotes: '',
      baseBranch: 'main',
      featureBranch: 'feature/test',
      baseCommitSha: 'abc123',
      status: 'discovery',
      currentStage: 1,
      replanningCount: 0,
      claudeSessionId: null,
      claudePlanFilePath: null,
      currentPlanVersion: 1,
      claudeStage3SessionId: null,
      prUrl: null,
      sessionExpiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should allow session without backout fields (optional fields)', () => {
      const session: Session = { ...baseSession };
      expect(session.backoutReason).toBeUndefined();
      expect(session.backoutTimestamp).toBeUndefined();
    });

    it('should allow session with null backout fields', () => {
      const session: Session = {
        ...baseSession,
        backoutReason: null,
        backoutTimestamp: null,
      };
      expect(session.backoutReason).toBeNull();
      expect(session.backoutTimestamp).toBeNull();
    });

    it('should allow session with user_requested backout reason', () => {
      const timestamp = new Date().toISOString();
      const session: Session = {
        ...baseSession,
        status: 'paused',
        backoutReason: 'user_requested',
        backoutTimestamp: timestamp,
      };
      expect(session.backoutReason).toBe('user_requested');
      expect(session.backoutTimestamp).toBe(timestamp);
    });

    it('should allow session with blocked backout reason', () => {
      const timestamp = new Date().toISOString();
      const session: Session = {
        ...baseSession,
        status: 'paused',
        backoutReason: 'blocked',
        backoutTimestamp: timestamp,
      };
      expect(session.backoutReason).toBe('blocked');
      expect(session.backoutTimestamp).toBe(timestamp);
    });

    it('should allow session with deprioritized backout reason', () => {
      const timestamp = new Date().toISOString();
      const session: Session = {
        ...baseSession,
        status: 'paused',
        backoutReason: 'deprioritized',
        backoutTimestamp: timestamp,
      };
      expect(session.backoutReason).toBe('deprioritized');
      expect(session.backoutTimestamp).toBe(timestamp);
    });

    it('should allow failed session with backout reason', () => {
      const timestamp = new Date().toISOString();
      const session: Session = {
        ...baseSession,
        status: 'failed',
        backoutReason: 'user_requested',
        backoutTimestamp: timestamp,
      };
      expect(session.status).toBe('failed');
      expect(session.backoutReason).toBe('user_requested');
      expect(session.backoutTimestamp).toBe(timestamp);
    });

    it('should support all backout reasons from BACKOUT_REASONS constant', () => {
      const timestamp = new Date().toISOString();
      for (const reason of BACKOUT_REASONS) {
        const session: Session = {
          ...baseSession,
          status: 'paused',
          backoutReason: reason,
          backoutTimestamp: timestamp,
        };
        expect(session.backoutReason).toBe(reason);
        expect(BACKOUT_REASONS.includes(session.backoutReason)).toBe(true);
      }
    });
  });

  describe('Runtime validation helper', () => {
    it('should validate valid backout reasons using BACKOUT_REASONS', () => {
      const isValidBackoutReason = (value: string): value is BackoutReason => {
        return BACKOUT_REASONS.includes(value as BackoutReason);
      };

      expect(isValidBackoutReason('user_requested')).toBe(true);
      expect(isValidBackoutReason('blocked')).toBe(true);
      expect(isValidBackoutReason('deprioritized')).toBe(true);
    });

    it('should reject invalid backout reasons using BACKOUT_REASONS', () => {
      const isValidBackoutReason = (value: string): value is BackoutReason => {
        return BACKOUT_REASONS.includes(value as BackoutReason);
      };

      expect(isValidBackoutReason('invalid_reason')).toBe(false);
      expect(isValidBackoutReason('')).toBe(false);
      expect(isValidBackoutReason('BLOCKED')).toBe(false); // Case-sensitive
    });
  });
});
