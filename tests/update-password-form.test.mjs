import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  screen,
  fireEvent,
  act,
  React,
  configureContext,
  cleanup
} from "./helpers/renderComponent.mjs";

// Interaction tests for the real UpdatePasswordForm: rendered in jsdom with the
// router and Supabase client replaced by doubles. Pins the a11y contract from
// #195 — validation/errors announced via role="alert", success via
// role="status", and a real <form> so Enter submits.
let UpdatePasswordForm;
before(async () => {
  ({ UpdatePasswordForm } = await loadComponent("@/components/auth/UpdatePasswordForm"));
});
afterEach(() => cleanup());

async function mountForm({ results = {} } = {}) {
  // Post-update redirect is a full document load (lib/fullNavigation.ts), so
  // the assertion target is the navigation double, not router.push + refresh.
  const assigned = [];
  const updates = [];
  const supabase = {
    auth: {
      updateUser: async arg => {
        updates.push(arg);
        return results.update ?? { error: null };
      }
    }
  };
  configureContext({ navigation: { assign: href => assigned.push(href) }, supabase });
  await renderElement(React.createElement(UpdatePasswordForm));
  return { assigned, updates };
}

const type = (selector, value) => act(async () => fireEvent.change(document.querySelector(selector), { target: { value } }));
const submitForm = () => act(async () => fireEvent.submit(document.querySelector("form")));
const flush = () => act(async () => {});

test("renders both password fields with names inside a form", async () => {
  await mountForm();
  assert.ok(document.querySelector("form"), "fields must live in a <form> so Enter submits");
  assert.ok(document.querySelector('form input[name="password"]'));
  assert.ok(document.querySelector('form input[name="confirmPassword"]'));
});

test("a too-short password is announced as an alert and makes no auth call", async () => {
  const { updates } = await mountForm();
  await type('input[name="password"]', "short");
  await type('input[name="confirmPassword"]', "short");
  await submitForm();
  assert.match(screen.getByRole("alert").textContent, /at least 12 characters/);
  assert.equal(updates.length, 0);
});

test("mismatched passwords are announced as an alert and make no auth call", async () => {
  const { updates } = await mountForm();
  await type('input[name="password"]', "long-enough-password");
  await type('input[name="confirmPassword"]', "different-password-here");
  await submitForm();
  assert.match(screen.getByRole("alert").textContent, /do not match/);
  assert.equal(updates.length, 0);
});

test("submitting the form updates the password, announces status, and redirects home", async () => {
  const { assigned, updates } = await mountForm();
  await type('input[name="password"]', "long-enough-password");
  await type('input[name="confirmPassword"]', "long-enough-password");
  await submitForm();
  await flush();

  assert.deepEqual(updates, [{ password: "long-enough-password" }]);
  assert.match(screen.getByRole("status").textContent, /Password updated/);
  assert.deepEqual(assigned, ["/"]);
});

test("a Supabase error is announced as an alert and blocks the redirect", async () => {
  const { assigned } = await mountForm({ results: { update: { error: { message: "New password should be different" } } } });
  await type('input[name="password"]', "long-enough-password");
  await type('input[name="confirmPassword"]', "long-enough-password");
  await submitForm();
  await flush();
  assert.ok(screen.getByRole("alert").textContent.length > 0);
  assert.deepEqual(assigned, []);
});
