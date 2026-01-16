import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Plan, PlanStep } from '@claude-code-web/shared';

/**
 * Normalize whitespace in a string for consistent hashing.
 * - Trims leading/trailing whitespace
 * - Collapses multiple consecutive whitespace characters into single space
 * - Normalizes line endings to \n
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')           // Normalize Windows line endings
    .replace(/\r/g, '\n')              // Normalize old Mac line endings
    .replace(/[ \t]+/g, ' ')           // Collapse horizontal whitespace
    .replace(/\n+/g, '\n')             // Collapse multiple newlines
    .trim();                           // Trim leading/trailing whitespace
}

/**
 * Compute a SHA256 hash of step content (title + description) for change detection.
 * Used to determine if a step's content changed and needs re-implementation.
 *
 * The hash is deterministic:
 * - Whitespace is normalized to handle formatting differences
 * - Uses a consistent separator between fields
 * - Returns a fixed-length hex string (first 16 chars of SHA256)
 *
 * @param title - The step title
 * @param description - The step description (optional)
 * @returns A 16-character hex string hash
 */
export function computeStepContentHash(title: string, description?: string | null): string {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedDescription = normalizeWhitespace(description || '');

  // Use pipe separator that's unlikely to appear in content
  const content = `${normalizedTitle}|${normalizedDescription}`;

  return crypto
    .createHash('sha256')
    .update(content, 'utf8')
    .digest('hex')
    .substring(0, 16);
}

/**
 * Interface for step-like objects that can have their content hashed.
 */
export interface HashableStep {
  title: string;
  description?: string | null;
}

/**
 * Compute content hash for a step object.
 * Convenience wrapper around computeStepContentHash.
 *
 * @param step - Object with title and optional description
 * @returns A 16-character hex string hash
 */
export function computeStepHash(step: HashableStep): string {
  return computeStepContentHash(step.title, step.description);
}

/**
 * Check if a step's content has changed since it was last completed.
 *
 * @param step - Step object with contentHash, title, and description
 * @returns true if content is unchanged (step should be skipped), false if changed or no hash
 */
export function isStepContentUnchanged(step: HashableStep & { contentHash?: string | null }): boolean {
  if (!step.contentHash) {
    return false; // No hash = never completed or hash cleared, don't skip
  }

  const currentHash = computeStepHash(step);
  return step.contentHash === currentHash;
}

/**
 * Store the content hash on a step object.
 * Call this when a step is marked as completed.
 *
 * @param step - Step object to update (mutates in place)
 */
export function setStepContentHash<T extends HashableStep & { contentHash?: string | null }>(step: T): void {
  step.contentHash = computeStepHash(step);
}

// =============================================================================
// Plan-Level Hash Functions
// =============================================================================

/**
 * Subset of PlanStep fields used for computing plan hash.
 * These are the fields that, if changed, indicate the plan has been modified.
 */
export interface HashablePlanStep {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  complexity?: string;
}

/**
 * Compute a SHA256 hash of the entire plan structure for change detection.
 * Used to detect if a plan was modified during Stage 5 PR Review.
 *
 * The hash includes:
 * - Each step's id, title, description, status, and complexity
 * - Steps are sorted by id for deterministic ordering
 *
 * @param plan - The plan object to hash
 * @returns A 32-character hex string hash
 */
export function computePlanHash(plan: Plan): string {
  // Extract only the fields relevant for change detection, sorted by id
  const sortedSteps = [...plan.steps]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(step => ({
      id: step.id,
      title: normalizeWhitespace(step.title),
      description: normalizeWhitespace(step.description || ''),
      status: step.status,
      complexity: (step as PlanStep & { complexity?: string }).complexity || '',
    }));

  // Create a deterministic JSON representation
  const content = JSON.stringify(sortedSteps);

  return crypto
    .createHash('sha256')
    .update(content, 'utf8')
    .digest('hex')
    .substring(0, 32);
}

/**
 * Compare two plan hashes to detect changes.
 *
 * @param before - Hash computed before potential modification
 * @param after - Hash computed after potential modification
 * @returns true if the hashes are different (plan was modified), false if same
 */
export function comparePlanHashes(before: string, after: string): boolean {
  return before !== after;
}

/**
 * Plan snapshot file structure.
 */
export interface PlanSnapshot {
  hash: string;
  savedAt: string;
  planVersion: number;
}

const PLAN_SNAPSHOT_FILENAME = '.plan-snapshot.json';

/**
 * Save a plan hash snapshot to a file before Stage 5.
 * This allows detecting changes made during PR Review.
 *
 * @param sessionDir - Directory path for the session (e.g., ~/.claude-web/sessionId/featureId/)
 * @param hash - The plan hash to save
 * @param planVersion - The plan version number
 */
export function savePlanSnapshot(sessionDir: string, hash: string, planVersion: number): void {
  const snapshotPath = path.join(sessionDir, PLAN_SNAPSHOT_FILENAME);
  const snapshot: PlanSnapshot = {
    hash,
    savedAt: new Date().toISOString(),
    planVersion,
  };

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

/**
 * Load a previously saved plan hash snapshot.
 *
 * @param sessionDir - Directory path for the session
 * @returns The plan snapshot if it exists, null otherwise
 */
export function loadPlanSnapshot(sessionDir: string): PlanSnapshot | null {
  const snapshotPath = path.join(sessionDir, PLAN_SNAPSHOT_FILENAME);

  try {
    if (!fs.existsSync(snapshotPath)) {
      return null;
    }
    const content = fs.readFileSync(snapshotPath, 'utf8');
    return JSON.parse(content) as PlanSnapshot;
  } catch {
    return null;
  }
}

/**
 * Delete the plan snapshot file after it's no longer needed.
 *
 * @param sessionDir - Directory path for the session
 */
export function deletePlanSnapshot(sessionDir: string): void {
  const snapshotPath = path.join(sessionDir, PLAN_SNAPSHOT_FILENAME);

  try {
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  } catch {
    // Ignore errors when deleting - not critical
  }
}

/**
 * Check if the plan has changed since the last snapshot.
 * Convenience function that loads snapshot, computes current hash, and compares.
 *
 * @param sessionDir - Directory path for the session
 * @param currentPlan - The current plan to compare against snapshot
 * @returns Object with changed status and details, or null if no snapshot exists
 */
export function hasPlanChangedSinceSnapshot(
  sessionDir: string,
  currentPlan: Plan
): { changed: boolean; beforeHash: string; afterHash: string } | null {
  const snapshot = loadPlanSnapshot(sessionDir);
  if (!snapshot) {
    return null;
  }

  const currentHash = computePlanHash(currentPlan);
  return {
    changed: comparePlanHashes(snapshot.hash, currentHash),
    beforeHash: snapshot.hash,
    afterHash: currentHash,
  };
}
