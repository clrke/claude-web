# Stage 3 Execution Implementation Plan

## Summary
Implement Stage 3 that executes approved plan steps sequentially, spawns Claude with write tools, handles blockers with pause/wait, tracks step status, runs tests after each step, and creates git commits per step.

## Design Decisions
- **Execution strategy**: Single Claude spawn executes all steps sequentially with `[STEP_COMPLETE]` markers
- **Git commits**: Commit after each step completion via Bash tool (already available in Stage 3)
- **Blocker handling**: Pause and wait - resume same Claude session after user answers blocker question
- **Auto-start**: Automatically spawn Stage 3 Claude after plan approval
- **Test execution**: Run tests after each step completion
- **Retry on failure**: 3 attempts to fix failing tests before marking step as blocked

---

## Implementation Steps

[PLAN_STEP id="step-1" parent="null" status="pending"]
Add buildStage3Prompt function to stagePrompts.ts
Create the Stage 3 prompt builder in `/server/src/prompts/stagePrompts.ts` that:
- Takes session and approved plan as input
- Includes all plan steps with their IDs, titles, and descriptions
- Instructs Claude to execute steps sequentially using `[STEP_COMPLETE id="X"]` markers
- Requires running tests after each step (max 3 fix attempts before blocking)
- Requires git commit after each successful step
- Specifies `[DECISION_NEEDED category="blocker" immediate="true"]` format for blockers
- Specifies `[IMPLEMENTATION_STATUS]` format for progress updates
- Specifies `[IMPLEMENTATION_COMPLETE]` when all steps are done
- References specific files from plan step descriptions
[/PLAN_STEP]

[PLAN_STEP id="step-2" parent="null" status="pending"]
Add handleStage3Result method to ClaudeResultHandler.ts
Create Stage 3 result handler in `/server/src/services/ClaudeResultHandler.ts` that:
- Saves conversation entry to conversations.json
- Updates plan.steps[] status based on `result.parsed.stepsCompleted`
- Marks steps as 'completed', 'in_progress', or 'blocked'
- Extracts blocker questions from `result.parsed.decisions` with category="blocker"
- Saves blocker questions to questions.json (reusing existing saveQuestions pattern)
- Updates status.json with currentStepId and execution status
- Detects `result.parsed.implementationComplete` for Stage 3→4 transition trigger
[/PLAN_STEP]

[PLAN_STEP id="step-3" parent="null" status="pending"]
Add spawnStage3Implementation helper function to app.ts
Create the Stage 3 spawn helper in `/server/src/app.ts` following the `spawnStage2Review` pattern:
- Takes session, storage, sessionManager, resultHandler, eventBroadcaster, prompt
- Updates status.json to 'running' with 'stage3_started' action
- Broadcasts `executionStatus` event for running state
- Spawns Claude with `orchestrator.getStageTools(3)` (includes Bash for git)
- Uses `session.claudeSessionId` for `--resume` if available
- Pipes output to `eventBroadcaster.claudeOutput()`
- Calls `resultHandler.handleStage3Result()` on completion
- Broadcasts step completion events and plan updates
- Handles Stage 3→4 transition when implementation complete
[/PLAN_STEP]

[PLAN_STEP id="step-4" parent="null" status="pending"]
Wire up auto-start in handleStage2Completion
Modify `handleStage2Completion()` in `/server/src/app.ts` to:
- After transitioning to Stage 3 and broadcasting stageChanged
- Read the approved plan from storage
- Build Stage 3 prompt using `buildStage3Prompt(updatedSession, plan)`
- Call `spawnStage3Implementation()` to auto-start execution
- Add import for `buildStage3Prompt` at top of file
[/PLAN_STEP]

[PLAN_STEP id="step-5" parent="null" status="pending"]
Add step completion events to EventBroadcaster
Add new methods to `/server/src/services/EventBroadcaster.ts`:
- `stepCompleted(projectId, featureId, step)` - emits 'step.completed' with stepId, status, timestamp
- `stepStarted(projectId, featureId, stepId)` - emits 'step.started' with stepId, timestamp
- `implementationProgress(projectId, featureId, status)` - emits 'implementation.progress' with current step, files modified, test results
[/PLAN_STEP]

[PLAN_STEP id="step-6" parent="null" status="pending"]
Add Stage 3 blocker resume handling to batch answers endpoint
Modify the batch answers endpoint in `/server/src/app.ts` to handle Stage 3 resume:
- Check if `session.currentStage === 3` in the fire-and-forget async block
- Build continuation prompt with blocker answer context
- Call `spawnStage3Implementation()` to resume execution
- Use existing `buildBatchAnswersContinuationPrompt` or create Stage 3 specific version
[/PLAN_STEP]

[PLAN_STEP id="step-7" parent="null" status="pending"]
Add client socket handlers for Stage 3 events
Update `/client/src/pages/SessionView.tsx` to:
- Add socket.on handlers for 'step.completed', 'step.started', 'implementation.progress'
- Update plan.steps in store when step status changes
- Show real-time progress in ImplementationSection (already has UI, just needs live updates)
- Add handler cleanup in useEffect return
[/PLAN_STEP]

[PLAN_STEP id="step-8" parent="null" status="pending"]
Update sessionStore for Stage 3 state management
Add to `/client/src/stores/sessionStore.ts`:
- `updateStepStatus(stepId, status)` action to update individual step status
- `setImplementationProgress(progress)` action for real-time progress tracking
- Ensure plan updates from socket events properly merge step statuses
[/PLAN_STEP]

[PLAN_STEP id="step-9" parent="null" status="pending"]
Add Stage 3 transition endpoint support
Update the transition endpoint in `/server/src/app.ts` for manual Stage 3 triggering:
- Add `targetStage === 3` case in the transition handler
- Check plan.isApproved before allowing transition
- Build Stage 3 prompt and call `spawnStage3Implementation()`
- Mirror the pattern used for `targetStage === 2`
[/PLAN_STEP]

[PLAN_STEP id="step-10" parent="null" status="pending"]
Add handleStage3Completion for Stage 3→4 transition
Create `handleStage3Completion()` in `/server/src/app.ts`:
- Triggered when `result.parsed.implementationComplete` is true
- Verify all plan steps are marked as 'completed'
- Transition to Stage 4 using `sessionManager.transitionStage()`
- Broadcast `stageChanged` event
- Log completion summary with step count and files modified
[/PLAN_STEP]

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/prompts/stagePrompts.ts` | Add `buildStage3Prompt()` function |
| `server/src/services/ClaudeResultHandler.ts` | Add `handleStage3Result()` method |
| `server/src/app.ts` | Add `spawnStage3Implementation()`, `handleStage3Completion()`, wire up auto-start, add Stage 3 transition support |
| `server/src/services/EventBroadcaster.ts` | Add `stepCompleted()`, `stepStarted()`, `implementationProgress()` methods |
| `client/src/pages/SessionView.tsx` | Add socket handlers for Stage 3 events |
| `client/src/stores/sessionStore.ts` | Add `updateStepStatus()`, `setImplementationProgress()` actions |

## Testing Strategy
- Unit test `buildStage3Prompt()` generates correct marker instructions
- Unit test `handleStage3Result()` correctly updates step statuses
- Integration test: Create session → answer questions → approve plan → verify Stage 3 auto-starts
- Integration test: Simulate blocker → answer → verify resume
- E2E test: Full flow through Stage 3 with actual file modifications
