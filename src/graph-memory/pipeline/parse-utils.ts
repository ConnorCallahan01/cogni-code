/**
 * Robustly extract JSON from LLM output.
 * Handles: raw JSON, markdown code fences, preamble text before JSON,
 * and text after the closing brace.
 */
export function extractJSON<T>(raw: string): T {
  const text = raw.trim();

  // 1. Try direct parse first (cleanest case)
  try {
    return JSON.parse(text);
  } catch {
    // continue to more lenient strategies
  }

  // 2. Extract from markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Find first { and last matching } — handles preamble and postamble text
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        // continue
      }
    }
  }

  // 4. Attempt to repair truncated JSON (missing closing brackets/braces)
  const firstBraceForRepair = text.indexOf("{");
  if (firstBraceForRepair !== -1) {
    try {
      const repaired = repairTruncatedJSON(text.slice(firstBraceForRepair));
      return JSON.parse(repaired);
    } catch {
      // continue
    }
  }

  throw new Error(`Could not extract JSON from response (length=${text.length}): ${text.slice(0, 200)}`);
}

/**
 * Attempt to repair JSON that was truncated mid-output (e.g. due to max_tokens).
 * Counts unmatched opening brackets/braces and appends the missing closers.
 * Handles truncation mid-string by closing the open string first.
 */
export function repairTruncatedJSON(text: string): string {
  let repaired = text.trimEnd();

  // If we're inside an unterminated string, close it
  let inString = false;
  let escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
    }
  }
  if (inString) {
    repaired += '"';
  }

  // Remove trailing commas before we add closers (invalid JSON)
  repaired = repaired.replace(/,\s*$/, "");

  // Count unmatched openers
  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  // Append missing closers in reverse order
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}
