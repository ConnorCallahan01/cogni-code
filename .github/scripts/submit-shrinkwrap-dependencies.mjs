// Submits an npm lockfile's resolved tree to GitHub's dependency graph.
//
// The graph reads package-lock.json but not npm-shrinkwrap.json, so once the
// plugin's lockfile became a shrinkwrap (4.2.1), Dependabot alerts stopped
// covering the dependencies every install gets. This sends them through the
// dependency submission API instead.
//
// Usage: node submit-shrinkwrap-dependencies.mjs <lockfile> [--dry-run]
// Needs GITHUB_TOKEN (contents: write), GITHUB_REPOSITORY, GITHUB_SHA,
// GITHUB_REF, GITHUB_WORKFLOW and GITHUB_RUN_ID unless --dry-run.
import fs from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const lockfilePath = args.find((arg) => !arg.startsWith("--"));
if (!lockfilePath) {
  console.error("usage: submit-shrinkwrap-dependencies.mjs <lockfile> [--dry-run]");
  process.exit(2);
}

const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf-8"));
if (lockfile.lockfileVersion < 2 || !lockfile.packages) {
  throw new Error(`${lockfilePath}: lockfileVersion ${lockfile.lockfileVersion} has no "packages" map`);
}
const packages = lockfile.packages;
const root = packages[""] ?? {};
const rootDependencies = new Set(Object.keys({
  ...root.dependencies,
  ...root.optionalDependencies,
  ...root.devDependencies,
  ...root.peerDependencies,
}));

function packageName(key, entry) {
  return entry.name ?? key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
}

function purl(name, version) {
  return `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;
}

// Node's lookup: the nearest node_modules/<name> from the dependent outward.
function resolve(fromKey, name) {
  let base = fromKey;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate] && !packages[candidate].link) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf("/node_modules/");
    base = cut === -1 ? "" : base.slice(0, cut);
  }
}

const resolved = {};
for (const [key, entry] of Object.entries(packages)) {
  if (!key || entry.link || !entry.version) continue;
  const name = packageName(key, entry);
  const id = purl(name, entry.version);
  const dependencies = Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })
    .map((dependency) => resolve(key, dependency))
    .filter(Boolean)
    .map((depKey) => purl(packageName(depKey, packages[depKey]), packages[depKey].version));

  const record = {
    package_url: id,
    relationship: key === `node_modules/${name}` && rootDependencies.has(name) ? "direct" : "indirect",
    scope: entry.dev ? "development" : "runtime",
    dependencies,
  };
  // One name@version can sit at several paths; keep the strongest reading.
  const seen = resolved[id];
  if (seen) {
    if (record.relationship === "direct") seen.relationship = "direct";
    if (record.scope === "runtime") seen.scope = "runtime";
    seen.dependencies = [...new Set([...seen.dependencies, ...record.dependencies])];
  } else {
    resolved[id] = record;
  }
}

const records = Object.values(resolved);
const count = (predicate) => records.filter(predicate).length;
console.log(
  `${lockfilePath}: ${records.length} packages ` +
  `(${count((r) => r.relationship === "direct")} direct, ` +
  `${count((r) => r.scope === "runtime")} runtime, ${count((r) => r.scope === "development")} development)`,
);

const env = process.env;
const snapshot = {
  version: 0,
  sha: env.GITHUB_SHA ?? "0".repeat(40),
  ref: env.GITHUB_REF ?? "refs/heads/master",
  job: {
    correlator: `${env.GITHUB_WORKFLOW ?? "dependency-graph"}:${lockfilePath}`,
    id: env.GITHUB_RUN_ID ?? "dry-run",
  },
  detector: {
    name: "cogni-code-lockfile-submission",
    version: "1.0.0",
    url: "https://github.com/ConnorCallahan01/cogni-code/blob/master/.github/scripts/submit-shrinkwrap-dependencies.mjs",
  },
  scanned: new Date().toISOString(),
  manifests: {
    [lockfilePath]: {
      name: lockfilePath,
      file: { source_location: lockfilePath },
      resolved,
    },
  },
};

if (dryRun) {
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

for (const name of ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "GITHUB_SHA", "GITHUB_REF"]) {
  if (!env[name]) throw new Error(`${name} is not set`);
}
const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dependency-graph/snapshots`, {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(snapshot),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(`snapshot submission failed: HTTP ${response.status} ${body}`);
}
const result = JSON.parse(body);
console.log(`submitted snapshot ${result.id}: ${result.result} (${result.message ?? "no message"})`);
