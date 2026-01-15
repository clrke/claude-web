import {
  buildDecisionValidationPrompt,
  buildTestRequirementPrompt,
  buildIncompleteStepsPrompt,
} from '../../server/src/prompts/validationPrompts';
import { Plan, UserPreferences, DEFAULT_USER_PREFERENCES } from '@claude-code-web/shared';
import { ParsedDecision } from '../../server/src/services/OutputParser';

describe('Validation Prompts', () => {
  const mockPlan: Plan = {
    version: '1.0',
    planVersion: 1,
    sessionId: 'test-session-id',
    isApproved: false,
    reviewCount: 0,
    createdAt: '2026-01-11T00:00:00Z',
    steps: [
      {
        id: 'step-1',
        title: 'Set up authentication middleware',
        description: 'Create JWT validation middleware for protected routes',
        status: 'pending',
        order: 1,
      },
      {
        id: 'step-2',
        title: 'Implement login endpoint',
        description: 'Create POST /api/login endpoint with email/password validation',
        status: 'pending',
        order: 2,
      },
    ],
  };

  const mockDecision: ParsedDecision = {
    questionText: 'Should we add rate limiting to the login endpoint?',
    category: 'scope',
    priority: 2,
    options: [
      { label: 'Yes, add rate limiting', recommended: true },
      { label: 'No, skip for now', recommended: false },
    ],
    file: 'src/routes/login.ts',
    line: 42,
  };

  describe('buildDecisionValidationPrompt', () => {
    describe('without preferences', () => {
      it('should include plan steps', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).toContain('Set up authentication middleware');
        expect(prompt).toContain('Implement login endpoint');
      });

      it('should include decision details', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).toContain('Should we add rate limiting');
        expect(prompt).toContain('Category: scope');
        expect(prompt).toContain('Priority: 2');
      });

      it('should include file context when provided', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).toContain('src/routes/login.ts');
        expect(prompt).toContain(':42');
      });

      it('should include options', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).toContain('Yes, add rate limiting');
        expect(prompt).toContain('(recommended)');
        expect(prompt).toContain('No, skip for now');
      });

      it('should not include preferences section when not provided', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).not.toContain('## User Preferences');
        expect(prompt).not.toContain('## Preference-Based Filtering Rules');
      });

      it('should include response format instructions', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan);

        expect(prompt).toContain('"action": "pass"');
        expect(prompt).toContain('"action": "filter"');
        expect(prompt).toContain('"action": "repurpose"');
      });
    });

    describe('with preferences', () => {
      it('should include preferences section when provided', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, DEFAULT_USER_PREFERENCES);

        expect(prompt).toContain('## User Preferences');
        expect(prompt).toContain('Risk Comfort: medium');
        expect(prompt).toContain('Speed vs Quality: balanced');
        expect(prompt).toContain('Scope Flexibility: flexible');
        expect(prompt).toContain('Detail Level: standard');
        expect(prompt).toContain('Autonomy Level: collaborative');
      });

      it('should include preference-based filtering rules', () => {
        const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, DEFAULT_USER_PREFERENCES);

        expect(prompt).toContain('## Preference-Based Filtering Rules');
        expect(prompt).toContain('Scope Flexibility (flexible)');
        expect(prompt).toContain('Detail Level (standard)');
        expect(prompt).toContain('Risk Comfort (medium)');
        expect(prompt).toContain('Autonomy Level (collaborative)');
      });

      it('should include risk comfort description', () => {
        const lowRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'low' };
        const highRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'high' };

        const lowPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, lowRisk);
        const highPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, highRisk);

        expect(lowPrompt).toContain('prefers conservative, well-tested approaches');
        expect(highPrompt).toContain('comfortable with experimental approaches');
      });

      it('should include scope flexibility description', () => {
        const fixed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'fixed' };
        const open: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'open' };

        const fixedPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, fixed);
        const openPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, open);

        expect(fixedPrompt).toContain('wants only what was explicitly requested');
        expect(openPrompt).toContain('welcomes suggestions for improvements and polish');
      });

      it('should include detail level description', () => {
        const minimal: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'minimal' };
        const detailed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'detailed' };

        const minimalPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, minimal);
        const detailedPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, detailed);

        expect(minimalPrompt).toContain('only surface critical issues');
        expect(detailedPrompt).toContain('surface most issues for thoroughness');
      });

      it('should include autonomy level description', () => {
        const guided: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'guided' };
        const autonomous: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'autonomous' };

        const guidedPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, guided);
        const autonomousPrompt = buildDecisionValidationPrompt(mockDecision, mockPlan, autonomous);

        expect(guidedPrompt).toContain('prefers to be consulted on most decisions');
        expect(autonomousPrompt).toContain('prefers Claude to make reasonable decisions independently');
      });

      describe('scope flexibility filtering rules', () => {
        it('should include FILTER rules for fixed scope', () => {
          const fixed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'fixed' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, fixed);

          expect(prompt).toContain('FILTER scope expansion questions unless they are critical');
          expect(prompt).toContain('FILTER "nice to have" or "polish" suggestions');
        });

        it('should include balanced rules for flexible scope', () => {
          const flexible: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'flexible' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, flexible);

          expect(prompt).toContain('PASS scope questions if they provide clear benefit');
        });

        it('should include PASS rules for open scope', () => {
          const open: UserPreferences = { ...DEFAULT_USER_PREFERENCES, scopeFlexibility: 'open' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, open);

          expect(prompt).toContain('PASS scope expansion questions - user welcomes suggestions');
          expect(prompt).toContain('PASS polish and improvement questions');
        });
      });

      describe('detail level filtering rules', () => {
        it('should include FILTER low priority for minimal detail', () => {
          const minimal: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'minimal' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, minimal);

          expect(prompt).toContain('FILTER priority 3 (low priority) questions');
          expect(prompt).toContain('Only PASS priority 1-2 questions');
        });

        it('should include PASS most for detailed level', () => {
          const detailed: UserPreferences = { ...DEFAULT_USER_PREFERENCES, detailLevel: 'detailed' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, detailed);

          expect(prompt).toContain('PASS most questions across all priority levels');
        });
      });

      describe('risk comfort filtering rules', () => {
        it('should PASS risk questions for low risk comfort', () => {
          const lowRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'low' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, lowRisk);

          expect(prompt).toContain('PASS questions about risky trade-offs');
          expect(prompt).toContain('User prefers to be consulted on anything uncertain');
        });

        it('should FILTER minor risk questions for high risk comfort', () => {
          const highRisk: UserPreferences = { ...DEFAULT_USER_PREFERENCES, riskComfort: 'high' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, highRisk);

          expect(prompt).toContain('FILTER minor risk-related questions');
          expect(prompt).toContain('User is comfortable with experimental approaches');
        });
      });

      describe('autonomy level filtering rules', () => {
        it('should PASS most for guided autonomy', () => {
          const guided: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'guided' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, guided);

          expect(prompt).toContain('PASS most implementation detail questions');
          expect(prompt).toContain('User prefers to be involved in decisions');
        });

        it('should FILTER minor details for autonomous level', () => {
          const autonomous: UserPreferences = { ...DEFAULT_USER_PREFERENCES, autonomyLevel: 'autonomous' };
          const prompt = buildDecisionValidationPrompt(mockDecision, mockPlan, autonomous);

          expect(prompt).toContain('FILTER minor implementation detail questions');
          expect(prompt).toContain('User trusts Claude to make reasonable decisions');
        });
      });
    });

    describe('decision without file context', () => {
      it('should not include file reference when not provided', () => {
        const decisionNoFile: ParsedDecision = {
          ...mockDecision,
          file: undefined,
          line: undefined,
        };

        const prompt = buildDecisionValidationPrompt(decisionNoFile, mockPlan);

        expect(prompt).not.toContain('Referenced File:');
      });
    });

    describe('empty plan', () => {
      it('should handle plan with no steps', () => {
        const emptyPlan: Plan = {
          ...mockPlan,
          steps: [],
        };

        const prompt = buildDecisionValidationPrompt(mockDecision, emptyPlan);

        expect(prompt).toContain('No plan steps defined yet');
      });
    });
  });
});
