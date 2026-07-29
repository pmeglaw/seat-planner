import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import path from "node:path";

// The production dump contains every employee record, and the Supabase project
// is on the Free plan — these files are the only copy that exists. Both guards
// below run BEFORE any dump is attempted, so this suite never opens a
// connection: the URL it passes is synthetic and unreachable by construction.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "backup-prod.mjs");
const UNREACHABLE_DB_URL = "postgresql://user:pass@127.0.0.1:1/none";

// Run the script with a controlled environment and return its exit code and
// stderr. SUPABASE_DB_URL is blanked first so a real credential on the
// developer's machine cannot leak into the run.
function runScript(env) {
  try {
    execFileSync(process.execPath, [SCRIPT], {
      env: { ...process.env, SUPABASE_DB_URL: "", SEAT_PLANNER_BACKUP_DIR: "", ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, stderr: "" };
  } catch (error) {
    return { code: error.status, stderr: error.stderr ?? "" };
  }
}

test("the backup script refuses to run without an explicit connection string", () => {
  const { code, stderr } = runScript({ SEAT_PLANNER_BACKUP_DIR: path.join(ROOT, "..", "sp-backup-test") });
  assert.equal(code, 1, "a missing SUPABASE_DB_URL must be a hard failure");
  assert.match(stderr, /SUPABASE_DB_URL is not set/);
  assert.match(stderr, /does not read \.env\.local/, "the message should say why the file is not consulted");
});

test("the backup script refuses to write inside the repository", () => {
  // A dump landing in the working tree is one `git add -f` from publishing the
  // entire employee directory to GitHub.
  for (const inside of [ROOT, path.join(ROOT, "output"), path.join(ROOT, "supabase", "backups")]) {
    const { code, stderr } = runScript({
      SUPABASE_DB_URL: UNREACHABLE_DB_URL,
      SEAT_PLANNER_BACKUP_DIR: inside
    });
    assert.equal(code, 1, `${inside} should be rejected`);
    assert.match(stderr, /Refusing to write backups inside the repository/);
    assert.match(stderr, /contains every employee record/);
  }
});

test("the backup script never reads credentials from a file", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.doesNotMatch(source, /readFileSync\(|readFile\(/, "no file should be read for the connection string");
  assert.match(source, /process\.env\.SUPABASE_DB_URL/);
  // The connection string carries the database password, so it must never be
  // echoed back — not in a log line and not in an error.
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*dbUrl/);
});

test("the backup script dumps roles, schema, and data", async () => {
  const source = await readFile(SCRIPT, "utf8");
  for (const fragment of ['name: "roles", args: ["--role-only"]', 'name: "schema", args: []', 'name: "data", args: ["--data-only"]']) {
    assert.ok(source.includes(fragment), `${fragment} should be present`);
  }
  // A partial dump is worse than none, because it looks like a backup.
  assert.match(source, /do not treat this run as a backup/);
});
