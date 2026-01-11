import { Session, Plan, Question } from '@claude-code-web/shared';

/**
 * Build Stage 1: Feature Discovery prompt
 * Uses Claude Code's native plan mode for structured exploration and planning.
 * Per README lines 1546-1611
 */
export function buildStage1Prompt(session: Session): string {
  const acceptanceCriteriaText = session.acceptanceCriteria.length > 0
    ? session.acceptanceCriteria.map((c, i) => `${i + 1}. ${c.text}`).join('\n')
    : 'No specific criteria provided.';

  const affectedFilesSection = session.affectedFiles.length > 0
    ? `
## Affected Files (User Hints)
These files are likely to need changes:
${session.affectedFiles.join('\n')}`
    : '';

  const technicalNotesSection = session.technicalNotes
    ? `
## Technical Notes
${session.technicalNotes}`
    : '';

  return `You are helping implement a new feature. Enter plan mode and study the codebase.

## Feature
Title: ${session.title}
Description: ${session.featureDescription}
Project Path: ${session.projectPath}

## Acceptance Criteria
${acceptanceCriteriaText}
${affectedFilesSection}
${technicalNotesSection}

## Instructions
1. Enter plan mode using the EnterPlanMode tool. Output:
[PLAN_MODE_ENTERED]

2. Within plan mode, spawn domain-specific subagents for parallel codebase exploration:
   - Frontend Agent: UI components, React patterns, styling
   - Backend Agent: API endpoints, business logic, middleware
   - Database Agent: Schema design, queries, data modeling
   - DevOps Agent: CI/CD pipelines, deployment configs, infrastructure
   - Test Agent: Test coverage, testing strategies

3. Based on exploration, ask clarifying questions using progressive disclosure:
   - Start with the most fundamental questions (scope, approach, constraints)
   - After user answers, ask increasingly detailed questions based on their choices
   - Each question must include options with a recommended choice

4. Format questions as:
[DECISION_NEEDED priority="1|2|3" category="scope|approach|technical|design"]
Question here?
- Option A: Description (recommended)
- Option B: Description
- Option C: Description
[/DECISION_NEEDED]

   Priority 1 = fundamental (ask first), Priority 2 = detailed, Priority 3 = refinement

5. After all questions are answered, generate an implementation plan within plan mode.

6. Format plan steps as:
[PLAN_STEP id="1" parent="null" status="pending"]
Step title here
Description of what this step accomplishes.
[/PLAN_STEP]

7. Exit plan mode with ExitPlanMode when ready for user approval. Output:
[PLAN_MODE_EXITED]

8. When you create a plan file, output the file path so the server can track it:
[PLAN_FILE path="/path/to/plan/file.md"]`;
}

/**
 * Build Stage 2: Plan Review prompt
 * Reviews implementation plan and finds issues to present as decisions.
 * Per README lines 1613-1657
 */
export function buildStage2Prompt(session: Session, plan: Plan, currentIteration: number): string {
  const planStepsText = plan.steps.length > 0
    ? plan.steps.map((step, i) => {
        const parentInfo = step.parentId ? ` (depends on: ${step.parentId})` : '';
        return `${i + 1}. [${step.id}] ${step.title}${parentInfo}\n   ${step.description || 'No description'}`;
      }).join('\n\n')
    : 'No plan steps defined.';

  const targetIterations = 10; // README recommendation

  return `You are reviewing an implementation plan. Find issues and present them as decisions for the user.

## Current Plan (v${plan.planVersion})
${planStepsText}

## Review Iteration
This is review ${currentIteration} of ${targetIterations} recommended.

## Instructions
1. Use the Task tool to spawn domain-specific subagents for parallel review:
   - Frontend Agent: Review UI-related steps
   - Backend Agent: Review API-related steps
   - Database Agent: Review data-related steps
   - Test Agent: Review test coverage

2. Check for issues in these categories:
   - Code Quality: Missing error handling, hardcoded values, missing tests
   - Architecture: Tight coupling, unclear separation of concerns
   - Security: Injection risks, exposed secrets, missing auth checks
   - Performance: N+1 queries, missing indexes, large bundle size

3. Present issues as progressive decisions for the user:
   - Priority 1: Fundamental issues (architecture, security) - ask first
   - Priority 2: Important issues (code quality, performance) - ask after P1 resolved
   - Priority 3: Refinements (style, optimization) - ask last

4. Format each issue as a decision with fix options:
[DECISION_NEEDED priority="1|2|3" category="code_quality|architecture|security|performance"]
Issue: Description of the problem found.
Impact: What could go wrong if not addressed.

How should we address this?
- Option A: Recommended fix approach (recommended)
- Option B: Alternative fix approach
- Option C: Accept risk and proceed without fix
[/DECISION_NEEDED]

5. After user answers priority 1 questions, present priority 2 questions, and so on.

6. If no issues found or all decisions resolved:
[PLAN_APPROVED]`;
}

/**
 * Build Stage 2: Plan Revision prompt
 * Revises plan based on user feedback.
 */
export function buildPlanRevisionPrompt(session: Session, plan: Plan, feedback: string): string {
  const planStepsText = plan.steps.length > 0
    ? plan.steps.map((step, i) => {
        const parentInfo = step.parentId ? ` (depends on: ${step.parentId})` : '';
        return `${i + 1}. [${step.id}] ${step.title}${parentInfo}\n   ${step.description || 'No description'}`;
      }).join('\n\n')
    : 'No plan steps defined.';

  return `You are revising an implementation plan based on user feedback.

## Feature
Title: ${session.title}
Description: ${session.featureDescription}

## Current Plan (v${plan.planVersion})
${planStepsText}

## User Feedback
${feedback}

## Instructions
1. Carefully consider the user's feedback
2. Revise the plan to address their concerns
3. Output the revised plan steps using the format:

[PLAN_STEP id="step-id" parent="null|parent-id" status="pending"]
Step title
Step description
[/PLAN_STEP]

4. If you have clarifying questions about the feedback, present them as decisions:
[DECISION_NEEDED priority="1" category="scope"]
Question about the feedback...

- Option A: Interpretation 1 (recommended)
- Option B: Interpretation 2
[/DECISION_NEEDED]

5. After revising the plan, continue with Stage 2 review process to find any remaining issues.`;
}

/**
 * Build prompt to continue after user answers a batch of questions.
 * Each review iteration has progressive complexity questions.
 * The server sends this prompt when all questions from the same batch are answered.
 */
export function buildBatchAnswersContinuationPrompt(
  answeredQuestions: Question[],
  currentStage: number
): string {
  const answers = answeredQuestions.map(q => {
    const answerText = typeof q.answer?.value === 'string'
      ? q.answer.value
      : JSON.stringify(q.answer?.value);
    return `**Q:** ${q.questionText}\n**A:** ${answerText}`;
  }).join('\n\n');

  if (currentStage === 1) {
    return `The user answered your discovery questions:

${answers}

Continue with the discovery process based on these answers.

IMPORTANT: If you need more clarification, you MUST ask questions using this exact format:
[DECISION_NEEDED priority="1|2|3" category="scope|approach|technical|design"]
Question here?
- Option A: Description (recommended)
- Option B: Description
[/DECISION_NEEDED]

When you have enough information:
1. Generate the implementation plan with [PLAN_STEP] markers
2. Write the plan to a file and output: [PLAN_FILE path="/path/to/plan.md"]
3. Exit plan mode and output: [PLAN_MODE_EXITED]`;
  }

  // Stage 2 continuation
  return `The user answered your review questions:

${answers}

Continue with the review process based on these answers.

IMPORTANT: If there are more issues to address, you MUST use this exact format:
[DECISION_NEEDED priority="1|2|3" category="code_quality|architecture|security|performance"]
Issue: Description of the problem found.
Impact: What could go wrong if not addressed.

How should we address this?
- Option A: Recommended fix approach (recommended)
- Option B: Alternative fix approach
- Option C: Accept risk and proceed without fix
[/DECISION_NEEDED]

If all issues are resolved and the plan is ready for implementation, output:
[PLAN_APPROVED]`;
}
