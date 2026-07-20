import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Security boundary layer 1 (CLAUDE.md): every mutation lives in app/actions.ts
// as a "use server" action, and every exported action must call requireAdmin()
// first. Client guards and RLS are the other layers, but this file is the one a
// new action can silently forget. Rather than maintain a hand-written list, this
// test enumerates the exported actions from the TypeScript AST and asserts the
// guard on each — so a newly added action is covered automatically, and dropping
// the guard is a deliberate, visible edit to this test.

const source = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.ES2022, /* setParentNodes */ true);

const hasModifier = (node, kind) => node.modifiers?.some(modifier => modifier.kind === kind) ?? false;
const isExported = node => hasModifier(node, ts.SyntaxKind.ExportKeyword);
const isAsync = node => hasModifier(node, ts.SyntaxKind.AsyncKeyword);

// Every exported async function/const in a "use server" module is a server
// action. Handles both `export async function x()` and
// `export const x = async () => {}` so the guard can't be dodged by syntax.
function collectExportedActions(node) {
  const actions = [];
  for (const statement of node.statements) {
    if (!isExported(statement)) continue;

    if (ts.isFunctionDeclaration(statement) && isAsync(statement) && statement.name && statement.body) {
      actions.push({ name: statement.name.text, body: statement.body });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        const isAsyncFn =
          initializer &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          isAsync(initializer);
        if (isAsyncFn && ts.isIdentifier(declaration.name) && initializer.body) {
          actions.push({ name: declaration.name.text, body: initializer.body });
        }
      }
    }
  }
  return actions;
}

// The first await reached in source order, NOT descending into nested closures
// (an await inside a callback is not part of the action's own gate flow).
function findFirstAwait(body) {
  let found;
  const visit = node => {
    if (found) return;
    if (ts.isAwaitExpression(node)) {
      found = node;
      return;
    }
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function callsRequireAdmin(body) {
  let calls = 0;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "requireAdmin") {
      calls += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
}

function isRequireAdminAwait(awaitExpression) {
  const expression = awaitExpression?.expression;
  return (
    !!expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "requireAdmin"
  );
}

function describeAwait(awaitExpression) {
  if (!awaitExpression) return "no await at all";
  const expression = awaitExpression.expression;
  const target = ts.isCallExpression(expression) ? expression.expression : expression;
  return `${target.getText(sourceFile)}(...)`;
}

const actions = collectExportedActions(sourceFile);
const actionNames = new Set(actions.map(action => action.name));

test("the AST enumerator actually discovers the server actions", () => {
  // Guards against the silent-pass failure mode: if the parser matched nothing,
  // every per-action assertion below would vacuously pass.
  assert.ok(actions.length >= 15, `expected the guard enumerator to find the actions, saw ${actions.length}`);
  for (const critical of [
    "publishSeatMapAction",
    "updateSeatAction",
    "swapSeatAssignmentsAction",
    "deleteSeatAction",
    "importAssignmentsCsvAction",
    "restoreDraftSnapshotAction"
  ]) {
    assert.ok(actionNames.has(critical), `expected ${critical} to be discovered by the enumerator`);
  }
});

test("every exported server action calls requireAdmin()", () => {
  for (const action of actions) {
    assert.ok(callsRequireAdmin(action.body) >= 1, `${action.name} must call requireAdmin()`);
  }
});

test("requireAdmin() is the first awaited call in every action (no work before the gate)", () => {
  for (const action of actions) {
    const firstAwait = findFirstAwait(action.body);
    assert.ok(firstAwait, `${action.name} must await requireAdmin() before any other async work`);
    assert.ok(
      isRequireAdminAwait(firstAwait),
      `${action.name} awaits ${describeAwait(firstAwait)} before requireAdmin() — the admin gate must run first`
    );
  }
});

test("requireAdmin itself still enforces the admin role", () => {
  // Guards the guard: a passing suite must not be reachable by stubbing
  // requireAdmin into a no-op. The definition must re-check profiles.role.
  const requireAdminFn = sourceFile.statements.find(
    statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "requireAdmin"
  );
  assert.ok(requireAdminFn, "requireAdmin() must be defined in app/actions.ts");
  const definition = requireAdminFn.getText(sourceFile);
  assert.match(definition, /\.from\(\s*["']profiles["']\s*\)/, "requireAdmin must read the profiles table");
  assert.match(definition, /role\s*!==\s*["']admin["']/, "requireAdmin must reject non-admin roles");
  assert.match(definition, /Admin permission required\./, "requireAdmin must throw the admin-required error");
});
