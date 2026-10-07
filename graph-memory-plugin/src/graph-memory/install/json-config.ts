import fs from "fs";

// Harness configs are hand-edited, and some harnesses (opencode) accept
// comments and trailing commas. An installer must never mistake "couldn't
// parse this" for "this doesn't exist" and replace someone's config with a
// fresh one containing only our entry.

export type JsonConfig =
  | { status: "missing" }
  | { status: "ok"; value: Record<string, any>; strict: boolean }
  | { status: "unreadable"; reason: string };

/** Drop `//` and block comments and trailing commas, leaving string contents untouched. */
export function stripJsonComments(text: string): string {
  const withoutComments = scan(text, (t, i) => {
    if (t.startsWith("//", i)) {
      const end = t.indexOf("\n", i);
      return (end === -1 ? t.length : end) - i;
    }
    if (t.startsWith("/*", i)) {
      const end = t.indexOf("*/", i + 2);
      return (end === -1 ? t.length : end + 2) - i;
    }
    return 0;
  });
  return scan(withoutComments, (t, i) => {
    if (t[i] !== ",") return 0;
    let j = i + 1;
    while (j < t.length && /\s/.test(t[j])) j++;
    return t[j] === "}" || t[j] === "]" ? 1 : 0;
  });
}

// Copy `text`, skipping however many characters `skip` reports at each
// position outside a JSON string literal.
function scan(text: string, skip: (text: string, i: number) => number): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const n = skip(text, i);
    if (n > 0) {
      i += n;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

function asObject(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

export function readJsonConfig(filePath: string): JsonConfig {
  if (!fs.existsSync(filePath)) return { status: "missing" };
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (err: any) {
    return { status: "unreadable", reason: err?.message || String(err) };
  }
  if (!text.trim()) return { status: "ok", value: {}, strict: true };

  try {
    const value = asObject(JSON.parse(text));
    return value ? { status: "ok", value, strict: true } : { status: "unreadable", reason: "not a JSON object" };
  } catch { /* try the lenient form */ }
  try {
    const value = asObject(JSON.parse(stripJsonComments(text)));
    return value ? { status: "ok", value, strict: false } : { status: "unreadable", reason: "not a JSON object" };
  } catch (err: any) {
    return { status: "unreadable", reason: err?.message || String(err) };
  }
}

/**
 * Load a config that the caller is about to rewrite with JSON.stringify. Throws
 * rather than let that write discard content it couldn't parse, or comments it
 * can't preserve; `manualHint` tells the user what to add themselves.
 */
export function loadJsonConfigForUpdate(filePath: string, manualHint: string): Record<string, any> {
  const config = readJsonConfig(filePath);
  if (config.status === "missing") return {};
  if (config.status === "unreadable") {
    throw new Error(`${filePath} isn't valid JSON (${config.reason}), so it was left unchanged. ${manualHint}`);
  }
  if (!config.strict) {
    throw new Error(`${filePath} has comments or trailing commas that rewriting would drop, so it was left unchanged. ${manualHint}`);
  }
  return config.value;
}
