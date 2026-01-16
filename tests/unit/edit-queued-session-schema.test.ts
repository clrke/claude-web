import { EditQueuedSessionInputSchema, EditQueuedSessionInput, UserPreferencesSchema } from '../../server/src/validation/schemas';
import { DEFAULT_USER_PREFERENCES } from '../../shared/types';

describe('EditQueuedSessionInputSchema', () => {
  // Valid base input for tests
  const validInput: EditQueuedSessionInput = {
    dataVersion: 1,
    title: 'Updated Title',
    featureDescription: 'Updated description',
  };

  describe('dataVersion field (required)', () => {
    it('should accept valid dataVersion number', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: 1 });
      expect(result.success).toBe(true);
    });

    it('should accept large dataVersion numbers', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: 999999 });
      expect(result.success).toBe(true);
    });

    it('should reject missing dataVersion', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ title: 'Test' });
      expect(result.success).toBe(false);
    });

    it('should reject dataVersion 0', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative dataVersion', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer dataVersion', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: 1.5 });
      expect(result.success).toBe(false);
    });

    it('should reject string dataVersion', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: '1' });
      expect(result.success).toBe(false);
    });
  });

  describe('title field (optional)', () => {
    it('should accept valid title', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: 'New Feature Title',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('New Feature Title');
      }
    });

    it('should trim title whitespace', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: '  Trimmed Title  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Trimmed Title');
      }
    });

    it('should accept title without providing other fields', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: 'Just a title',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title over 200 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should accept title at exactly 200 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: 'a'.repeat(200),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('featureDescription field (optional)', () => {
    it('should accept valid description', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        featureDescription: 'A detailed feature description',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.featureDescription).toBe('A detailed feature description');
      }
    });

    it('should trim description whitespace', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        featureDescription: '  Trimmed description  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.featureDescription).toBe('Trimmed description');
      }
    });

    it('should reject empty description', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        featureDescription: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject description over 10000 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        featureDescription: 'a'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept description at exactly 10000 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        featureDescription: 'a'.repeat(10000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('acceptanceCriteria field (optional)', () => {
    it('should accept valid acceptance criteria array', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [
          { text: 'Criterion 1', checked: false, type: 'manual' },
          { text: 'Criterion 2', checked: true, type: 'automated' },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acceptanceCriteria).toHaveLength(2);
      }
    });

    it('should accept empty acceptance criteria array', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [],
      });
      expect(result.success).toBe(true);
    });

    it('should accept criteria with minimal fields', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [{ text: 'Simple criterion' }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // Defaults should be applied
        expect(result.data.acceptanceCriteria?.[0].checked).toBe(false);
        expect(result.data.acceptanceCriteria?.[0].type).toBe('manual');
      }
    });

    it('should reject criterion with empty text', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [{ text: '' }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject criterion with text over 500 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [{ text: 'a'.repeat(501) }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid criterion type', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        acceptanceCriteria: [{ text: 'Test', type: 'invalid' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('affectedFiles field (optional)', () => {
    it('should accept valid affected files array', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        affectedFiles: ['src/app.ts', 'src/utils/helper.ts'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.affectedFiles).toHaveLength(2);
      }
    });

    it('should accept empty affected files array', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        affectedFiles: [],
      });
      expect(result.success).toBe(true);
    });

    it('should reject absolute paths in affected files', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        affectedFiles: ['/absolute/path/file.ts'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty string in affected files', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        affectedFiles: [''],
      });
      expect(result.success).toBe(false);
    });

    it('should reject affected file path over 500 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        affectedFiles: ['a'.repeat(501)],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('technicalNotes field (optional)', () => {
    it('should accept valid technical notes', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        technicalNotes: 'Some technical notes here',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.technicalNotes).toBe('Some technical notes here');
      }
    });

    it('should trim technical notes whitespace', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        technicalNotes: '  Trimmed notes  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.technicalNotes).toBe('Trimmed notes');
      }
    });

    it('should accept empty technical notes', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        technicalNotes: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.technicalNotes).toBe('');
      }
    });

    it('should reject technical notes over 5000 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        technicalNotes: 'a'.repeat(5001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept technical notes at exactly 5000 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        technicalNotes: 'a'.repeat(5000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('baseBranch field (optional)', () => {
    it('should accept valid branch name', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'main',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseBranch).toBe('main');
      }
    });

    it('should accept branch with slashes', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'feature/new-feature',
      });
      expect(result.success).toBe(true);
    });

    it('should accept branch with dots and underscores', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'release_v1.2.3',
      });
      expect(result.success).toBe(true);
    });

    it('should accept branch with hyphens', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'my-branch-name',
      });
      expect(result.success).toBe(true);
    });

    it('should reject branch with spaces', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'my branch',
      });
      expect(result.success).toBe(false);
    });

    it('should reject branch with special characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'branch@name',
      });
      expect(result.success).toBe(false);
    });

    it('should reject branch name over 100 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should accept branch name at exactly 100 characters', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        baseBranch: 'a'.repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('preferences field (optional)', () => {
    it('should accept valid preferences', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        preferences: DEFAULT_USER_PREFERENCES,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferences).toEqual(DEFAULT_USER_PREFERENCES);
      }
    });

    it('should accept preferences with all fields', () => {
      const customPrefs = {
        riskComfort: 'high' as const,
        speedVsQuality: 'quality' as const,
        scopeFlexibility: 'open' as const,
        detailLevel: 'detailed' as const,
        autonomyLevel: 'autonomous' as const,
      };
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        preferences: customPrefs,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferences).toEqual(customPrefs);
      }
    });

    it('should reject preferences with missing fields', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        preferences: { riskComfort: 'high' }, // missing other required fields
      });
      expect(result.success).toBe(false);
    });

    it('should reject preferences with invalid values', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        preferences: {
          ...DEFAULT_USER_PREFERENCES,
          riskComfort: 'extreme', // invalid value
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('strict mode (rejects unknown fields)', () => {
    it('should reject unknown fields', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        title: 'Test',
        unknownField: 'value',
      });
      expect(result.success).toBe(false);
    });

    it('should reject status field (internal, not editable)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        status: 'queued',
      });
      expect(result.success).toBe(false);
    });

    it('should reject currentStage field (internal, not editable)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        currentStage: 2,
      });
      expect(result.success).toBe(false);
    });

    it('should reject queuePosition field (internal, not editable)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        queuePosition: 5,
      });
      expect(result.success).toBe(false);
    });

    it('should reject claudeSessionId field (internal, not editable)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        claudeSessionId: 'session-123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject projectPath field (immutable)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 1,
        projectPath: '/some/path',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('combined valid inputs', () => {
    it('should accept all optional fields together', () => {
      const fullInput = {
        dataVersion: 1,
        title: 'Complete Feature',
        featureDescription: 'A complete feature description',
        acceptanceCriteria: [
          { text: 'AC 1', checked: false, type: 'manual' as const },
          { text: 'AC 2', checked: true, type: 'automated' as const },
        ],
        affectedFiles: ['src/app.ts', 'tests/app.test.ts'],
        technicalNotes: 'Some technical notes',
        baseBranch: 'develop',
        preferences: DEFAULT_USER_PREFERENCES,
      };

      const result = EditQueuedSessionInputSchema.safeParse(fullInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataVersion).toBe(1);
        expect(result.data.title).toBe('Complete Feature');
        expect(result.data.featureDescription).toBe('A complete feature description');
        expect(result.data.acceptanceCriteria).toHaveLength(2);
        expect(result.data.affectedFiles).toHaveLength(2);
        expect(result.data.technicalNotes).toBe('Some technical notes');
        expect(result.data.baseBranch).toBe('develop');
        expect(result.data.preferences).toEqual(DEFAULT_USER_PREFERENCES);
      }
    });

    it('should accept just dataVersion (minimum valid input)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({ dataVersion: 1 });
      expect(result.success).toBe(true);
    });

    it('should accept dataVersion with single content field', () => {
      const result = EditQueuedSessionInputSchema.safeParse({
        dataVersion: 2,
        title: 'Just updating the title',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('type inference', () => {
    it('should produce correct inferred type', () => {
      const input: EditQueuedSessionInput = {
        dataVersion: 1,
        title: 'Test Title',
        featureDescription: 'Test description',
      };

      const result = EditQueuedSessionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dataVersion).toBe(1);
        expect(result.data.title).toBe('Test Title');
        expect(result.data.featureDescription).toBe('Test description');
      }
    });
  });

  describe('edge cases', () => {
    it('should reject null input', () => {
      const result = EditQueuedSessionInputSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('should reject undefined input', () => {
      const result = EditQueuedSessionInputSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('should reject empty object (missing dataVersion)', () => {
      const result = EditQueuedSessionInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject array input', () => {
      const result = EditQueuedSessionInputSchema.safeParse([{ dataVersion: 1 }]);
      expect(result.success).toBe(false);
    });

    it('should reject string input', () => {
      const result = EditQueuedSessionInputSchema.safeParse('dataVersion: 1');
      expect(result.success).toBe(false);
    });
  });
});
