import { UserPreferencesSchema, UserPreferencesInput } from '../../server/src/validation/schemas';
import { DEFAULT_USER_PREFERENCES } from '../../shared/types';

describe('UserPreferencesSchema', () => {
  describe('valid inputs', () => {
    it('should accept default preferences', () => {
      const result = UserPreferencesSchema.safeParse(DEFAULT_USER_PREFERENCES);
      expect(result.success).toBe(true);
    });

    it('should accept all valid riskComfort values', () => {
      const values: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
      for (const riskComfort of values) {
        const result = UserPreferencesSchema.safeParse({
          ...DEFAULT_USER_PREFERENCES,
          riskComfort,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.riskComfort).toBe(riskComfort);
        }
      }
    });

    it('should accept all valid speedVsQuality values', () => {
      const values: Array<'speed' | 'balanced' | 'quality'> = ['speed', 'balanced', 'quality'];
      for (const speedVsQuality of values) {
        const result = UserPreferencesSchema.safeParse({
          ...DEFAULT_USER_PREFERENCES,
          speedVsQuality,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.speedVsQuality).toBe(speedVsQuality);
        }
      }
    });

    it('should accept all valid scopeFlexibility values', () => {
      const values: Array<'fixed' | 'flexible' | 'open'> = ['fixed', 'flexible', 'open'];
      for (const scopeFlexibility of values) {
        const result = UserPreferencesSchema.safeParse({
          ...DEFAULT_USER_PREFERENCES,
          scopeFlexibility,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.scopeFlexibility).toBe(scopeFlexibility);
        }
      }
    });

    it('should accept all valid detailLevel values', () => {
      const values: Array<'minimal' | 'standard' | 'detailed'> = ['minimal', 'standard', 'detailed'];
      for (const detailLevel of values) {
        const result = UserPreferencesSchema.safeParse({
          ...DEFAULT_USER_PREFERENCES,
          detailLevel,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.detailLevel).toBe(detailLevel);
        }
      }
    });

    it('should accept all valid autonomyLevel values', () => {
      const values: Array<'guided' | 'collaborative' | 'autonomous'> = ['guided', 'collaborative', 'autonomous'];
      for (const autonomyLevel of values) {
        const result = UserPreferencesSchema.safeParse({
          ...DEFAULT_USER_PREFERENCES,
          autonomyLevel,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.autonomyLevel).toBe(autonomyLevel);
        }
      }
    });
  });

  describe('invalid inputs', () => {
    it('should reject invalid riskComfort value', () => {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        riskComfort: 'extreme',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid speedVsQuality value', () => {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        speedVsQuality: 'fast',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid scopeFlexibility value', () => {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        scopeFlexibility: 'strict',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid detailLevel value', () => {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        detailLevel: 'verbose',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid autonomyLevel value', () => {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        autonomyLevel: 'full',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing riskComfort field', () => {
      const { riskComfort, ...rest } = DEFAULT_USER_PREFERENCES;
      const result = UserPreferencesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing speedVsQuality field', () => {
      const { speedVsQuality, ...rest } = DEFAULT_USER_PREFERENCES;
      const result = UserPreferencesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing scopeFlexibility field', () => {
      const { scopeFlexibility, ...rest } = DEFAULT_USER_PREFERENCES;
      const result = UserPreferencesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing detailLevel field', () => {
      const { detailLevel, ...rest } = DEFAULT_USER_PREFERENCES;
      const result = UserPreferencesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing autonomyLevel field', () => {
      const { autonomyLevel, ...rest } = DEFAULT_USER_PREFERENCES;
      const result = UserPreferencesSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject empty object', () => {
      const result = UserPreferencesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject null', () => {
      const result = UserPreferencesSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined', () => {
      const result = UserPreferencesSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('type inference', () => {
    it('should produce correct inferred type', () => {
      // This test verifies the exported type works correctly
      const prefs: UserPreferencesInput = {
        riskComfort: 'high',
        speedVsQuality: 'quality',
        scopeFlexibility: 'open',
        detailLevel: 'detailed',
        autonomyLevel: 'autonomous',
      };

      const result = UserPreferencesSchema.safeParse(prefs);
      expect(result.success).toBe(true);
      if (result.success) {
        // Verify the parsed data matches
        expect(result.data).toEqual(prefs);
      }
    });
  });
});
