/**
 * Secret redaction for captured session text.
 *
 * Captures hold prompts, assistant messages, and tool input and output, and
 * pipeline workers read them, so a token pasted into a prompt or printed by
 * `env` would otherwise be copied into nodes. Redaction used to look only at
 * object key names; these patterns match the values themselves.
 *
 * Writers apply this to the serialized JSONL line, so no pattern may match a
 * quote or a backslash-escaped quote: a replacement must never break the JSON.
 */

const REDACTED = "[redacted]";

const TOKEN_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g, // Anthropic, OpenAI, Stripe
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\b(?:ntn|secret)_[A-Za-z0-9]{40,}/g, // Notion
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
];

// Base64 body, whitespace, header punctuation, and JSON-escaped line breaks.
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:[A-Za-z0-9+/=\s:,.-]|\\[nr])*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const AUTH_HEADER = /\b(Bearer|Basic)(\s+)[A-Za-z0-9._~+/=-]{16,}/gi;

// NAME=value or NAME: value where the name says it holds a secret, e.g.
// `export GITHUB_TOKEN="…"` or `password: …`. The value may sit behind a quote
// (or a JSON-escaped one).
const SECRET_ASSIGNMENT = /\b([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|token|secret|password|passwd|private[_-]?key|access[_-]?key|credentials?)[A-Za-z0-9_.-]*)(\s*[=:]\s*)(\\?["']?)([^\s"'\\,;&)}\]]+)/gi;

function looksLikeSecretValue(value: string): boolean {
  if (value === REDACTED || value.startsWith("[redacted")) return false;
  if (value.length < 8 || !/[A-Za-z]/.test(value)) return false;
  // Short values have to mix in a digit, so prose like "password: required"
  // and counts like "max_tokens: 40960000" stay.
  return value.length >= 20 || /\d/.test(value);
}

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(PRIVATE_KEY_BLOCK, "[redacted private key]");
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(AUTH_HEADER, (_match, scheme: string, space: string) => `${scheme}${space}${REDACTED}`);
  out = out.replace(SECRET_ASSIGNMENT, (match, name: string, sep: string, quote: string, value: string) =>
    looksLikeSecretValue(value) ? `${name}${sep}${quote}${REDACTED}` : match
  );
  return out;
}

/** One JSONL line, redacted: the form every capture writer appends. */
export function redactedJsonLine(entry: unknown): string {
  return redactSecrets(JSON.stringify(entry)) + "\n";
}
