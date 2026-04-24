/**
 * Shared scoring utilities for graph-memory search/recall.
 * Used by both MCP tools (tools.ts) and hooks (on-user-message.ts ambient recall).
 */

/** Token overlap ratio: fraction of tokens in `a` that appear in `b`. */
export function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const token of a) {
    if (setB.has(token)) count++;
  }
  return a.length > 0 ? count / a.length : 0;
}

/** Recency boost: 1.2x if accessed within 7 days, 1.0x within 30, 0.8x otherwise. */
export function recencyBoost(lastAccessed?: string): number {
  if (!lastAccessed) return 0.8;
  const daysSince = (Date.now() - new Date(lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1.2;
  if (daysSince <= 30) return 1.0;
  return 0.8;
}

/** Project boost: 1.3x for matching project, 0.7x for different, 1.0x for global. */
export function projectBoost(entryProject: string | undefined, currentProject: string | undefined): number {
  if (!entryProject) return 1.0;
  if (!currentProject || currentProject === "global") return 1.0;
  if (entryProject === currentProject) return 1.3;
  return 0.7;
}
