import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const publishHistory = await importTsModule("lib/publishHistory.ts");

test("publish history resolves publisher ids to profile emails", () => {
  const events = publishHistory.resolvePublishHistoryProfiles(
    [
      {
        created_at: "2026-05-20T16:00:00.000Z",
        seat_count: 61,
        published_by: "user-1"
      }
    ],
    [
      {
        id: "user-1",
        email: "admin@example.com"
      }
    ]
  );

  assert.equal(events[0].published_by_email, "admin@example.com");
  assert.equal(publishHistory.getPublishHistoryActor(events[0]), "admin@example.com");
});

test("publish history falls back to raw publisher id when no profile email exists", () => {
  const [event] = publishHistory.resolvePublishHistoryProfiles(
    [
      {
        created_at: "2026-05-20T16:00:00.000Z",
        seat_count: 61,
        published_by: "missing-profile"
      }
    ],
    []
  );

  assert.equal(event.published_by_email, null);
  assert.equal(publishHistory.getPublishHistoryActor(event), "missing-profile");
});
