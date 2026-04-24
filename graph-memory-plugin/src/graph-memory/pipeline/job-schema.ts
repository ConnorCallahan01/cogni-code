import { randomUUID } from "crypto";

export type GraphMemoryJobType = "scribe" | "working_update" | "auditor" | "librarian" | "dreamer" | "memory_analysis";
export type GraphMemoryJobState = "queued" | "running" | "done" | "failed";

export interface ScribeJobPayload {
  snapshotPath: string;
  sessionId: string;
  project?: string;
  assistantTracePath?: string;
  toolTracePath?: string;
}

export interface AuditorJobPayload {
  reason: string;
}

export interface WorkingUpdateJobPayload {
  sessionId: string;
  project: string;
  deltaMtimeMs: number;
  assistantTracePath?: string;
  toolTracePath?: string;
}

export interface LibrarianJobPayload {
  reason: string;
}

export interface DreamerJobPayload {
  reason: string;
}

export interface MemoryAnalysisJobPayload {
  briefDate: string;
  timeZone: string;
  reason: string;
}

export type GraphMemoryJobPayload =
  | ScribeJobPayload
  | WorkingUpdateJobPayload
  | AuditorJobPayload
  | LibrarianJobPayload
  | DreamerJobPayload
  | MemoryAnalysisJobPayload;

export interface GraphMemoryJob<TPayload = GraphMemoryJobPayload> {
  id: string;
  type: GraphMemoryJobType;
  state: GraphMemoryJobState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  triggerSource: string;
  payload: TPayload;
  logFile?: string;
  lastError?: string;
  workerPid?: number;
}

export interface CreateJobOptions<TPayload = GraphMemoryJobPayload> {
  type: GraphMemoryJobType;
  payload: TPayload;
  triggerSource: string;
  idempotencyKey: string;
  maxAttempts?: number;
}

export function defaultMaxAttempts(type: GraphMemoryJobType): number {
  switch (type) {
    case "scribe":
      return 3;
    case "working_update":
      return 2;
    case "auditor":
    case "librarian":
    case "dreamer":
    case "memory_analysis":
      return 2;
  }
}

export function createJob<TPayload = GraphMemoryJobPayload>(
  opts: CreateJobOptions<TPayload>
): GraphMemoryJob<TPayload> {
  const timestamp = new Date().toISOString();
  return {
    id: `${opts.type}_${randomUUID()}`,
    type: opts.type,
    state: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    attempt: 0,
    maxAttempts: opts.maxAttempts ?? defaultMaxAttempts(opts.type),
    idempotencyKey: opts.idempotencyKey,
    triggerSource: opts.triggerSource,
    payload: opts.payload,
  };
}
