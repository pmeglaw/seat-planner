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

// The admin gate is a two-name family: requireAdminContext() is the
// implementation (getUser + profiles.role check, returns { supabase, user })
// and requireAdmin() is the supabase-only delegate most actions use. An
// action may await either — the "guards the guard" test below pins that BOTH
// names resolve to the real profiles check, so neither can be stubbed into a
// no-op to sneak past this suite.
const ADMIN_GATE_NAMES = new Set(["requireAdmin", "requireAdminContext"]);

function callsAdminGate(body) {
  let calls = 0;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ADMIN_GATE_NAMES.has(node.expression.text)) {
      calls += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
}

function isAdminGateAwait(awaitExpression) {
  const expression = awaitExpression?.expression;
  return (
    !!expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    ADMIN_GATE_NAMES.has(expression.expression.text)
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

test("every exported server action calls the admin gate", () => {
  for (const action of actions) {
    assert.ok(callsAdminGate(action.body) >= 1, `${action.name} must call requireAdmin() or requireAdminContext()`);
  }
});

test("the admin gate is the first awaited call in every action (no work before the gate)", () => {
  for (const action of actions) {
    const firstAwait = findFirstAwait(action.body);
    assert.ok(firstAwait, `${action.name} must await the admin gate before any other async work`);
    assert.ok(
      isAdminGateAwait(firstAwait),
      `${action.name} awaits ${describeAwait(firstAwait)} before the admin gate — the gate must run first`
    );
  }
});

test("the admin gate itself still enforces the admin role, under both names", () => {
  // Guards the guard: a passing suite must not be reachable by stubbing
  // either gate name into a no-op. requireAdminContext must hold the real
  // profiles.role check, and requireAdmin must be nothing but a delegate to
  // it — so both entries in ADMIN_GATE_NAMES resolve to the same enforcement.
  const findFn = name =>
    sourceFile.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);

  const contextFn = findFn("requireAdminContext");
  assert.ok(contextFn, "requireAdminContext() must be defined in app/actions.ts");
  const contextDefinition = contextFn.getText(sourceFile);
  assert.match(contextDefinition, /\.from\(\s*["']profiles["']\s*\)/, "requireAdminContext must read the profiles table");
  assert.match(contextDefinition, /role\s*!==\s*["']admin["']/, "requireAdminContext must reject non-admin roles");
  assert.match(contextDefinition, /Admin permission required\./, "requireAdminContext must throw the admin-required error");

  const requireAdminFn = findFn("requireAdmin");
  assert.ok(requireAdminFn, "requireAdmin() must be defined in app/actions.ts");
  const adminDefinition = requireAdminFn.getText(sourceFile);
  assert.match(adminDefinition, /await requireAdminContext\(\)/, "requireAdmin must delegate to requireAdminContext");
});
