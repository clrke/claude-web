import { UserPreferences, DEFAULT_USER_PREFERENCES } from '../types/session';

/**
 * Valid values for each preference field
 */
const VALID_RISK_COMFORT = ['low', 'medium', 'high'] as const;
const VALID_SPEED_VS_QUALITY = ['speed', 'balanced', 'quality'] as const;
const VALID_SCOPE_FLEXIBILITY = ['fixed', 'flexible', 'open'] as const;
const VALID_DETAIL_LEVEL = ['minimal', 'standard', 'detailed'] as const;
const VALID_AUTONOMY_LEVEL = ['guided', 'collaborative', 'autonomous'] as const;

/**
 * Validate and sanitize user preferences.
 * Returns valid preferences with defaults applied for invalid/missing values.
 *
 * @param data - Raw data that may or may not be valid UserPreferences
 * @returns Valid UserPreferences object with defaults for invalid values
 */
export function validatePreferences(data: unknown): UserPreferences {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  const input = data as Record<string, unknown>;

  return {
    riskComfort: VALID_RISK_COMFORT.includes(input.riskComfort as typeof VALID_RISK_COMFORT[number])
      ? (input.riskComfort as UserPreferences['riskComfort'])
      : DEFAULT_USER_PREFERENCES.riskComfort,

    speedVsQuality: VALID_SPEED_VS_QUALITY.includes(input.speedVsQuality as typeof VALID_SPEED_VS_QUALITY[number])
      ? (input.speedVsQuality as UserPreferences['speedVsQuality'])
      : DEFAULT_USER_PREFERENCES.speedVsQuality,

    scopeFlexibility: VALID_SCOPE_FLEXIBILITY.includes(input.scopeFlexibility as typeof VALID_SCOPE_FLEXIBILITY[number])
      ? (input.scopeFlexibility as UserPreferences['scopeFlexibility'])
      : DEFAULT_USER_PREFERENCES.scopeFlexibility,

    detailLevel: VALID_DETAIL_LEVEL.includes(input.detailLevel as typeof VALID_DETAIL_LEVEL[number])
      ? (input.detailLevel as UserPreferences['detailLevel'])
      : DEFAULT_USER_PREFERENCES.detailLevel,

    autonomyLevel: VALID_AUTONOMY_LEVEL.includes(input.autonomyLevel as typeof VALID_AUTONOMY_LEVEL[number])
      ? (input.autonomyLevel as UserPreferences['autonomyLevel'])
      : DEFAULT_USER_PREFERENCES.autonomyLevel,
  };
}

/**
 * Check if preferences data is valid (all fields have valid values)
 */
export function isValidPreferences(data: unknown): data is UserPreferences {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const input = data as Record<string, unknown>;

  return (
    VALID_RISK_COMFORT.includes(input.riskComfort as typeof VALID_RISK_COMFORT[number]) &&
    VALID_SPEED_VS_QUALITY.includes(input.speedVsQuality as typeof VALID_SPEED_VS_QUALITY[number]) &&
    VALID_SCOPE_FLEXIBILITY.includes(input.scopeFlexibility as typeof VALID_SCOPE_FLEXIBILITY[number]) &&
    VALID_DETAIL_LEVEL.includes(input.detailLevel as typeof VALID_DETAIL_LEVEL[number]) &&
    VALID_AUTONOMY_LEVEL.includes(input.autonomyLevel as typeof VALID_AUTONOMY_LEVEL[number])
  );
}
