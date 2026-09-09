// Phase 5 PR 2 capture + measure rig — Reception's narrow frame.
//
// Proves owner ruling R1 (the readout splits by job below the 1055 fold: the
// band pinned under the search, the tail below the list) and R2 (the width
// varies, so it holds at 480 / 640 / 800 / 1024, not at one tuned width), plus
// the reviewer's conditions on findings O-1, O-3 and O-4.
//
// EVERY geometric claim here is a HIT TEST, not a visibility check. The
// precedent is PR 4's amendment D, where a tooltip passed a visibility
// assertion while it was clipped — `toBeVisible()` would have passed for a
// numeral sitting under the pinned band too.
//
// Usage: node docs/redesign-v2/phase5/audit/pr2-reception-narrow.mjs <baseUrl> <outDir> <email> <password>
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; the
// seeded viewer is e2e-viewer@example.test). Local dev writes to PRODUCTION —
// never point this at seats.megeredchianlaw.com. Reception is read-only either
// way, but the habit is the point.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [base = "http://localhost:3300", outDir = "out", email = "e2e-viewer@example.test", password] =
  process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// R2: the receptionist DRAGS the window, so the band is proved across the
// range, not at a tuned width. 1024 is deliberately included — it is the
// Tailwind-lg / sheet-fold seam, where the shell has already handed the scroll
// to the pane while the sheet is still below its 1055 fold.
const WIDTHS = [480, 640, 800, 1024];
const THEMES = ["light", "dark"];
const results = [];
const measurements = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function setTheme(page, theme) {
  await page.evaluate(t => {
    localStorage.setItem("sp-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-carbon-theme", t === "dark" ? "g100" : "white");
  }, theme);
  await page.waitForTimeout(150);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function signIn(page) {
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Log in$/ }).click();
  await page.waitForURL(/\/(admin|reception|$)/, { timeout: 30_000 });
}

async function openReception(page) {
  await page.goto(`${base}/reception`);
  await page.waitForSelector("li[role=option]", { timeout: 20_000 });
}

// Lock the first row by name, the way the receptionist does: type, ↵.
async function lockFirst(page) {
  const name = (await page.locator("li[role=option] .sp-recep-name").first().textContent()).trim();
  await page.locator("#reception-main").fill(name);
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForSelector('li[role=option][aria-selected="true"]', { timeout: 10_000 });
  return name;
}

// The hit test: is this element's own box the thing painted at those points?
// `elementFromPoint` walks the real paint stack, so a numeral covered by the
// band, clipped by a scroll container or pushed off-screen fails here while
// `toBeVisible()` would pass.
async function hitTest(page, selector, { corners = false } = {}) {
  return page.evaluate(
    ([sel, wantCorners]) => {
      const el = document.querySelector(sel);
      if (!el) return { ok: false, why: "no element" };
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const inside = r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
      const points = wantCorners
        ? [
            [r.left + 2, r.top + 2],
            [r.right - 2, r.top + 2],
            [r.left + 2, r.bottom - 2],
            [r.right - 2, r.bottom - 2]
          ]
        : [[r.left + r.width / 2, r.top + r.height / 2]];
      const hits = points.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)));
      });
      return {
        ok: inside && hits.every(Boolean),
        inside,
        hits,
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
        viewport: { vw, vh }
      };
    },
    [selector, corners]
  );
}

async function boxes(page) {
  return page.evaluate(() => {
    const read = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
    };
    return {
      search: read(".sp-search-lg"),
      band: read(".sp-recep-band"),
      header: read(".sp-recep-header"),
      firstRow: read("li[role=option]"),
      tail: read(".sp-recep-tail"),
      recents: read(".sp-recep-recent"),
      bandSticky: getComputedStyle(document.querySelector(".sp-recep-band")).position,
      bandTop: getComputedStyle(document.querySelector(".sp-recep-band")).top
    };
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", message => {
    if (message.type() === "error") console.log(`  console.error: ${message.text()}`);
  });

  await signIn(page);

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const tag = `${width}-${theme}`;
      await page.setViewportSize({ width, height: 900 });
      await openReception(page);
      await setTheme(page, theme);

      // --- state 1: waiting for a call (the band holds the empty copy) -----
      const waiting = await page.locator(".sp-recep-band .sp-recep-waiting").count();
      record(`${tag} · the band holds "Waiting for a call"`, waiting === 1);
      await shot(page, `01-waiting-${tag}`);

      const name = await lockFirst(page);
      await page.waitForTimeout(150);
      const b = await boxes(page);
      measurements.push({ width, theme, ...b });

      // --- claim 2: the band is between the search and the list ------------
      record(
        `${tag} · the band sits under the search and above the list`,
        b.band.top >= b.search.bottom - 1 && b.band.bottom <= b.firstRow.top + 1,
        `search ${b.search.bottom} · band ${b.band.top}-${b.band.bottom} · first row ${b.firstRow.top}`
      );
      record(`${tag} · the band is sticky`, b.bandSticky === "sticky", `top: ${b.bandTop}`);
      // The seam: at 1024 the shell pane scrolls, so the offset must be 0, not
      // the 48 header — inherited, not set by a class of its own.
      record(
        `${tag} · the sticky offset matches the scroll model`,
        width >= 1024 ? b.bandTop === "0px" : b.bandTop === "48px",
        b.bandTop
      );

      // --- claim 1 + 9: the numeral survives the list scrolling to its end --
      await page.evaluate(() => {
        const pane = document.querySelector('[aria-label="Reception directory"]');
        if (pane && pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(200);
      const numeral = await hitTest(page, ".sp-recep-band .sp-readout-numeral");
      record(
        `${tag} · the numeral is painted and on screen with the list scrolled to its end`,
        numeral.ok,
        JSON.stringify(numeral.rect)
      );
      const bandCorners = await hitTest(page, ".sp-recep-band", { corners: true });
      record(`${tag} · the whole band is inside the viewport, all four corners`, bandCorners.ok);
      // Pinning means the band MOVES UP to its offset and stops there — not
      // that it stays put. In viewport coordinates that offset is 48 in both
      // scroll models: below 1024 the document scrolls and the band's own
      // `top` is the 48 header; at 1024 the pane scrolls, the band's `top` is
      // 0, and the pane itself starts 48 down under the fixed header.
      const pinned = await boxes(page);
      record(
        `${tag} · the band pins at the top of the scrollport while the list runs under it`,
        pinned.band.top === 48 && pinned.band.top < b.band.top,
        `${b.band.top} → ${pinned.band.top} (offset ${b.bandTop})`
      );
      await shot(page, `02-locked-scrolled-${tag}`);

      // --- claim 5: nothing focusable inside the band (O-1(a)) -------------
      const focusables = await page.evaluate(
        () => document.querySelector(".sp-recep-band").querySelectorAll("a, button, input, select, textarea, [tabindex]").length
      );
      record(`${tag} · zero focusable elements inside the band`, focusables === 0, `${focusables}`);
      const backCount = await page.getByRole("button", { name: "Back to the list" }).count();
      record(`${tag} · D3-f: no "Back to the list"`, backCount === 0);

      // --- claim 8: the loop, not the pixels (O-4) -------------------------
      // After a lock the field keeps focus and the query is cleared, so the
      // next lookup is typed straight away — the field is never "scrolled back
      // up to", it is already under the caret.
      const focusId = await page.evaluate(() => document.activeElement?.id ?? "");
      const scrollBefore = await page.evaluate(() => ({
        win: Math.round(window.scrollY),
        pane: Math.round(document.querySelector('[aria-label="Reception directory"]')?.scrollTop ?? 0)
      }));
      await page.keyboard.type("a");
      await page.waitForTimeout(150);
      const countAfter = await page.locator(".sp-recep-count").textContent();
      const scrollAfter = await page.evaluate(() => ({
        win: Math.round(window.scrollY),
        pane: Math.round(document.querySelector('[aria-label="Reception directory"]')?.scrollTop ?? 0)
      }));
      record(
        `${tag} · after the lock focus is in the field and typing filters, with no user scroll`,
        focusId === "reception-main" && /match/.test(countAfter),
        `focus=${focusId} · count="${countAfter}" · scroll ${JSON.stringify(scrollBefore)} → ${JSON.stringify(scrollAfter)}`
      );
      const bandWhileTyping = await hitTest(page, ".sp-recep-band", { corners: true });
      record(`${tag} · the band is fully in the viewport while the field has focus`, bandWhileTyping.ok);

      // --- claim 10: the arrow cursor never parks under the pinned band ----
      for (let i = 0; i < 12; i += 1) await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(150);
      for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(250);
      const parked = await page.evaluate(() => {
        const cursor = document.querySelector("li[role=option][data-highlight]");
        const band = document.querySelector(".sp-recep-band");
        if (!cursor || !band) return { ok: false, why: "no cursor" };
        const c = cursor.getBoundingClientRect();
        const bb = band.getBoundingClientRect();
        const hit = document.elementFromPoint(c.left + c.width / 2, c.top + 4);
        return {
          ok: c.top >= bb.bottom - 1 && Boolean(hit && cursor.contains(hit)),
          cursorTop: Math.round(c.top),
          bandBottom: Math.round(bb.bottom)
        };
      });
      record(
        `${tag} · the ↑ cursor row is never under the pinned band`,
        parked.ok,
        `cursor top ${parked.cursorTop} · band bottom ${parked.bandBottom}`
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);

      // --- claim 6: tab order (O-1(b)) -------------------------------------
      const order = await tabWalk(page);
      const bandStops = order.filter(stop => stop.inBand);
      const firstTail = order.findIndex(stop => stop.inTail);
      const firstRecent = order.findIndex(stop => stop.inRecents);
      record(
        `${tag} · the band is never a tab stop; the tail precedes recents`,
        bandStops.length === 0 && (firstTail === -1 || firstRecent === -1 || firstTail < firstRecent),
        order.map(stop => stop.label).join(" → ")
      );

      // --- claim 12: the tail follows the list, in §1R.4's shipped order ----
      const after = await boxes(page);
      if (after.tail) {
        record(
          `${tag} · the tail follows the list`,
          after.tail.top >= after.firstRow.top,
          `first row ${after.firstRow.top} · tail ${after.tail.top}`
        );
      }
      // Whether a lock has same-department colleagues is a property of the
      // seed, not of the layout, so lock someone who HAS them before asserting
      // the order — otherwise this reads as an O-2 regression on a person who
      // is simply the only extension in their department.
      const withFallback = await lockPersonWithFallback(page);
      if (withFallback) {
        const tailOrder = await page.evaluate(() => {
          const tail = document.querySelector(".sp-recep-tail");
          return [...tail.children].map(child => (child.classList.contains("sp-recep-fallback") ? "fallback" : child.tagName.toLowerCase()));
        });
        record(
          `${tag} · tail order is fallbacks then Show on map (O-2)`,
          tailOrder[0] === "fallback" && tailOrder.includes("a"),
          `${withFallback}: ${tailOrder.join(",")}`
        );
      } else {
        record(`${tag} · a person with same-department colleagues exists in the seed`, false, "skipped — none found");
      }

      // --- claim 11: one live region in the readout, extension once --------
      // The extension SLOT, not the numeral: §1R.4 item 4 makes "No extension
      // on file" a stated state, so a person without one still has exactly one
      // slot. Counting the slot is what catches the thing Constraint 1 forbids
      // — a second, hidden copy rendered for the other frame — without the
      // claim depending on which person the previous step happened to lock.
      const live = await page.evaluate(() => {
        const band = document.querySelector(".sp-recep-band");
        const slots = document.querySelectorAll(".sp-readout-numeral, .sp-readout-none");
        return {
          bandIsLive: band.getAttribute("aria-live") === "polite",
          liveInReadout: document.querySelectorAll(".sp-recep-band[aria-live], .sp-recep-tail [aria-live], .sp-recep-recent [aria-live]").length,
          slots: slots.length,
          kind: slots[0]?.className ?? "",
          text: slots[0]?.textContent ?? ""
        };
      });
      record(
        `${tag} · one live region (the band), one extension slot in the DOM`,
        live.bandIsLive && live.liveInReadout === 1 && live.slots === 1,
        `${live.kind} "${live.text}"`
      );

      // --- claim 4: reflow — no sideways scroll, nothing off-edge ----------
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        offEdge: [...document.querySelectorAll(".sp-recep-band *")].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
        }).length
      }));
      record(
        `${tag} · no sideways scroll and nothing off-edge in the band`,
        overflow.scrollWidth <= overflow.clientWidth && overflow.offEdge === 0,
        `${overflow.scrollWidth}/${overflow.clientWidth}, ${overflow.offEdge} off-edge`
      );

      // --- claim 3: "No extension on file" holds the band too --------------
      const noExt = await lockPersonWithoutExtension(page);
      if (noExt) {
        const sentence = await page.locator(".sp-recep-band .sp-readout-none").count();
        const hit = await hitTest(page, ".sp-recep-band .sp-readout-none");
        record(`${tag} · the band holds "No extension on file" (§1R.4 item 4)`, sentence === 1 && hit.ok, noExt);
        await shot(page, `03-no-extension-${tag}`);
      } else {
        record(`${tag} · a person with no extension exists in the seed`, false, "skipped — none found");
      }

      measurements[measurements.length - 1].lockedName = name;
    }
  }

  // The >=1056 proof lives in the page-frames spec (480 / 32 / 1008); these are
  // the reference captures beside it.
  for (const theme of THEMES) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openReception(page);
    await setTheme(page, theme);
    await lockFirst(page);
    await page.waitForTimeout(200);
    const wide = await page.evaluate(() => {
      const readout = document.querySelector(".sp-recep-readout").getBoundingClientRect();
      const list = document.querySelector(".sp-recep-list").getBoundingClientRect();
      return {
        readoutWidth: Math.round(readout.width),
        listWidth: Math.round(list.width),
        gutter: Math.round(readout.left - (list.left + list.width)),
        bandIsColumn: getComputedStyle(document.querySelector(".sp-recep-band")).flexDirection,
        bandPosition: getComputedStyle(document.querySelector(".sp-recep-band")).position
      };
    });
    record(
      `1920-${theme} · the wide frame is untouched: readout 480, gutter 32, list 1008`,
      wide.readoutWidth === 480 && wide.gutter === 32 && wide.listWidth === 1008,
      JSON.stringify(wide)
    );
    record(
      `1920-${theme} · above the fold the band is a plain column in the readout`,
      wide.bandIsColumn === "column" && wide.bandPosition === "static"
    );
    await shot(page, `04-wide-1920-${theme}`);
  }

  const passed = results.filter(r => r.ok).length;
  writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify({ generated: new Date().toISOString(), base, passed, total: results.length, results, measurements }, null, 2)
  );
  console.log(`\n${passed}/${results.length}`);
  await browser.close();
  process.exitCode = passed === results.length ? 0 : 1;
}

// Walk real Tab presses from the field and label each stop by the group it
// lands in. The list's rows are NOT tab stops by design — the cursor roves
// through aria-activedescendant (§1R.7) — so what this proves is that the band
// never takes focus and the tail comes before recents.
async function tabWalk(page) {
  await page.locator("#reception-main").focus();
  const stops = [];
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 28),
        inBand: Boolean(el.closest(".sp-recep-band")),
        inTail: Boolean(el.closest(".sp-recep-tail")),
        inRecents: Boolean(el.closest(".sp-recep-recent"))
      };
    });
    if (!stop) break;
    stops.push(stop);
    if (stops.length >= 2 && stop.inRecents) break;
  }
  return stops;
}

// Lock the first person in the list who turns out to have same-department
// colleagues with extensions, so the tail-order claim is about the ORDER and
// not about the seed's departments.
async function lockPersonWithFallback(page) {
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("li[role=option] .sp-recep-name")].slice(0, 12).map(el => el.textContent.trim())
  );
  for (const name of names) {
    await page.locator("#reception-main").fill(name);
    await page.waitForTimeout(100);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    const has = await page.locator(".sp-recep-tail .sp-recep-fallback").count();
    if (has === 1) return name;
  }
  return null;
}

async function lockPersonWithoutExtension(page) {
  const name = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("li[role=option]")];
    const row = rows.find(r => !(r.querySelector(".sp-recep-ext")?.textContent ?? "").trim());
    return row?.querySelector(".sp-recep-name")?.textContent?.trim() ?? null;
  });
  if (!name) return null;
  await page.locator("#reception-main").fill(name);
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  return name;
}

run();
