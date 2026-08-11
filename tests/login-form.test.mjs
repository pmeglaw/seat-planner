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
// by controllable doubles, so we assert on the two-step disclosure, validation,
// the auth calls it makes, and the post-login redirect.
let LoginForm;
before(async () => {
  ({ LoginForm } = await loadComponent("@/components/auth/LoginForm"));
});
afterEach(() => cleanup());

const REMEMBERED_EMAIL_KEY = "seat-planner:login-email";

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

// Step 1 asks for identity, step 2 for the credential. Most tests want to be on
// step 2, so this is the shared way in.
async function advanceToPassword(email = "person@example.com") {
  await type('input[type="email"]', email);
  await submit();
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
  assert.doesNotMatch(html, /Continue<\/button>/, "the live label must not render before hydration");
});

// Progressive auth's structural guarantee: there is no password input in the
// server HTML at all, so the pre-hydration native GET has no credential to
// serialize even if the disabled guard above were ever lost.
test("the server-rendered step 1 contains no password field", async () => {
  const { supabase } = makeSupabase();
  configureContext({ supabase });
  const html = renderToStaticMarkup(React.createElement(LoginForm));

  assert.doesNotMatch(html, /type="password"/);
  // Inputs stay name-less on every step for the same reason.
  assert.doesNotMatch(html, /<input[^>]*\sname=/);
});

test("hydration enables the submit button and restores its label", async () => {
  await mountLogin();
  const submitButton = screen.getByRole("button", { name: "Continue" });
  assert.equal(submitButton.disabled, false, "hydrated submit is clickable");
  assert.doesNotMatch(document.body.innerHTML, /Starting up…/);
});

// Owner decision (Aug 11 2026): step 1 is single-purpose. The magic link is
// offered on step 2 and inside the failed-login notification — never here, and
// never between a field and its primary button (the pattern's hierarchy rule).
test("step 1 asks only for identity and offers no alternate login", async () => {
  await mountLogin();
  assert.equal(screen.getByRole("heading", { name: "Log in" }).tagName, "H1");
  assert.ok(document.querySelector('input[type="email"]'));
  assert.equal(document.querySelector('input[type="password"]'), null, "password is not disclosed yet");
  assert.equal(screen.getByRole("button", { name: "Continue" }).getAttribute("type"), "submit");
  assert.equal(screen.queryByRole("button", { name: /sign-in link/i }), null, "no magic link on step 1");
  assert.equal(screen.queryByRole("button", { name: /Forgot password/ }), null, "no reset on step 1");
});

test("Continue discloses the password step and carries the email into a summary row", async () => {
  await mountLogin();
  await advanceToPassword("person@example.com");

  assert.ok(document.querySelector('input[type="password"]'), "password is disclosed");
  assert.equal(document.querySelector('input[type="email"]'), null, "email becomes a summary row, not a second field");
  assert.match(document.body.textContent, /person@example\.com/);
  assert.equal(screen.getByRole("button", { name: "Log in" }).getAttribute("type"), "submit");
  // The link request must never be a submit: it would race the password path.
  assert.equal(screen.getByRole("button", { name: /sign-in link/i }).getAttribute("type"), "button");
  assert.ok(screen.getByRole("button", { name: "Edit" }), "the way back");
  assert.ok(screen.getByRole("button", { name: /Forgot password/ }));
});

// tests/e2e-auth/auth-helpers.ts drives the flow with button:text-is("Continue")
// then button:text-is("Log in") — and the step-2 heading is also "Log in", which
// is why it uses text-is rather than has-text. Playwright binds that engine to
// the SMALLEST element containing the text, so wrapping a label in a span (for a
// label-left/arrow-right split, say) makes the span capture it and the button
// stop matching, and every authenticated e2e test loses its sign-in step. Keep
// both labels direct text children.
test("both primary labels are direct text children so the e2e locators still bind", async () => {
  await mountLogin();

  const ownText = button =>
    Array.from(button.childNodes)
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent)
      .join("")
      .trim();

  const advance = screen.getByRole("button", { name: "Continue" });
  assert.equal(ownText(advance), "Continue");
  assert.equal(advance.textContent.trim(), "Continue", "decoration must not add text");

  await advanceToPassword();
  const login = screen.getByRole("button", { name: "Log in" });
  assert.equal(ownText(login), "Log in");
  assert.equal(login.textContent.trim(), "Log in", "decoration must not add text");
});

test("Continue with no email shows the inline error and makes no auth call", async () => {
  const { calls } = await mountLogin();
  await submit();

  assert.match(document.body.textContent, /Email is required/);
  assert.ok(document.querySelector('input[type="email"]'), "the form stays on step 1");
  assert.equal(calls.password.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="email"]'));
});

// Format only — a well-formed address always advances, so the check can never
// become an oracle for which accounts exist.
test("Continue rejects a malformed address and accepts any well-formed one", async () => {
  await mountLogin();
  await type('input[type="email"]', "not-an-email");
  await submit();
  assert.match(document.body.textContent, /Enter a valid email address/);
  assert.ok(document.querySelector('input[type="email"]'), "still on step 1");

  await type('input[type="email"]', "nobody@example.com");
  await submit();
  assert.ok(document.querySelector('input[type="password"]'), "unknown addresses advance just the same");
});

test("the inline email error clears as soon as the field is corrected", async () => {
  await mountLogin();
  await submit();
  assert.match(document.body.textContent, /Email is required/);

  await type('input[type="email"]', "person@example.com");
  assert.doesNotMatch(document.body.textContent, /Email is required/);
});

test("step 2 requires a password", async () => {
  const { calls } = await mountLogin();
  await advanceToPassword();
  await submit();

  assert.match(document.body.textContent, /Password is required/);
  assert.equal(calls.password.length, 0);
  assert.equal(document.activeElement, document.querySelector('input[type="password"]'));
});

test("Edit returns to step 1 with the email intact", async () => {
  await mountLogin();
  await advanceToPassword("person@example.com");
  await type('input[type="password"]', "hunter2");
  await click("Edit");

  const emailInput = document.querySelector('input[type="email"]');
  assert.ok(emailInput, "back on step 1");
  assert.equal(emailInput.value, "person@example.com", "no retyping");
  assert.equal(document.activeElement, emailInput);

  // The password must not survive the round trip.
  await advanceToPassword("person@example.com");
  assert.equal(document.querySelector('input[type="password"]').value, "");
});

test("successful sign-in calls Supabase with the credentials and redirects to ?next", async () => {
  const { calls, assigned } = await mountLogin({ url: "/login?next=/admin" });
  await advanceToPassword("person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();

  assert.deepEqual(calls.password, [{ email: "person@example.com", password: "hunter2" }]);
  assert.match(screen.getByRole("status").textContent, /Redirecting/);
  assert.deepEqual(assigned, ["/admin"]);
});

test("an open-redirect ?next is ignored in favor of '/'", async () => {
  const { assigned } = await mountLogin({ url: "/login?next=https://evil.example" });
  await advanceToPassword("person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();
  assert.deepEqual(assigned, ["/"]);
});

test("a Supabase error is mapped to friendly guidance and blocks redirect", async () => {
  const { assigned } = await mountLogin({ results: { password: { error: { message: "Email rate limit exceeded" } } } });
  await advanceToPassword("person@example.com");
  await type('input[type="password"]', "hunter2");
  await submit();
  await flush();
  assert.match(screen.getByRole("alert").textContent, /Please wait 60 seconds/);
  assert.deepEqual(assigned, []);
});

// Canvas 2c: the failure notification clears the password and carries the magic
// link as its action, so recovery is offered where the failure happened. Focus
// goes to the password (the field that needs retyping) rather than the email of
// the pattern's single-step drawing — on step 2 the email is a summary row.
test("a failed password attempt clears the password and offers the magic link in place", async () => {
  const { calls } = await mountLogin({ results: { password: { error: { message: "Invalid login credentials" } } } });
  await advanceToPassword("person@example.com");
  await type('input[type="password"]', "wrong-password");
  await submit();
  await flush();

  assert.match(screen.getByRole("alert").textContent, /Email or password is incorrect/);
  assert.equal(document.querySelector('input[type="password"]').value, "", "password cleared");
  assert.equal(document.activeElement, document.querySelector('input[type="password"]'));

  const recovery = screen.getByRole("alert").querySelector("button");
  assert.match(recovery.textContent, /Email me a sign-in link instead/);
  await act(async () => fireEvent.click(recovery));
  await flush();

  assert.equal(calls.otp.length, 1, "the notification action sends the link");
  assert.equal(calls.otp[0].email, "person@example.com", "with the email already entered");
  assert.equal(calls.otp[0].options.shouldCreateUser, false);
});

test("the step-2 magic-link button sends an OTP without creating a user", async () => {
  const { calls } = await mountLogin();
  await advanceToPassword("person@example.com");
  await click(/sign-in link/i);
  await flush();

  assert.equal(calls.otp.length, 1);
  assert.equal(calls.otp[0].email, "person@example.com");
  assert.equal(calls.otp[0].options.shouldCreateUser, false);
  assert.match(screen.getByRole("status").textContent, /Check your email/);
});

test("forgot-password sends the reset for the email entered on step 1", async () => {
  const { calls } = await mountLogin();
  await advanceToPassword("person@example.com");
  await click(/Forgot password/);
  await flush();

  assert.equal(calls.reset.length, 1);
  assert.equal(calls.reset[0].email, "person@example.com");
});

// Owner ruling: a returning visitor is prefilled and re-checked but still lands
// on step 1 — skipping straight to the password would hide the wrong-account
// escape and make first paint depend on storage state.
test("a remembered email prefills step 1 without skipping it", async () => {
  await mountLogin({ rememberedEmail: "person@example.com" });

  assert.equal(document.querySelector('input[type="email"]').value, "person@example.com");
  assert.equal(document.querySelector('input[type="checkbox"]').checked, true);
  assert.ok(document.querySelector('input[type="email"]'), "still step 1");
  assert.equal(document.querySelector('input[type="password"]'), null);
});

test("Remember persists only the email, and unchecking clears it", async () => {
  await mountLogin();
  await type('input[type="email"]', "person@example.com");
  await act(async () => fireEvent.click(document.querySelector('input[type="checkbox"]')));
  await submit();
  await type('input[type="password"]', "hunter2");
  await flush();

  const stored = JSON.stringify(window.localStorage);
  assert.equal(window.localStorage.getItem(REMEMBERED_EMAIL_KEY), "person@example.com");
  assert.doesNotMatch(stored, /hunter2/, "a password never reaches storage");

  await click("Edit");
  await act(async () => fireEvent.click(document.querySelector('input[type="checkbox"]')));
  assert.equal(window.localStorage.getItem(REMEMBERED_EMAIL_KEY), null);
});

test("Continue does not store the email when Remember is unchecked", async () => {
  await mountLogin();
  await advanceToPassword("person@example.com");
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
  assert.ok(screen.getByRole("button", { name: "Continue" }), "the form still renders");
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

test("an invalid field is marked for assistive tech, not just coloured", async () => {
  await mountLogin();
  await submit();

  const emailInput = document.querySelector('input[type="email"]');
  assert.equal(emailInput.getAttribute("aria-invalid"), "true");
  const describedBy = emailInput.getAttribute("aria-describedby");
  assert.ok(describedBy, "the error text is bound to the field");
  assert.match(document.getElementById(describedBy).textContent, /Email is required/);
});
