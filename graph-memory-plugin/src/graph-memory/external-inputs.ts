import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { CONFIG } from "./config.js";

export type ExternalInputMode = "disabled" | "brief_only" | "brief_and_memory";
export type ExternalInputSource = "gmail" | "calendar" | "slack";
export type ExternalInputCategory = "action_item" | "waiting_on_reply" | "meeting_commitment" | "reference_context" | "ignore";

export interface GmailInputConfig {
  enabled: boolean;
  mode: ExternalInputMode;
  account?: string | null;
  filters: {
    lookbackMode: "unread_triage" | "recent_window";
    labels: string[];
    senders: string[];
    unreadOnly: boolean;
    sinceHours: number;
    maxMessages: number;
    dropAutomated: boolean;
    ignoredSubjectPatterns: string[];
    ignoredSenderPatterns: string[];
  };
}

export interface CalendarInputConfig {
  enabled: boolean;
  mode: ExternalInputMode;
  filters: {
    calendarIds: string[];
    daysAhead: number;
  };
}

export interface SlackInputConfig {
  enabled: boolean;
  mode: ExternalInputMode;
}

export interface ExternalInputsConfig {
  enabled: boolean;
  sources: {
    gmail: GmailInputConfig;
    calendar: CalendarInputConfig;
    slack: SlackInputConfig;
  };
}

export type ExternalInputsConfigPatch = Partial<Omit<ExternalInputsConfig, "sources">> & {
  sources?: {
    gmail?: Partial<GmailInputConfig>;
    calendar?: Partial<CalendarInputConfig>;
    slack?: Partial<SlackInputConfig>;
  };
};

export interface ClassifiedExternalInputItem {
  id: string;
  source: ExternalInputSource;
  category: ExternalInputCategory;
  priority: "low" | "medium" | "high";
  title: string;
  summary: string;
  people?: string[];
  dueWindow?: string | null;
  projectGuess?: string | null;
  sourceConfidence: number;
  rawRef?: string | null;
}

export interface ExternalInputBatch {
  source: ExternalInputSource;
  capturedAt: string;
  mode: ExternalInputMode;
  items: ClassifiedExternalInputItem[];
  rawPath: string;
  normalizedPath: string;
  classifiedPath: string;
}

interface CommandResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

function defaultConfig(): ExternalInputsConfig {
  return {
    enabled: true,
    sources: {
      gmail: {
        enabled: false,
        mode: "brief_only",
        account: null,
        filters: {
          lookbackMode: "recent_window",
          labels: ["INBOX", "STARRED"],
          senders: [],
          unreadOnly: false,
          sinceHours: 36,
          maxMessages: 10,
          dropAutomated: true,
          ignoredSubjectPatterns: [
            "google alert",
            "newsletter",
            "daily digest",
            "weekly digest",
            "unsubscribe",
            "sale",
            "off your",
            "deal",
            "promotion",
            "sponsored",
            "recommended for you",
          ],
          ignoredSenderPatterns: [
            "no-reply",
            "noreply",
            "do-not-reply",
            "notifications@",
            "mailer-daemon",
          ],
        },
      },
      calendar: {
        enabled: false,
        mode: "brief_only",
        filters: {
          calendarIds: ["primary"],
          daysAhead: 1,
        },
      },
      slack: {
        enabled: false,
        mode: "disabled",
      },
    },
  };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureExternalInputDirectories(): void {
  for (const dir of [
    CONFIG.paths.inputsRoot,
    CONFIG.paths.inputsGmailRaw,
    CONFIG.paths.inputsCalendarRaw,
    CONFIG.paths.inputsSlackRaw,
    CONFIG.paths.inputsNormalized,
    CONFIG.paths.inputsClassified,
  ]) {
    ensureDir(dir);
  }
}

export function ensureExternalInputsConfig(): ExternalInputsConfig {
  ensureExternalInputDirectories();
  if (!fs.existsSync(CONFIG.paths.inputsConfig)) {
    const initial = defaultConfig();
    fs.writeFileSync(CONFIG.paths.inputsConfig, JSON.stringify(initial, null, 2));
    return initial;
  }
  return loadExternalInputsConfig();
}

export function loadExternalInputsConfig(): ExternalInputsConfig {
  ensureExternalInputDirectories();
  const defaults = defaultConfig();
  if (!fs.existsSync(CONFIG.paths.inputsConfig)) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG.paths.inputsConfig, "utf-8")) as Partial<ExternalInputsConfig>;
    return {
      ...defaults,
      ...parsed,
      sources: {
        gmail: {
          ...defaults.sources.gmail,
          ...(parsed.sources?.gmail || {}),
          filters: {
            ...defaults.sources.gmail.filters,
            ...(parsed.sources?.gmail?.filters || {}),
          },
        },
        calendar: {
          ...defaults.sources.calendar,
          ...(parsed.sources?.calendar || {}),
          filters: {
            ...defaults.sources.calendar.filters,
            ...(parsed.sources?.calendar?.filters || {}),
          },
        },
        slack: {
          ...defaults.sources.slack,
          ...(parsed.sources?.slack || {}),
        },
      },
    };
  } catch {
    return defaults;
  }
}

export function saveExternalInputsConfig(next: ExternalInputsConfigPatch): ExternalInputsConfig {
  const current = loadExternalInputsConfig();
  const merged: ExternalInputsConfig = {
    ...current,
    ...next,
    sources: {
      gmail: {
        ...current.sources.gmail,
        ...(next.sources?.gmail || {}),
        filters: {
          ...current.sources.gmail.filters,
          ...(next.sources?.gmail?.filters || {}),
        },
      },
      calendar: {
        ...current.sources.calendar,
        ...(next.sources?.calendar || {}),
        filters: {
          ...current.sources.calendar.filters,
          ...(next.sources?.calendar?.filters || {}),
        },
      },
      slack: {
        ...current.sources.slack,
        ...(next.sources?.slack || {}),
      },
    },
  };

  ensureExternalInputDirectories();
  fs.writeFileSync(CONFIG.paths.inputsConfig, JSON.stringify(merged, null, 2));
  return merged;
}

function runCommand(command: string, args: string[], extraEnv: Record<string, string> = {}): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message,
  };
}

function safeTimestampForFile(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

function dateBucket(iso: string): string {
  return iso.slice(0, 10);
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function findPrimaryItemArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  }

  if (value && typeof value === "object") {
    for (const candidate of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(candidate)) {
        const records = candidate.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
        if (records.length > 0) return records;
      }
    }
  }

  return [];
}

function pickText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNestedHeaderValue(record: Record<string, unknown>, headerName: string): string | null {
  const direct = record[headerName];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const headers = record.headers;
  if (headers && typeof headers === "object") {
    if (!Array.isArray(headers)) {
      const value = (headers as Record<string, unknown>)[headerName] || (headers as Record<string, unknown>)[headerName.toLowerCase()];
      if (typeof value === "string" && value.trim()) return value.trim();
    } else {
      for (const item of headers) {
        if (!item || typeof item !== "object") continue;
        const name = (item as Record<string, unknown>).name;
        const value = (item as Record<string, unknown>).value;
        if (typeof name === "string" && name.toLowerCase() === headerName.toLowerCase() && typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  }

  return null;
}

function buildGmailQuery(config: GmailInputConfig): string {
  const parts: string[] = [];

  if (config.filters.lookbackMode === "recent_window") {
    const days = Math.max(1, Math.ceil(config.filters.sinceHours / 24));
    parts.push(`newer_than:${days}d`);
  }

  if (config.filters.unreadOnly) {
    parts.push("is:unread");
  }

  if (config.filters.labels.length > 0) {
    parts.push(`(${config.filters.labels.map((label) => `label:${label}`).join(" OR ")})`);
  }

  if (config.filters.senders.length > 0) {
    parts.push(`(${config.filters.senders.map((sender) => `from:${sender}`).join(" OR ")})`);
  }

  return parts.join(" ").trim();
}

function listGmailMessages(config: GmailInputConfig): Array<Record<string, unknown>> {
  const q = buildGmailQuery(config);
  const params: Record<string, unknown> = {
    userId: "me",
    maxResults: config.filters.maxMessages,
  };
  if (q) params.q = q;

  const command = runCommand("gws", [
    "gmail",
    "users",
    "messages",
    "list",
    "--params",
    JSON.stringify(params),
  ]);

  if (!command.ok) {
    throw new Error(command.stderr || command.error || `gws gmail users messages list failed with status ${command.status}`);
  }

  const parsed = tryParseJson(command.stdout);
  const messages = findPrimaryItemArray(parsed);
  return messages;
}

function readGmailMessage(id: string): Record<string, unknown> {
  const command = runCommand("gws", [
    "gmail",
    "+read",
    "--id",
    id,
    "--headers",
    "--format",
    "json",
  ]);

  if (!command.ok) {
    return { id, read_error: command.stderr || command.error || `failed to read ${id}` };
  }

  const parsed = tryParseJson(command.stdout);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return { id, raw: command.stdout };
}

function classifyGmailItems(rawParsed: unknown, rawPath: string): ClassifiedExternalInputItem[] {
  const items = findPrimaryItemArray(rawParsed);
  if (items.length === 0) {
    return [];
  }

  const config = loadExternalInputsConfig().sources.gmail;
  const kept = items.filter((item) => {
    const sender = (pickText(item, ["from", "sender", "email", "author"]) || pickNestedHeaderValue(item, "From") || "").toLowerCase();
    const subject = (pickText(item, ["subject", "title", "snippet"]) || pickNestedHeaderValue(item, "Subject") || "").toLowerCase();
    if (!config.filters.dropAutomated) return true;

    const ignoredSubject = config.filters.ignoredSubjectPatterns.some((pattern) => subject.includes(pattern.toLowerCase()));
    const ignoredSender = config.filters.ignoredSenderPatterns.some((pattern) => sender.includes(pattern.toLowerCase()));

    return !(ignoredSubject || ignoredSender);
  });

  return kept.slice(0, 25).map((item, index) => {
    const sender = pickText(item, ["from", "sender", "email", "author"]) || pickNestedHeaderValue(item, "From");
    const subject = pickText(item, ["subject", "title", "snippet"]) || pickNestedHeaderValue(item, "Subject") || "Recent email";
    const date = pickText(item, ["date", "internalDate", "receivedAt"]) || pickNestedHeaderValue(item, "Date");
    const snippet = pickText(item, ["snippet", "body", "preview"]);
    const summary = [sender, subject, snippet || date].filter(Boolean).join(" — ");

    return {
      id: `gmail-${Date.now()}-${index}`,
      source: "gmail",
      category: "action_item",
      priority: index < 3 ? "high" : "medium",
      title: subject,
      summary: summary || subject,
      people: uniqueStrings([sender]),
      dueWindow: "today",
      projectGuess: null,
      sourceConfidence: 0.7,
      rawRef: rawPath,
    };
  });
}

function classifyCalendarItems(rawParsed: unknown, rawPath: string): ClassifiedExternalInputItem[] {
  const items = findPrimaryItemArray(rawParsed);
  if (items.length === 0) {
    return [];
  }

  return items.slice(0, 20).map((item, index) => {
    const title = pickText(item, ["summary", "title", "event", "name"]) || "Calendar event";
    const when = pickText(item, ["start", "startTime", "time"]);
    const attendees = pickText(item, ["attendees", "people"]);
    const summary = [title, when, attendees].filter(Boolean).join(" — ");

    return {
      id: `calendar-${Date.now()}-${index}`,
      source: "calendar",
      category: "meeting_commitment",
      priority: index < 2 ? "high" : "medium",
      title,
      summary: summary || title,
      people: attendees ? [attendees] : [],
      dueWindow: when || "today",
      projectGuess: null,
      sourceConfidence: 0.6,
      rawRef: rawPath,
    };
  });
}

function persistBatch(source: ExternalInputSource, mode: ExternalInputMode, stdout: string, stderr: string, parsed: unknown, classified: ClassifiedExternalInputItem[]): ExternalInputBatch {
  const capturedAt = new Date().toISOString();
  const day = dateBucket(capturedAt);
  const fileStem = safeTimestampForFile(capturedAt);
  const rawRoot = source === "gmail"
    ? CONFIG.paths.inputsGmailRaw
    : source === "calendar"
      ? CONFIG.paths.inputsCalendarRaw
      : CONFIG.paths.inputsSlackRaw;

  const rawPath = path.join(rawRoot, day, `${fileStem}.json`);
  const normalizedPath = path.join(CONFIG.paths.inputsNormalized, `${day}-${source}.json`);
  const classifiedPath = path.join(CONFIG.paths.inputsClassified, `${day}-${source}.json`);

  writeJson(rawPath, {
    source,
    capturedAt,
    stdout,
    stderr,
    parsed,
  });

  writeJson(normalizedPath, {
    source,
    capturedAt,
    parsed,
    rawPath,
  });

  writeJson(classifiedPath, {
    source,
    capturedAt,
    mode,
    items: classified,
    rawPath,
    normalizedPath,
  });

  return {
    source,
    capturedAt,
    mode,
    items: classified,
    rawPath,
    normalizedPath,
    classifiedPath,
  };
}

export function refreshGmailInputs(timeZone: string): ExternalInputBatch | null {
  const config = loadExternalInputsConfig();
  const source = config.sources.gmail;
  if (!config.enabled || !source.enabled || source.mode === "disabled") {
    return null;
  }

  if (source.filters.lookbackMode === "unread_triage") {
    const command = runCommand("gws", ["gmail", "+triage"], {
      TZ: timeZone,
    });
    if (!command.ok) {
      throw new Error(command.stderr || command.error || `gws gmail +triage failed with status ${command.status}`);
    }

    const parsed = tryParseJson(command.stdout);
    const classified = classifyGmailItems(parsed, "raw:gmail-triage");
    return persistBatch("gmail", source.mode, command.stdout, command.stderr, parsed, classified);
  }

  const listed = listGmailMessages(source);
  const hydrated = listed
    .slice(0, source.filters.maxMessages)
    .map((item) => {
      const id = pickText(item, ["id", "messageId"]);
      return id ? readGmailMessage(id) : item;
    });
  const stdout = JSON.stringify(hydrated, null, 2);
  const classified = classifyGmailItems(hydrated, "raw:gmail-recent");
  return persistBatch("gmail", source.mode, stdout, "", hydrated, classified);
}

export function refreshCalendarInputs(timeZone: string): ExternalInputBatch | null {
  const config = loadExternalInputsConfig();
  const source = config.sources.calendar;
  if (!config.enabled || !source.enabled || source.mode === "disabled") {
    return null;
  }

  const args = ["calendar", "+agenda", "--today", "--timezone", timeZone];
  const command = runCommand("gws", args, {
    TZ: timeZone,
  });
  if (!command.ok) {
    throw new Error(command.stderr || command.error || `gws calendar +agenda failed with status ${command.status}`);
  }

  const parsed = tryParseJson(command.stdout);
  const classified = classifyCalendarItems(parsed, "raw:calendar");
  return persistBatch("calendar", source.mode, command.stdout, command.stderr, parsed, classified);
}

export function refreshExternalInputs(timeZone: string, sources: ExternalInputSource[] = ["gmail", "calendar"]): ExternalInputBatch[] {
  ensureExternalInputsConfig();
  const batches: ExternalInputBatch[] = [];

  for (const source of sources) {
    if (source === "gmail") {
      const batch = refreshGmailInputs(timeZone);
      if (batch) batches.push(batch);
    } else if (source === "calendar") {
      const batch = refreshCalendarInputs(timeZone);
      if (batch) batches.push(batch);
    }
  }

  return batches;
}

export function listRecentClassifiedInputFiles(limit = 10): string[] {
  ensureExternalInputDirectories();
  if (!fs.existsSync(CONFIG.paths.inputsClassified)) return [];
  return fs.readdirSync(CONFIG.paths.inputsClassified)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((file) => path.join(CONFIG.paths.inputsClassified, file));
}

export function readRecentClassifiedInputs(limit = 10): Array<Record<string, unknown>> {
  return listRecentClassifiedInputFiles(limit)
    .map((filePath) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
        return {
          filePath,
          ...parsed,
        } as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}
