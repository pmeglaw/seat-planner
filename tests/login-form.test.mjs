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
// by controllable doubles. The form is SINGLE-SURFACE (owner decision
// 2026-08-15, retiring the Aug 11 two-step disclosure): email and password on
// one screen, magic link below the primary. What these tests pin is the part
// that must survive any future re-layout — the pre-hydration guard, the
// name-less inputs, validation, the auth calls, the no-account-oracle
// notices, and the post-login redirect.
let LoginForm;
before(async () => {
  ({ LoginForm } = await loadComponent("@/components/auth/LoginForm"));
});
afterEach(() => cleanup());

const REMEMBERED_EMAIL_KEY = "seat-planner:login-email";

// Build a Supabase auth double that records calls and returns the given results.
//
// A configured Error REJECTS instead of resolving. Auth calls really do reject
// — createClient() throws on missing env and fetch rejects on a network drop —
// and a double that only ever resolves cannot see a handler that leaves its
// control disabled forever on that path.
function settle(result) {
  if (result instanceof Error) return Promise.reject(result);
  return Promise.resolve(result ?? { error: null });
}

function makeSupabase(results = {}) {
  const calls = { password: [], otp: [], reset: [] };
  const supabase = {
    auth: {
      signInWithPassword: arg => {
        calls.password.push(arg);
        return settle(results.password);
      },
      signInWithOtp: arg => {
        calls.otp.push(arg);
        return settle(results.otp);
      },
      resetPasswordForEmail: (email, options) => {
        calls.reset.push({ email, options });
        return settle(results.reset);
      }
    }
  };
  return { supabase, calls };
}

async function mountLogin({ url = "/login", results = {}, rememberedEmail = null } = {}) {
  setUrl(url);
  // jsdom's localStorage is process-wide and survives cleanup(), so every mount
  // states the remember-email precondition explicitly instead of inheriting the
  // previous test's.
  window.localStorage.clear();
  if (rememberedEmail) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, rememberedEmail);
  // Post-login redirects are full document loads (lib/fullNavigation.ts), so
  // the assertion target is the navigation double, not router.push.
  const assigned = [];
  const { supabase, calls } = makeSupabase(results);
  configureContext({ navigation: { assign: href => assigned.push(href) }, supabase });
  await renderElement(React.createElement(LoginForm));
  return { calls, assigned };
}

const type = (selector, value) => act(async () => fireEvent.change(document.querySelector(selector), { target: { value } }));
const click = name => act(async () => fireEvent.click(screen.getByRole("button", { name })));
const submit = () => act(async () => fireEvent.submit(document.querySelector("form")));
const flush = () => act(async () => {});

// Single surface: filling both credentials is the whole way in.
async function fillCredentials(email = "person@example.com", password = "hunter2") {
  if (email !== null) await type('input[type="email"]', email);
  if (password !== null) await type('input[type="password"]', password);
}

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
  assert.doesNotMatch(html, /Log in<\/button>/, "the live label must not render before hydration");
});

// With one surface the password field IS in the server HTML, so the
// serialization guard is structural rather than choreographic: every input is
// name-less, and a name-less control contributes NOTHING to a native GET
// submit. This plus the disabled pre-hydration primary is what keeps that
// window inert — the two surviving layers of the two-step form's guard.
test("the server HTML renders both fields with no name attributes anywhere", async () => {
  const { supabase } = makeSupabase();
  configureContext({ supabase });
  const html = renderToStaticMarkup(React.createElement(LoginForm));

  assert.match(html, /type="email"/, "email field is server-rendered");
  assert.match(html, /type="password"/, "password field is server-rendered");
  assert.doesNotMatch(html, /<input[^>]*\sname=/, "no input may carry a name");
});

test("hydration enables the submit button and restores its label", async () => {
  await mountLogin();
  const submitButton = screen.getByRole("button", { name: "Log in" });
  assert.equal(submitButton.disabled, false, "hydrated submit is clickable");
  assert.doesNotMatch(document.body.innerHTML, /Starting up…/);
});

// The whole login lives on one surface: both fields, the reset link, and the
// magic-link alternative below the primary behind the divider (the hierarchy
// rule — never between a field and its primary button — survives the
// two-step retirement).
test("one surface carries both fields, the reset link, and the magic-link alternative", async () => {
  await mountLogin();
  // H2, not H1: the document h1 is the brand panel's "Seat Planner"
  // (app/login/page.tsx); the form heading is the subordinate.
  assert.equal(screen.getByRole("heading", { name: "Log in" }).tagName, "H2");
  assert.ok(document.querySelector('input[type="email"]'));
  assert.ok(document.querySelector('input[type="password"]'));
  assert.equal(screen.getByRole("button", { name: "Log in" }).getAttribute("type"), "submit");
  // The link request must never be a submit: it would race the password path.
  assert.equal(screen.getByRole("button", { name: /magic link/i }).getAttribute("type"), "button");
  assert.ok(screen.getByRole("button", { name: /Forgot password/ }));
  // The hierarchy rule is an ORDER claim, so pin the order: the alternative
  // renders after the primary, never between a field and its primary button.
  const primary = screen.getByRole("button", { name: "Log in" });
  const magicLink = screen.getByRole("button", { name: /magic link/i });
  assert.ok(
    primary.compareDocumentPosition(magicLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    "the magic-link alternative must render after the primary"
  );
});

// tests/e2e-auth/auth-helpers.ts drives the flow with button:text-is("Log in")
// — and the form heading is also "Log in", which is why it uses text-is rather
// than has-text. Playwright binds that engine to the SMALLEST element
// containing the text, so wrapping the label in a span (for a
// label-left/arrow-right split, say) makes the span capture it and the button
// stop matching, and every authenticated e2e test loses its sign-in step. Keep
// the label a direct text child.
test("the primary label is a direct text child so the e2e locator still binds", async () => {
  await mountLogin();

  const ownText = button =>
    Array.from(button.childNodes)
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent)
      .join("")
      .trim();

  const login = screen.getByRole("button", { name: "Log in" });
  assert.equal(ownText(login), "Log in");
  assert.equal(login.textContent.trim(), "Log in", "decoration must not add text");
});

test("submit with no email shows the inline error, focuses it, and makes no auth call", async () => {
  const { calls } = await mountLogin();
  await submit();

  assert.match(document.body.textContent, /Email is required/);
  assert.equal(calls.password.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="email"]'));
});

// Format only — the check looks at SHAPE, not existence, and GoTrue answers
// unknown-email and wrong-password with one identical error, so nothing on
// this path can become an oracle for which accounts exist.
test("submit rejects a malformed address and accepts any well-formed one", async () => {
  const { calls } = await mountLogin();
  await fillCredentials("not-an-email", "hunter2");
  await submit();
  assert.match(document.body.textContent, /Enter a valid email address/);
  assert.equal(calls.password.length, 0);

  await type('input[type="email"]', "nobody@example.com");
  await submit();
  await flush();
  assert.equal(calls.password.length, 1, "unknown addresses submit just the same");
});

test("the inline email error clears as soon as the field is corrected", async () => {
  await mountLogin();
  await submit();
  assert.match(document.body.textContent, /Email is required/);

  await type('input[type="email"]', "person@example.com");
  assert.doesNotMatch(document.body.textContent, /Email is required/);
});

test("a well-formed email with no password focuses the password error", async () => {
  const { calls } = await mountLogin();
  await fillCredentials("person@example.com", null);
  await submit();

  assert.match(document.body.textContent, /Password is required/);
  assert.equal(calls.password.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="password"]'));
});

test("successful sign-in calls Supabase with the credentials and redirects to ?next", async () => {
  const { calls, assigned } = await mountLogin({ url: "/login?next=/admin" });
  await fillCredentials("person@example.com", "hunter2");
  await submit();
  await flush();

  assert.deepEqual(calls.password, [{ email: "person@example.com", password: "hunter2" }]);
  assert.match(screen.getByRole("status").textContent, /Redirecting/);
  assert.deepEqual(assigned, ["/admin"]);
});

test("an open-redirect ?next is ignored in favor of '/'", async () => {
  const { assigned } = await mountLogin({ url: "/login?next=https://evil.example" });
  await fillCredentials();
  await submit();
  await flush();
  assert.deepEqual(assigned, ["/"]);
});

test("a Supabase error is mapped to friendly guidance and blocks redirect", async () => {
  const { assigned } = await mountLogin({ results: { password: { error: { message: "Email rate limit exceeded" } } } });
  await fillCredentials();
  await submit();
  await flush();
  assert.match(screen.getByRole("alert").textContent, /Please wait 60 seconds/);
  assert.deepEqual(assigned, []);
});

// Canvas 2c: the failure notification clears the password and carries the magic
// link as its action, so recovery is offered where the failure happened. Focus
// goes to the password — the field that needs retyping; the email field is one
// Shift-Tab away.
test("a failed password attempt clears the password and offers the magic link in place", async () => {
  const { calls } = await mountLogin({ results: { password: { error: { message: "Invalid login credentials" } } } });
  await fillCredentials("person@example.com", "wrong-password");
  await submit();
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Email or password is incorrect/);
  assert.equal(document.querySelector('input[type="password"]').value, "", "password cleared");
  assert.equal(document.activeElement, document.querySelector('input[type="password"]'));

  const recovery = screen.getByRole("alert").querySelector("button");
  assert.match(recovery.textContent, /Email me a magic link instead/);
  await act(async () => fireEvent.click(recovery));
  await flush();

  assert.equal(calls.otp.length, 1, "the notification action sends the link");
  assert.equal(calls.otp[0].email, "person@example.com", "with the email already entered");
  assert.equal(calls.otp[0].options.shouldCreateUser, false);
});

// A rejection skips every statement after the await. Without a finally the
// pending flag stayed set, so the primary sat disabled reading "Logging in…"
// for the rest of the session with no way to retry — the exact symptom the
// run-seat-planner skill records as "button stuck on Signing in…".
test("a rejected sign-in explains itself and leaves the primary usable", async () => {
  const { assigned } = await mountLogin({ results: { password: new Error("Failed to fetch") } });
  await fillCredentials();
  await submit();
  await flush();

  const alert = screen.getByRole("alert");
  assert.match(alert.textContent, /Could not reach the sign-in service/);
  // The transport message is not auth guidance and must not be echoed as if it were.
  assert.doesNotMatch(alert.textContent, /Failed to fetch/);
  assert.equal(screen.getByRole("button", { name: "Log in" }).disabled, false, "the primary recovers");
  assert.deepEqual(assigned, []);
  // Recovery is still offered where the failure happened.
  assert.ok(alert.querySelector("button"), "the magic-link action survives a rejection");
});

test("a rejected magic-link send leaves its button usable", async () => {
  await mountLogin({ results: { otp: new Error("Failed to fetch") } });
  await type('input[type="email"]', "person@example.com");
  await click(/magic link/i);
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Could not reach the sign-in service/);
  assert.equal(screen.getByRole("button", { name: /magic link/i }).disabled, false);
});

// One shared boolean made the primary announce "Logging in…" while the user was
// actually waiting on a magic link. The pending flag names WHICH action is in
// flight so no control can narrate someone else's work.
test("sending a magic link never makes the primary claim it is logging in", async () => {
  let releaseOtp;
  const gate = new Promise(resolve => {
    releaseOtp = resolve;
  });
  const { supabase, calls } = makeSupabase();
  supabase.auth.signInWithOtp = arg => {
    calls.otp.push(arg);
    return gate.then(() => ({ error: null }));
  };
  setUrl("/login");
  window.localStorage.clear();
  configureContext({ navigation: { assign: () => {} }, supabase });
  await renderElement(React.createElement(LoginForm));
  await type('input[type="email"]', "person@example.com");

  await act(async () => fireEvent.click(screen.getByRole("button", { name: /magic link/i })));
  const primary = screen.getByRole("button", { name: "Log in" });
  assert.equal(primary.textContent.trim(), "Log in", "the primary does not narrate the link send");
  assert.equal(primary.disabled, true, "but it is held while another action is in flight");

  await act(async () => {
    releaseOtp();
    await gate;
  });
  await flush();
  assert.match(screen.getByRole("status").textContent, /sign-in link is on its way/);
});

// The button is reachable with an empty form, so it carries its own guard —
// and must not fire a request that GoTrue would refuse anyway.
test("the magic-link button with no email asks for one and sends nothing", async () => {
  const { calls } = await mountLogin();
  await click(/magic link/i);
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Enter your work email/);
  assert.equal(calls.otp.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="email"]'));
});

test("the magic-link button sends an OTP without creating a user", async () => {
  const { calls } = await mountLogin();
  await type('input[type="email"]', "person@example.com");
  await click(/magic link/i);
  await flush();

  assert.equal(calls.otp.length, 1);
  assert.equal(calls.otp[0].email, "person@example.com");
  assert.equal(calls.otp[0].options.shouldCreateUser, false);
  assert.match(screen.getByRole("status").textContent, /sign-in link is on its way/);
});

test("forgot-password sends the reset for the entered email", async () => {
  const { calls } = await mountLogin();
  await type('input[type="email"]', "person@example.com");
  await click(/Forgot password/);
  await flush();

  assert.equal(calls.reset.length, 1);
  assert.equal(calls.reset[0].email, "person@example.com");
});

// The no-account-existence-oracle guarantee (#372) now rests entirely on the
// live buttons: GoTrue answers "no such account" with a distinct error, and
// the pre-fix code let that reach friendlyAuthMessage unmapped-through, which
// produced a different message (and thus an oracle) for an unauthenticated
// visitor probing addresses.
test("magic-link refusal for an unknown account renders the same notice as success", async () => {
  await mountLogin({ results: { otp: { error: null } } });
  await type('input[type="email"]', "person@example.com");
  await click(/magic link/i);
  await flush();
  const successText = screen.getByRole("status").textContent;

  cleanup();

  await mountLogin({ results: { otp: { error: { message: "Signups not allowed for otp" } } } });
  await type('input[type="email"]', "person@example.com");
  await click(/magic link/i);
  await flush();
  const refusalNotice = screen.getByRole("status");

  assert.equal(refusalNotice.textContent, successText, "identical notice text regardless of account existence");
  assert.equal(screen.queryByRole("alert"), null, "the refusal renders as the success/status treatment, not an alert");
});

test("password-reset refusal for an unknown account renders the same notice as success", async () => {
  await mountLogin({ results: { reset: { error: null } } });
  await type('input[type="email"]', "person@example.com");
  await click(/Forgot password/);
  await flush();
  const successText = screen.getByRole("status").textContent;

  cleanup();

  await mountLogin({ results: { reset: { error: { message: "User not found" } } } });
  await type('input[type="email"]', "person@example.com");
  await click(/Forgot password/);
  await flush();
  const refusalNotice = screen.getByRole("status");

  assert.equal(refusalNotice.textContent, successText, "identical notice text regardless of account existence");
  assert.equal(screen.queryByRole("alert"), null, "the refusal renders as the success/status treatment, not an alert");
});

// The neutralization must target only the absence class of failure — a real
// problem (rate limiting, say) still has to explain itself, or a genuinely
// stuck user gets the unhelpful "check your email" runaround forever.
test("magic-link failures that are not absence still explain themselves", async () => {
  await mountLogin({ results: { otp: { error: { message: "Email rate limit exceeded" } } } });
  await type('input[type="email"]', "person@example.com");
  await click(/magic link/i);
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Please wait 60 seconds/);
});

test("a remembered email prefills the form with the checkbox checked", async () => {
  await mountLogin({ rememberedEmail: "person@example.com" });

  assert.equal(document.querySelector('input[type="email"]').value, "person@example.com");
  assert.equal(document.querySelector('input[type="checkbox"]').checked, true);
  assert.equal(document.querySelector('input[type="password"]').value, "", "only the email is remembered");
});

// The write happens at the moment of a real sign-in attempt — the "user has
// committed to this address" point that Continue used to be.
test("Remember persists only the email at sign-in, and unchecking clears it", async () => {
  await mountLogin({ results: { password: { error: { message: "Invalid login credentials" } } } });
  await fillCredentials("person@example.com", "hunter2");
  await act(async () => fireEvent.click(document.querySelector('input[type="checkbox"]')));
  await submit();
  await flush();

  const stored = JSON.stringify(window.localStorage);
  assert.equal(window.localStorage.getItem(REMEMBERED_EMAIL_KEY), "person@example.com");
  assert.doesNotMatch(stored, /hunter2/, "a password never reaches storage");

  await act(async () => fireEvent.click(document.querySelector('input[type="checkbox"]')));
  assert.equal(window.localStorage.getItem(REMEMBERED_EMAIL_KEY), null);
});

test("a sign-in attempt does not store the email when Remember is unchecked", async () => {
  await mountLogin();
  await fillCredentials("person@example.com", "hunter2");
  await submit();
  await flush();
  assert.equal(window.localStorage.getItem(REMEMBERED_EMAIL_KEY), null);
});

test("an ?error query param is surfaced through friendlyAuthMessage on load", async () => {
  await mountLogin({ url: `/login?error=${encodeURIComponent("Invalid login credentials")}` });
  assert.match(screen.getByRole("alert").textContent, /Email or password is incorrect/);
});

// S-02. URLSearchParams already percent-decodes, so a second decodeURIComponent
// on the result threw URIError on any surviving "%" — inside a mount effect,
// which takes the whole login page down. Reachable by hand ("/login?error=%")
// and by our own redirect helper, which encodes a message once
// (lib/supabase/authRedirect.ts): "100% down" round-trips back to "100% down"
// and blew up the same way.
test("a stray percent in ?error does not take the login page down", async () => {
  await mountLogin({ url: "/login?error=%" });
  assert.ok(screen.getByRole("button", { name: "Log in" }), "the form still renders");
  assert.match(screen.getByRole("alert").textContent, /Something went wrong/);
});

test("a singly-encoded ?error is read once, not twice", async () => {
  // %2541 is the encoding of the literal text "%41". Decoding twice turns it
  // into "A" — the payload the sender wrote is not what the page shows.
  await mountLogin({ url: `/login?error=${encodeURIComponent("Invalid login credentials %41")}` });
  assert.match(screen.getByRole("alert").textContent, /Email or password is incorrect/);

  cleanup();
  await mountLogin({ url: "/login?error=%2541" });
  assert.doesNotMatch(screen.getByRole("alert").textContent, /A/, "no second decode pass");
});

// The banner carries role="alert" and the app's error styling, so text that
// reaches it reads as coming from us. ?error= is attacker-writable.
test("an unmapped ?error is not rendered verbatim in the error banner", async () => {
  const injected = "Your account is suspended. Call 555-0100 to restore access.";
  await mountLogin({ url: `/login?error=${encodeURIComponent(injected)}` });
  const alert = screen.getByRole("alert");
  assert.doesNotMatch(alert.textContent, /555-0100/);
  assert.match(alert.textContent, /Something went wrong/);
});

test("the email input disables spellcheck", async () => {
  await mountLogin();
  assert.equal(document.querySelector('input[type="email"]').getAttribute("spellcheck"), "false");
});

test("the eye toggle reveals the password without ever submitting the form", async () => {
  const { calls } = await mountLogin();
  await type('input[type="password"]', "hunter2");

  const toggle = screen.getByRole("button", { name: "Show password" });
  assert.equal(toggle.getAttribute("type"), "button", "a submit here would race the password path");
  await act(async () => fireEvent.click(toggle));
  assert.equal(document.querySelector("#login-password").getAttribute("type"), "text");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");

  await act(async () => fireEvent.click(toggle));
  assert.equal(document.querySelector("#login-password").getAttribute("type"), "password");
  assert.equal(calls.password.length, 0);
});

test("an invalid field is marked for assistive tech, not just coloured", async () => {
  await mountLogin();
  await submit();

  const emailInput = document.querySelector('input[type="email"]');
  assert.equal(emailInput.getAttribute("aria-invalid"), "true");
  const describedBy = emailInput.getAttribute("aria-describedby");
  assert.ok(describedBy, "the error text is bound to the field");
  assert.match(document.getElementById(describedBy).textContent, /Email is required/);
});
