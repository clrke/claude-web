/**
 * Tests that UserPreferences type and DEFAULT_USER_PREFERENCES constant
 * are properly exported from the shared types barrel (index.ts)
 */
import {
  UserPreferences,
  DEFAULT_USER_PREFERENCES,
  Session,
} from '../../shared/types';

describe('UserPreferences exports from barrel', () => {
  describe('UserPreferences type export', () => {
    it('should be importable from shared/types barrel', () => {
      // Type assertion - if this compiles, the export works
      const prefs: UserPreferences = {
        riskComfort: 'medium',
        speedVsQuality: 'balanced',
        scopeFlexibility: 'flexible',
        detailLevel: 'standard',
        autonomyLevel: 'collaborative',
      };
      expect(prefs).toBeDefined();
    });

    it('should work with all valid values for each field', () => {
      // riskComfort values
      const lowRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'low' };
      const highRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'high' };

      // speedVsQuality values
      const speed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, speedVsQuality: 'speed' };
      const quality: UserPreferences = { ...DEFAULT_USER_PREFERENCES, speedVsQuality: 'quality' };

      // scopeFlexibility values
      const fixed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'fixed' };
      const open: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'open' };

      // detailLevel values
      const minimal: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'minimal' };
      const detailed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'detailed' };

      // autonomyLevel values
      const guided: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'guided' };
      const autonomous: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'autonomous' };

      expect(lowRisk.riskComfort).toBe('low');
      expect(highRisk.riskComfort).toBe('high');
      expect(speed.speedVsQuality).toBe('speed');
      expect(quality.speedVsQuality).toBe('quality');
      expect(fixed.scopeFlexibility).toBe('fixed');
      expect(open.scopeFlexibility).toBe('open');
      expect(minimal.detailLevel).toBe('minimal');
      expect(detailed.detailLevel).toBe('detailed');
      expect(guided.autonomyLevel).toBe('guided');
      expect(autonomous.autonomyLevel).toBe('autonomous');
    });
  });

  describe('DEFAULT_USER_PREFERENCES export', () => {
    it('should be importable from shared/types barrel', () => {
      expect(DEFAULT_USER_PREFERENCES).toBeDefined();
    });

    it('should have all default values', () => {
      expect(DEFAULT_USER_PREFERENCES.riskComfort).toBe('medium');
      expect(DEFAULT_USER_PREFERENCES.speedVsQuality).toBe('balanced');
      expect(DEFAULT_USER_PREFERENCES.scopeFlexibility).toBe('flexible');
      expect(DEFAULT_USER_PREFERENCES.detailLevel).toBe('standard');
      expect(DEFAULT_USER_PREFERENCES.autonomyLevel).toBe('collaborative');
    });

    it('should be assignable to UserPreferences type', () => {
      const prefs: UserPreferences = DEFAULT_USER_PREFERENCES;
      expect(prefs).toEqual(DEFAULT_USER_PREFERENCES);
    });
  });

  describe('Session type with preferences from barrel', () => {
    it('should allow Session with preferences imported from barrel', () => {
      const session: Partial<Session> = {
        id: 'test-id',
        preferences: DEFAULT_USER_PREFERENCES,
      };
      expect(session.preferences).toEqual(DEFAULT_USER_PREFERENCES);
    });

    it('should allow Session without preferences (optional)', () => {
      const session: Partial<Session> = {
        id: 'test-id',
      };
      expect(session.preferences).toBeUndefined();
    });
  });
});
