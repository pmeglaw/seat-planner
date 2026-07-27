import { execFileSync } from "node:child_process";
import path from "node:path";

// Seed the local stack before the authenticated tier runs.
//
// The Supabase CLI no longer does this: supabase/config.toml sets
// [db.seed] enabled = false so hosted preview branches can never execute
// seed.sql. Doing it here keeps `npm run test:e2e:auth` a single command —
// without it the specs would fail at sign-in with no obvious cause, which is
// exactly the kind of setup trap this tier is supposed to remove.
export default function globalSetup() {
  const script = path.join(__dirname, "..", "..", "scripts", "seed-local-db.mjs");
  execFileSync(process.execPath, [script], { stdio: "inherit" });
}
