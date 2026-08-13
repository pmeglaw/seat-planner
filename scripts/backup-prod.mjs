// Take a manual backup of the PRODUCTION database.
//
// The Supabase organisation is on the Free plan: no scheduled backups, no
// point-in-time recovery. These dumps are the only copy that exists, so this
// script is the backup strategy, not a convenience wrapper.
//
// Two safety properties are enforced in code rather than left to documentation,
// because the dump contains the entire employee directory:
//
//   1. The connection string is read from the PROCESS ENVIRONMENT ONLY, never
//      from .env.local. Nothing here should be able to reach production because
//      a file happened to be lying around — running this has to be a deliberate
//      act. It also means the test suite can execute this script without any
//      chance of it finding real credentials.
//
//   2. The destination is refused if it resolves inside the repository. A dump
//      committed by accident would publish the whole directory to GitHub, and
//      .gitignore is one `git add -f` away from not helping.
//
// Usage (see README "Backups & recovery" for the cadence this belongs to):
//
//   SUPABASE_DB_URL='postgresql://...' npm run backup:prod
//
// SUPABASE_DB_URL comes from Supabase → Project Settings → Database. Override
// the destination with SEAT_PLANNER_BACKUP_DIR; it defaults to a sibling
// directory of this repository.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

// True when `candidate` is the repo root or anything beneath it.
function isInsideRepo(candidate, root = ROOT) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  fail(
    [
      "SUPABASE_DB_URL is not set.",
      "",
      "Copy the connection string from Supabase → Project Settings → Database and",
      "pass it for this command only, so it is never written to a file:",
      "",
      "  SUPABASE_DB_URL='postgresql://...' npm run backup:prod",
      "",
      "This script deliberately does not read .env.local — reaching production has",
      "to be deliberate."
    ].join("\n")
  );
}

const destination = path.resolve(
  process.env.SEAT_PLANNER_BACKUP_DIR || path.join(ROOT, "..", "seat-planner-backups")
);

if (isInsideRepo(destination)) {
  fail(
    [
      `Refusing to write backups inside the repository: ${destination}`,
      "",
      "The dump contains every employee record. Point SEAT_PLANNER_BACKUP_DIR at a",
      "directory outside this working tree."
    ].join("\n")
  );
}

// UTC so a dump taken late in the evening does not sort before the morning's.
const stamp = new Date().toISOString().slice(0, 10);

// Supabase's own full-backup triad: roles, then schema, then data. Restoring
// runs them back in that order.
const dumps = [
  { name: "roles", args: ["--role-only"] },
  { name: "schema", args: [] },
  { name: "data", args: ["--data-only"] }
];

// Run the CLI's own entry script through this Node binary rather than through
// npx. `npx` resolves to npx.cmd on Windows, which execFileSync refuses to
// spawn (EINVAL) on Node 20+ unless a shell is involved — and putting a shell
// between us and the CLI would expose the connection string to shell parsing.
let cliEntry;
try {
  const require = createRequire(import.meta.url);
  cliEntry = path.join(path.dirname(require.resolve("supabase/package.json")), "dist", "supabase.js");
} catch {
  fail("The `supabase` CLI package is not installed. Run `npm install` first.");
}

mkdirSync(destination, { recursive: true });
console.log(`Backing up production to ${destination}`);

for (const dump of dumps) {
  const file = path.join(destination, `seat-planner-${stamp}-${dump.name}.sql`);
  try {
    execFileSync(
      process.execPath,
      [cliEntry, "db", "dump", "--db-url", dbUrl, ...dump.args, "-f", file],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
  } catch (error) {
    // Never read the caught error's message text: execFileSync builds it as
    // "Command failed: <argv...>", which would print --db-url and the
    // database password it carries. The CLI's own stderr is inherited, so
    // the operator already saw the real diagnostics above this line.
    fail(`The ${dump.name} dump failed (exit status ${error.status ?? "unknown"}). Nothing was verified; do not treat this run as a backup.`);
  }
  console.log(`  wrote ${path.basename(file)}`);
}

console.log("");
console.log("Done. These files contain the entire employee directory — keep them off");
console.log("shared drives and out of any repository.");
console.log("");
console.log("A backup that has never been restored is not a backup. Rehearse into a");
console.log("throwaway project or the local stack, then add a row to the rehearsal log");
console.log("in README.md.");
