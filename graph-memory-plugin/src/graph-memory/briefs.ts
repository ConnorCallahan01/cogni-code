import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export interface DailyBriefRecord {
  date: string;
  markdownPath: string;
  jsonPath: string;
}

export interface DailyBriefPayload {
  date: string;
  generated_at: string;
  timezone: string;
  start_here: string[];
  external_inputs?: string[];
  yesterday: string[];
  open_loops: string[];
  seven_day_trends: string[];
  agent_friction: string[];
  suggested_claude_updates: string[];
  suggested_memory_updates: string[];
  one_thing_today: string;
}

export function getDailyBriefPaths(date: string): DailyBriefRecord {
  return {
    date,
    markdownPath: path.join(CONFIG.paths.dailyBriefs, `${date}.md`),
    jsonPath: path.join(CONFIG.paths.dailyBriefs, `${date}.json`),
  };
}

export function listRecentDailyBriefs(limit = 7): DailyBriefRecord[] {
  if (!fs.existsSync(CONFIG.paths.dailyBriefs)) return [];

  return fs.readdirSync(CONFIG.paths.dailyBriefs)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((date) => getDailyBriefPaths(date));
}

export function readRecentBriefTrendInputs(limit = 7): Array<{ date: string; data: unknown }> {
  return listRecentDailyBriefs(limit)
    .filter((record) => fs.existsSync(record.jsonPath))
    .map((record) => {
      try {
        return {
          date: record.date,
          data: JSON.parse(fs.readFileSync(record.jsonPath, "utf-8")),
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { date: string; data: unknown } => entry !== null);
}

export function getLatestDailyBrief(): DailyBriefRecord | null {
  return listRecentDailyBriefs(1)[0] || null;
}
