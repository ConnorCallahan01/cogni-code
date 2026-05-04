import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import {
  ensureWorkingDirectories,
  getProjectWorkingPath,
  getProjectWorkingStatePath,
  getProjectWorkingUpdatePath,
} from "./working-files.js";

type DeltaKind =
  | "create_node"
  | "update_stance"
  | "soma_signal"
  | "create_edge"
  | "create_anti_edge"
  | "update_confidence";

interface RawScribeDelta {
  type?: string;
  action?: string;
  path?: string;
  from?: string;
  to?: string;
  target?: string;
  change?: string;
  content?: string;
  reason?: string;
  project?: string;
}

interface ScribeEntry {
  summary?: string;
  deltas?: RawScribeDelta[];
}

interface DeltaFilePayload {
  session_id?: string;
  scribes?: ScribeEntry[];
}

interface ToolTraceEvent {
  type?: string;
  timestamp?: string;
  toolName?: string;
  success?: boolean | null;
  commandPreview?: string | null;
  argsPreview?: Record<string, unknown> | null;
  inputPreview?: unknown;
  outputPreview?: unknown;
  errorPreview?: unknown;
}

interface WorkingSessionEntry {
  sessionId: string;
  project: string;
  activityAt: string;
  firstCapturedAt: string;
  lastUpdatedAt: string;
  summaries: string[];
  tasksWorkedOn: string[];
  commits: string[];
  worked: string[];
  didntWork: string[];
  nextPickup: string[];
  recalledNodes: string[];
  createdNodes: string[];
  updatedNodes: string[];
}

interface ProjectWorkingState {
  project: string;
  createdAt: string;
  updatedAt: string;
  sessions: WorkingSessionEntry[];
}

interface UpdateProjectWorkingOptions {
  project: string;
  sessionId: string;
  toolTracePath?: string;
  updatePath?: string;
}

interface WorkingSessionUpdateArtifact {
  sessionId?: string;
  project?: string;
  generatedAt?: string;
  summaries?: string[];
  tasksWorkedOn?: string[];
  commits?: string[];
  worked?: string[];
  didntWork?: string[];
  nextPickup?: string[];
  recalledNodes?: string[];
  createdNodes?: string[];
  updatedNodes?: string[];
}

const EMPTY_MARKER = "_No session handoff captured yet for this repository._";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeBullet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function pushUnique(items: string[], value: string, limit = 12): void {
  const normalized = normalizeBullet(value);
  if (!normalized) return;
  if (!items.includes(normalized)) {
    items.push(normalized);
  }
  if (items.length > limit) {
    items.splice(limit);
  }
}

function readJsonLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((value): value is T => Boolean(value));
}

function parseDeltaFile(sessionId: string): DeltaFilePayload {
  const deltaPath = fs.existsSync(path.join(CONFIG.paths.deltas, `${sessionId}.json`))
    ? path.join(CONFIG.paths.deltas, `${sessionId}.json`)
    : path.join(CONFIG.paths.deltasAudited, `${sessionId}.json`);
  if (!fs.existsSync(deltaPath)) {
    return { session_id: sessionId, scribes: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(deltaPath, "utf-8")) as DeltaFilePayload;
  } catch {
    return { session_id: sessionId, scribes: [] };
  }
}

function getSessionActivityAt(sessionId: string, generated?: WorkingSessionUpdateArtifact | null): string {
  const deltaPath = fs.existsSync(path.join(CONFIG.paths.deltas, `${sessionId}.json`))
    ? path.join(CONFIG.paths.deltas, `${sessionId}.json`)
    : path.join(CONFIG.paths.deltasAudited, `${sessionId}.json`);
  if (generated?.generatedAt) {
    return generated.generatedAt;
  }

  if (fs.existsSync(deltaPath)) {
    return fs.statSync(deltaPath).mtime.toISOString();
  }

  return nowIso();
}

function readWorkingSessionUpdate(updatePath?: string): WorkingSessionUpdateArtifact | null {
  if (!updatePath || !fs.existsSync(updatePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(updatePath, "utf-8")) as WorkingSessionUpdateArtifact;
  } catch {
    return null;
  }
}

function normalizeList(items: string[] | undefined, limit: number): string[] {
  const output: string[] = [];
  for (const item of items || []) {
    pushUnique(output, item, limit);
  }
  return output;
}

function isNoopWorkingBullet(text: string): boolean {
  const normalized = normalizeBullet(text).toLowerCase();
  if (!normalized) return true;
  return [
    /mostly about another repo/,
    /nothing (here )?appl(?:ied|ies) to this project/,
    /no [a-z0-9/_-]+-specific work happened/,
    /this session did not affect this repo/,
    /no durable(,)? project-specific handoff/,
    /no relevant update/,
    /not relevant to this project/,
    /unrelated to this project/,
    /only had to do with/,
  ].some((pattern) => pattern.test(normalized));
}

function normalizeProjectArtifactList(items: string[] | undefined, limit: number): string[] {
  return normalizeList(items, limit).filter((item) => !isNoopWorkingBullet(item));
}

function hasProjectScopedDelta(deltaPayload: DeltaFilePayload, project: string): boolean {
  for (const scribe of deltaPayload.scribes || []) {
    for (const rawDelta of scribe.deltas || []) {
      if (String(rawDelta.project || "").trim() === project) {
        return true;
      }
    }
  }
  return false;
}

function filterScribesForProject(deltaPayload: DeltaFilePayload, project: string): ScribeEntry[] {
  return (deltaPayload.scribes || []).filter((scribe) =>
    (scribe.deltas || []).some((rawDelta) => String(rawDelta.project || "").trim() === project)
  );
}

function generatedArtifactHasProjectContent(generated: WorkingSessionUpdateArtifact | null): boolean {
  if (!generated) return false;
  return [
    generated.summaries,
    generated.tasksWorkedOn,
    generated.commits,
    generated.worked,
    generated.didntWork,
    generated.nextPickup,
    generated.recalledNodes,
    generated.createdNodes,
    generated.updatedNodes,
  ].some((items) => Array.isArray(items) && items.length > 0);
}

function getDeltaKind(delta: RawScribeDelta): DeltaKind | "" {
  const kind = String(delta.type || delta.action || "").trim();
  switch (kind) {
    case "create_node":
    case "update_stance":
    case "soma_signal":
    case "create_edge":
    case "create_anti_edge":
    case "update_confidence":
      return kind;
    default:
      return "";
  }
}

function getDeltaPath(delta: RawScribeDelta): string {
  return String(delta.path || delta.from || "").trim();
}

function getDeltaTarget(delta: RawScribeDelta): string {
  return String(delta.target || delta.to || "").trim();
}

function humanizeCommand(commandPreview: string): string {
  const compact = normalizeBullet(commandPreview);
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function extractCommitHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\[.+?\s+([0-9a-f]{7,40})\]/i) || value.match(/\b([0-9a-f]{7,40})\b/);
  return match ? match[1] : null;
}

function extractActionFromGraphTool(event: ToolTraceEvent): { action?: string; path?: string; query?: string } {
  const args = event.argsPreview || {};
  const action = typeof args.action === "string" ? args.action : undefined;
  const pathValue = typeof args.path === "string" ? args.path : undefined;
  const queryValue = typeof args.query === "string" ? args.query : undefined;
  return { action, path: pathValue, query: queryValue };
}

function collectToolSignals(toolTracePath: string | undefined): {
  commits: string[];
  worked: string[];
  didntWork: string[];
  recalledNodes: string[];
} {
  const commits: string[] = [];
  const worked: string[] = [];
  const didntWork: string[] = [];
  const recalledNodes: string[] = [];

  if (!toolTracePath || !fs.existsSync(toolTracePath)) {
    return { commits, worked, didntWork, recalledNodes };
  }

  const events = readJsonLines<ToolTraceEvent>(toolTracePath);
  for (const event of events) {
    const toolName = String(event.toolName || "").trim();
    const commandPreview = typeof event.commandPreview === "string" ? event.commandPreview : "";
    const success = event.success;

    if (toolName === "mcp__graph-memory__graph_memory") {
      const action = extractActionFromGraphTool(event);
      if (action.action === "read_node" && action.path) {
        pushUnique(recalledNodes, action.path, 16);
      } else if (action.action === "list_edges" && action.path) {
        pushUnique(recalledNodes, `${action.path} (edges)`, 16);
      } else if ((action.action === "recall" || action.action === "search") && action.query) {
        pushUnique(recalledNodes, `query:${action.query}`, 16);
      }
    }

    if (!commandPreview) {
      if (success === false && toolName) {
        pushUnique(didntWork, `Tool failed: ${toolName}`, 10);
      }
      continue;
    }

    const humanized = humanizeCommand(commandPreview);
    if (/git\s+commit\b/i.test(commandPreview)) {
      const hash = extractCommitHash(typeof event.outputPreview === "string" ? event.outputPreview : null);
      pushUnique(commits, hash ? `${humanized} [${hash}]` : humanized, 10);
    }

    if (success === false) {
      const errorPreview = typeof event.errorPreview === "string"
        ? normalizeBullet(event.errorPreview)
        : "";
      const suffix = errorPreview ? ` — ${errorPreview}` : "";
      pushUnique(didntWork, `${humanized}${suffix}`, 10);
      continue;
    }

    if (
      success === true &&
      /(git\s+commit\b|git\s+push\b|tsc\b|npm\s+test\b|pnpm\s+test\b|yarn\s+test\b|vitest\b|jest\b|pytest\b|cargo\s+test\b|go\s+test\b|eslint\b|lint\b|build\b)/i.test(commandPreview)
    ) {
      pushUnique(worked, humanized, 10);
    }
  }

  return { commits, worked, didntWork, recalledNodes };
}

function deriveNextPickup(entry: WorkingSessionEntry): string[] {
  if (entry.didntWork.length > 0) {
    return [
      `Revisit the latest blocker or dead end: ${entry.didntWork[0]}`,
      ...(entry.tasksWorkedOn[0] ? [`Resume the most recent task thread: ${entry.tasksWorkedOn[0]}`] : []),
    ].slice(0, 4);
  }

  if (entry.tasksWorkedOn.length > 0) {
    return [`Resume from the latest working thread: ${entry.tasksWorkedOn[0]}`];
  }

  if (entry.summaries.length > 0) {
    return [`Pick up from the latest session summary: ${entry.summaries[0]}`];
  }

  return [];
}

function loadProjectWorkingState(project: string): ProjectWorkingState {
  ensureWorkingDirectories();
  const statePath = getProjectWorkingStatePath(project);
  if (!fs.existsSync(statePath)) {
    const timestamp = nowIso();
    return {
      project,
      createdAt: timestamp,
      updatedAt: timestamp,
      sessions: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as ProjectWorkingState;
    return {
      project,
      createdAt: parsed.createdAt || nowIso(),
      updatedAt: parsed.updatedAt || nowIso(),
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map((session) => ({
          ...session,
          activityAt: typeof session.activityAt === "string"
            ? session.activityAt
            : (session.lastUpdatedAt || parsed.updatedAt || nowIso()),
        }))
        : [],
    };
  } catch {
    const timestamp = nowIso();
    return {
      project,
      createdAt: timestamp,
      updatedAt: timestamp,
      sessions: [],
    };
  }
}

function saveProjectWorkingState(project: string, state: ProjectWorkingState): void {
  ensureWorkingDirectories();
  fs.writeFileSync(getProjectWorkingStatePath(project), JSON.stringify(state, null, 2));
}

function renderBulletSection(title: string, items: string[], fallback: string): string {
  let output = `### ${title}\n\n`;
  if (items.length === 0) {
    output += `- ${fallback}\n`;
    return output;
  }
  for (const item of items) {
    output += `- ${item}\n`;
  }
  return output;
}

function compactItems(items: string[], limit: number): string[] {
  return items
    .map(normalizeBullet)
    .filter(Boolean)
    .slice(0, limit);
}

function buildResumeNowItems(latest: WorkingSessionEntry): string[] {
  const resumeItems: string[] = [];

  for (const item of compactItems(latest.nextPickup, 5)) {
    pushUnique(resumeItems, item, 5);
  }

  if (resumeItems.length === 0 && latest.didntWork.length > 0) {
    pushUnique(resumeItems, `Resolve the latest blocker: ${latest.didntWork[0]}`, 5);
  }

  if (resumeItems.length === 0 && latest.tasksWorkedOn.length > 0) {
    pushUnique(resumeItems, `Continue the latest task: ${latest.tasksWorkedOn[0]}`, 5);
  }

  if (resumeItems.length === 0 && latest.summaries.length > 0) {
    pushUnique(resumeItems, `Continue from the last session summary: ${latest.summaries[0]}`, 5);
  }

  return resumeItems;
}

function buildCurrentStateItems(latest: WorkingSessionEntry): string[] {
  const stateItems: string[] = [];

  for (const item of compactItems(latest.tasksWorkedOn, 3)) {
    pushUnique(stateItems, item, 5);
  }
  for (const item of compactItems(latest.summaries, 2)) {
    pushUnique(stateItems, item, 5);
  }

  return stateItems;
}

function buildOpenLoopItems(latest: WorkingSessionEntry): string[] {
  const openLoops: string[] = [];

  for (const item of compactItems(latest.didntWork, 4)) {
    pushUnique(openLoops, item, 4);
  }

  return openLoops;
}

function buildEvidenceItems(latest: WorkingSessionEntry): string[] {
  const evidence: string[] = [];

  for (const item of compactItems(latest.commits, 3)) {
    pushUnique(evidence, `Commit: ${item}`, 6);
  }
  for (const item of compactItems(latest.worked, 3)) {
    pushUnique(evidence, `Worked: ${item}`, 6);
  }

  return evidence;
}

function buildMemoryItems(latest: WorkingSessionEntry): string[] {
  const relevantNodes: string[] = [];

  for (const pathValue of compactItems(latest.recalledNodes, 6)) pushUnique(relevantNodes, `Recalled: ${pathValue}`, 12);
  for (const pathValue of compactItems(latest.createdNodes, 4)) pushUnique(relevantNodes, `Created: ${pathValue}`, 12);
  for (const pathValue of compactItems(latest.updatedNodes, 4)) pushUnique(relevantNodes, `Updated: ${pathValue}`, 12);

  return relevantNodes;
}

function renderProjectWorkingMarkdown(state: ProjectWorkingState): string {
  const latest = state.sessions[0];
  let content = `# WORKING — ${state.project}\n\n`;
  content += `> Persistent repo handoff. Optimized for "Let's pick up where we left off." Updated after successful scribes.\n\n`;
  content += `**Last updated:** ${state.updatedAt}\n`;

  if (!latest) {
    content += `\n## Resume Now\n\n${EMPTY_MARKER}\n`;
    return content;
  }

  const resumeItems = buildResumeNowItems(latest);
  const currentStateItems = buildCurrentStateItems(latest);
  const openLoopItems = buildOpenLoopItems(latest);
  const evidenceItems = buildEvidenceItems(latest);
  const memoryItems = buildMemoryItems(latest);

  content += `\n## Resume Now\n\n`;
  content += `**Most recent session:** ${latest.sessionId}\n`;
  content += `**Activity timestamp:** ${latest.activityAt}\n`;
  content += `**Last refreshed:** ${latest.lastUpdatedAt}\n\n`;

  content += renderBulletSection("Start Here", resumeItems, "Resume from the latest task thread.");
  content += `\n`;
  content += renderBulletSection("Current State", currentStateItems, "No current state captured yet.");
  content += `\n`;
  content += renderBulletSection("Open Loops / Blockers", openLoopItems, "No blockers captured.");
  content += `\n`;
  content += renderBulletSection("Evidence", evidenceItems, "No commits, passing checks, or execution evidence captured yet.");
  content += `\n`;
  content += renderBulletSection("Relevant Memory", memoryItems, "No graph nodes were captured for this session yet.");

  content += `\n## Session Timeline\n`;
  for (const session of state.sessions.slice(0, 6)) {
    content += `\n### ${session.lastUpdatedAt} — ${session.sessionId}\n\n`;
    content += renderBulletSection("Session Summaries", session.summaries, "No scribe summaries yet.");
    content += `\n`;
    content += renderBulletSection("Tasks Worked On", session.tasksWorkedOn, "No tasks captured.");
    content += `\n`;
    content += renderBulletSection("Next Pickup", session.nextPickup, "Continue from the most recent task.");
    if (session.didntWork.length > 0) {
      content += `\n`;
      content += renderBulletSection("Blockers", compactItems(session.didntWork, 3), "No failures captured.");
    }
  }

  return `${content.trimEnd()}\n`;
}

export function ensureProjectWorkingFile(projectName: string): void {
  if (!projectName || projectName === "global") return;
  const state = loadProjectWorkingState(projectName);
  saveProjectWorkingState(projectName, state);
  fs.writeFileSync(getProjectWorkingPath(projectName), renderProjectWorkingMarkdown(state));
}

export function updateProjectWorkingFromSession(opts: UpdateProjectWorkingOptions): void {
  if (!opts.project || opts.project === "global") return;

  ensureWorkingDirectories();
  const deltaPayload = parseDeltaFile(opts.sessionId);
  const generated = readWorkingSessionUpdate(
    opts.updatePath || getProjectWorkingUpdatePath(opts.project, opts.sessionId)
  );
  const toolSignals = collectToolSignals(opts.toolTracePath);
  const state = loadProjectWorkingState(opts.project);
  const relevantScribes = filterScribesForProject(deltaPayload, opts.project);
  const hasProjectDelta = hasProjectScopedDelta(deltaPayload, opts.project);
  const hasGeneratedProjectContent = generatedArtifactHasProjectContent(generated);
  const now = nowIso();
  const activityAt = getSessionActivityAt(opts.sessionId, generated);

  if (!hasProjectDelta && !hasGeneratedProjectContent) {
    const existingSessions = state.sessions.filter((session) => session.sessionId !== opts.sessionId);
    if (existingSessions.length !== state.sessions.length) {
      state.sessions = existingSessions;
      state.updatedAt = now;
      saveProjectWorkingState(opts.project, state);
      fs.writeFileSync(getProjectWorkingPath(opts.project), renderProjectWorkingMarkdown(state));
    }
    return;
  }

  const existing = state.sessions.find((session) => session.sessionId === opts.sessionId);
  const session: WorkingSessionEntry = existing || {
    sessionId: opts.sessionId,
    project: opts.project,
    activityAt,
    firstCapturedAt: now,
    lastUpdatedAt: now,
    summaries: [],
    tasksWorkedOn: [],
    commits: [],
    worked: [],
    didntWork: [],
    nextPickup: [],
    recalledNodes: [],
    createdNodes: [],
    updatedNodes: [],
  };

  session.activityAt = activityAt;
  session.lastUpdatedAt = now;

  const generatedSummaries = normalizeProjectArtifactList(generated?.summaries, 12);
  const generatedTasksWorkedOn = normalizeProjectArtifactList(generated?.tasksWorkedOn, 12);
  const generatedCommits = normalizeProjectArtifactList(generated?.commits, 10);
  const generatedWorked = normalizeProjectArtifactList(generated?.worked, 12);
  const generatedDidntWork = normalizeProjectArtifactList(generated?.didntWork, 12);
  const generatedNextPickup = normalizeProjectArtifactList(generated?.nextPickup, 8);
  const generatedRecalledNodes = normalizeProjectArtifactList(generated?.recalledNodes, 18);

  for (const item of generatedSummaries) pushUnique(session.summaries, item, 12);
  for (const item of generatedTasksWorkedOn) pushUnique(session.tasksWorkedOn, item, 12);
  for (const item of generatedCommits) pushUnique(session.commits, item, 10);
  for (const item of generatedWorked) pushUnique(session.worked, item, 12);
  for (const item of generatedDidntWork) pushUnique(session.didntWork, item, 12);
  for (const item of generatedNextPickup) pushUnique(session.nextPickup, item, 8);
  for (const item of generatedRecalledNodes) pushUnique(session.recalledNodes, item, 18);
  for (const item of normalizeProjectArtifactList(generated?.createdNodes, 18)) pushUnique(session.createdNodes, item, 18);
  for (const item of normalizeProjectArtifactList(generated?.updatedNodes, 18)) pushUnique(session.updatedNodes, item, 18);

  for (const scribe of relevantScribes) {
    if (scribe.summary) {
      pushUnique(session.summaries, scribe.summary, 12);
      pushUnique(session.tasksWorkedOn, scribe.summary, 12);
    }

    for (const rawDelta of (scribe.deltas || []).filter((delta) => String(delta.project || "").trim() === opts.project)) {
      const kind = getDeltaKind(rawDelta);
      const deltaPath = getDeltaPath(rawDelta);
      const deltaTarget = getDeltaTarget(rawDelta);

      if (kind === "create_node" && deltaPath) {
        pushUnique(session.createdNodes, deltaPath, 18);
      }

      if (["update_stance", "update_confidence", "soma_signal"].includes(kind) && deltaPath) {
        pushUnique(session.updatedNodes, deltaPath, 18);
      }

      if ((kind === "create_edge" || kind === "create_anti_edge") && deltaPath) {
        pushUnique(session.updatedNodes, deltaPath, 18);
        if (deltaTarget) {
          pushUnique(session.updatedNodes, deltaTarget, 18);
        }
      }

      if (kind === "create_anti_edge") {
        const reason = normalizeBullet(String(rawDelta.reason || rawDelta.content || ""));
        const label = deltaPath && deltaTarget
          ? `${deltaPath} -> ${deltaTarget}${reason ? ` — ${reason}` : ""}`
          : reason;
        if (label) pushUnique(session.didntWork, label, 12);
      }
    }
  }

  if (generatedCommits.length === 0) {
    for (const item of toolSignals.commits) pushUnique(session.commits, item, 10);
  }
  if (generatedWorked.length === 0) {
    for (const item of toolSignals.worked) pushUnique(session.worked, item, 12);
  }
  if (generatedDidntWork.length === 0) {
    for (const item of toolSignals.didntWork) pushUnique(session.didntWork, item, 12);
  }
  if (generatedRecalledNodes.length === 0) {
    for (const item of toolSignals.recalledNodes) pushUnique(session.recalledNodes, item, 18);
  }

  if (session.createdNodes.length > 0) {
    pushUnique(session.worked, `Scribe captured ${session.createdNodes.length} new graph node(s) for this session.`, 12);
  }

  if (session.nextPickup.length === 0) {
    session.nextPickup = deriveNextPickup(session);
  }

  const sessionsWithoutCurrent = state.sessions.filter((entry) => entry.sessionId !== session.sessionId);
  state.sessions = [session, ...sessionsWithoutCurrent]
    .sort((a, b) => {
      const activityDelta = Date.parse(b.activityAt) - Date.parse(a.activityAt);
      if (!Number.isNaN(activityDelta) && activityDelta !== 0) {
        return activityDelta;
      }
      return Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt);
    });
  state.updatedAt = now;

  saveProjectWorkingState(opts.project, state);
  fs.writeFileSync(getProjectWorkingPath(opts.project), renderProjectWorkingMarkdown(state));
}
