import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadComponent,
  renderElement,
  screen,
  fireEvent,
  act,
  React,
  configureContext,
  setUrl,
  cleanup
} from "./helpers/renderComponent.mjs";

// Interaction tests for the real LoginForm component: rendered in jsdom with the
// Supabase client and the full-navigation seam (@/lib/fullNavigation) replaced
// by controllable doubles, so we assert on validation, trimming, the auth calls
// it makes, and the post-login redirect.
let LoginForm;
before(async () => {
  ({ LoginForm } = await loadComponent("@/components/auth/LoginForm"));
});
afterEach(() => cleanup());

// Build a Supabase auth double that records calls and returns the given results.
function makeSupabase(results = {}) {
  const calls = { password: [], otp: [], reset: [] };
  const supabase = {
    auth: {
      signInWithPassword: async arg => {
        calls.password.push(arg);
        return results.password ?? { error: null };
      },
      signInWithOtp: async arg => {
        calls.otp.push(arg);
        return results.otp ?? { error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        calls.reset.push({ email, options });
        return results.reset ?? { error: null };
      }
    }
  };
  return { supabase, calls };
}

async function mountLogin({ url = "/login", results = {} } = {}) {
  setUrl(url);
  // Post-login redirects are full document loads (lib/fullNavigation.ts), so
  // the assertion target is the navigation double, not router.push.
  const assigned = [];
  const { supabase, calls } = makeSupabase(results);
  configureContext({ navigation: { assign: href => assigned.push(href) }, supabase });
  await renderElement(React.createElement(LoginForm));
  return { calls, assigned };
}

const type = (selector, value) => act(async () => fireEvent.change(document.querySelector(selector), { target: { value } }));
const submit = () => act(async () => fireEvent.submit(document.querySelector("form")));
const flush = () => act(async () => {});

// UX-01 (#276): before hydration there is no onSubmit handler, so an enabled
// submit button ran the browser's NATIVE submit — a GET back to /login that
// reloaded the page and discarded whatever had been typed, with no message.
// The server-rendered markup must therefore ship the button disabled, and the
// label must say why rather than leaving a silently dead control.
test("server-rendered markup ships the submit button disabled and says why", async () => {
  const { supabase } = makeSupabase();
  configureContext({ supabase });
  const html = renderToStaticMarkup(React.createElement(LoginForm));

  assert.match(html, /Starting up…/, "pre-hydration label explains the disabled state");
  assert.match(html, /disabled/, "pre-hydration submit is disabled");
  assert.doesNotMatch(html, /Sign in<\/button>/, "the live label must not render before hydration");
});

test("hydration enables the submit button and restores its label", async () => {
  await mountLogin();
  const submitButton = screen.getByRole("button", { name: "Sign in" });
  assert.equal(submitButton.disabled, false, "hydrated submit is clickable");
  assert.doesNotMatch(document.body.innerHTML, /Starting up…/);
});

// v12 slice 8 (owner ruling 2026-08-04): the Password / Magic-link mode tabs
// became two actions in one row. Both credentials are always on screen, and
// asking for a link is a single click instead of switch-then-submit — so there
// is no mode to announce and no aria-pressed pair to assert.
test("renders the sign-in form with both auth actions", async () => {
  await mountLogin();
  assert.equal(screen.getByRole("heading", { name: "Sign in" }).tagName, "H1");
  assert.ok(document.querySelector('input[type="email"]'));
  assert.ok(document.querySelector('input[type="password"]'));
  assert.equal(screen.getByRole("button", { name: "Sign in" }).getAttribute("type"), "submit");
  // The link request must never be a submit: it would race the password path.
  assert.equal(screen.getByRole("button", { name: /Magic link/ }).getAttribute("type"), "button");
});

// tests/e2e-auth/auth-helpers.ts signs in with button:text-is("Sign in") — the
// heading is also "Sign in", which is why it uses text-is rather than has-text.
// Playwright binds that engine to the SMALLEST element containing the text, so
// wrapping the label in a span (for a label-left/arrow-right split, say) makes
// the span capture it and the button stop matching, and every authenticated e2e
// test loses its sign-in step. Keep the label a direct text child.
test("the submit label is a direct text child so the e2e sign-in locator still binds", async () => {
  await mountLogin();
  const submitButton = screen.getByRole("button", { name: "Sign in" });
  const ownText = Array.from(submitButton.childNodes)
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent)
    .join("")
    .trim();

  assert.equal(ownText, "Sign in");
  assert.equal(submitButton.textContent.trim(), "Sign in", "decoration must not add text");
});

test("submitting with no email shows a validation alert and makes no auth call", async () => {
  const { calls } = await mountLogin();
  await submit();
  assert.match(screen.getByRole("alert").textContent, /Enter your work email and password/);
  assert.equal(calls.password.length, 0);
});

test("password mode requires a password", async () => {
  const { calls } = await mountLogin();
  await type('input[type="email"]', "person@example.com");
  await submit();
  assert.match(screen.getByRole("alert").textContent, /Enter your password/);
  assert.equal(calls.password.length, 0);
});

test("successful sign-in calls Supabase with the credentials and redirects to ?next", async () => {
  const { calls, assigned } = await mountLogin({ url: "/login?next=/admin" });
  await type('input[type="email"]', "person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();

  assert.deepEqual(calls.password, [{ email: "person@example.com", password: "hunter2" }]);
  assert.match(screen.getByRole("status").textContent, /Redirecting/);
  assert.deepEqual(assigned, ["/admin"]);
});

test("an open-redirect ?next is ignored in favor of '/'", async () => {
  const { assigned } = await mountLogin({ url: "/login?next=https://evil.example" });
  await type('input[type="email"]', "person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();
  assert.deepEqual(assigned, ["/"]);
});

test("a Supabase error is mapped to friendly guidance and blocks redirect", async () => {
  const { assigned } = await mountLogin({ results: { password: { error: { message: "Email rate limit exceeded" } } } });
  await type('input[type="email"]', "person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();
  assert.match(screen.getByRole("alert").textContent, /Please wait 60 seconds/);
  assert.deepEqual(assigned, []);
});

test("the magic-link button sends an OTP without creating a user", async () => {
  const { calls } = await mountLogin();
  await type('input[type="email"]', "person@example.com");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Magic link/ })));
  await flush();

  assert.equal(calls.otp.length, 1);
  assert.equal(calls.otp[0].email, "person@example.com");
  assert.equal(calls.otp[0].options.shouldCreateUser, false);
  assert.match(screen.getByRole("status").textContent, /Check your email/);
});

// The button no longer passes through handleSubmit, so it needs its own guard —
// otherwise a stray click would ask Supabase to mail a link to "".
test("the magic-link button refuses to send without an email", async () => {
  const { calls } = await mountLogin();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Magic link/ })));
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Enter your work email/);
  assert.equal(calls.otp.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="email"]'));
});

test("forgot-password requires an email before sending a reset", async () => {
  const { calls } = await mountLogin();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Forgot password/ })));
  assert.match(screen.getByRole("alert").textContent, /Enter your work email first/);
  assert.equal(calls.reset.length, 0);

  await type('input[type="email"]', "person@example.com");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Forgot password/ })));
  await flush();
  assert.equal(calls.reset.length, 1);
  assert.equal(calls.reset[0].email, "person@example.com");
});

test("an ?error query param is surfaced through friendlyAuthMessage on load", async () => {
  await mountLogin({ url: `/login?error=${encodeURIComponent("Invalid login credentials")}` });
  assert.match(screen.getByRole("alert").textContent, /Email or password is incorrect/);
});

test("the email input disables spellcheck", async () => {
  await mountLogin();
  assert.equal(document.querySelector('input[type="email"]').getAttribute("spellcheck"), "false");
});

test("a failed validation focuses the offending field", async () => {
  await mountLogin();
  await submit();
  assert.equal(document.activeElement, document.querySelector('input[type="email"]'), "empty submit focuses email");

  await type('input[type="email"]', "person@example.com");
  await submit();
  assert.equal(document.activeElement, document.querySelector('input[type="password"]'), "missing password focuses password");
});
