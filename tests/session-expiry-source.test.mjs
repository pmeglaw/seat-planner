import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Session-expiry guardrail (2026-07-16 detail critique, action 2): production
// masks thrown server-action messages behind a digest, so an admin whose
// session lapsed mid-edit used to get an unexplained generic error with no
// way back to sign-in. The client must recognize auth loss itself.

test("a failed admin action probes the session and offers a sign-in path", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  // Any new action error triggers a client-side getUser probe...
  assert.match(source, /from "@\/lib\/supabase\/client"/);
  assert.match(source, /setSessionExpired\(!data\.user\)/);
  // ...and an expired session swaps the generic error for a banner that says
  // what happened and links straight back to sign-in with a return path.
  assert.match(source, /Your session expired/);
  assert.match(source, /href="\/login\?next=\/admin"/);
  // The masked generic error must not render alongside the expiry explanation.
  // (The !*Confirm arms are PR-4's one-channel rule, extended by PR-5: while
  // any dialog that renders the error inline is open, the canvas banner
  // stands down.)
  assert.match(
    source,
    /\{actionError && !sessionExpired && !swapConfirm && !vacateConfirm && !deleteSeatConfirm && !moveEmployeeConfirm && \(/
  );
});
