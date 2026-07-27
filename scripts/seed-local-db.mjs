// Seed the LOCAL Supabase stack, and only the local stack.
//
// supabase/config.toml sets [db.seed] enabled = false deliberately: leaving the
// CLI to auto-seed also let the Supabase GitHub integration seed hosted PREVIEW
// BRANCHES, which put accounts with a repo-committed password onto an
// internet-reachable database. Seeding is therefore explicit, and it goes
// through `docker exec` into the local container — there is no connection
// string and no network target here, so this cannot address a hosted project
// even by accident. That property is the point; do not "improve" this into a
// psql call against DB_URL.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "supabase", "config.toml");
const seedPath = path.join(root, "supabase", "seed.sql");

const projectId = readFileSync(configPath, "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) throw new Error(`Could not read project_id from ${configPath}`);

const container = `supabase_db_${projectId}`;
const seedSql = readFileSync(seedPath, "utf8");

try {
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    { input: seedSql, stdio: ["pipe", "inherit", "inherit"] }
  );
  console.log(`Seeded ${container} from supabase/seed.sql`);
} catch (error) {
  console.error(
    `Failed to seed ${container}. Is the local stack running? Start it with \`npm run db:start\`.`
  );
  throw error;
}
