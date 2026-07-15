---
name: chrome-pixel-capture
description: Use when you need pixel-accurate PNG files on disk of a web UI in the user's real Chrome on Windows (design-review screenshots, hover/focus/menu states, responsive widths) and the claude-in-chrome extension's own screenshots won't do — its save-to-disk gives no readable path and inline images are downscaled. Covers the CopyFromScreen + beacon-calibration pipeline and its Win32/extension gotchas.
---

# Chrome pixel-capture (Windows)

Getting a true-pixel PNG of the user's authenticated Chrome needs a split pipeline: the **claude-in-chrome extension** arranges state and verifies truth (navigate, synthetic hover/click/keys, `javascript_tool` assertions), while **PowerShell + GDI `CopyFromScreen`** does the actual disk capture. The extension's screenshots are not deliverables (save-to-disk path isn't retrievable; inline images are downscaled).

This works because CDP-synthesized events set `:hover`/focus **without moving the OS cursor**, and `CopyFromScreen` **excludes** the cursor — so you arrange state synthetically and the screen shows exactly it.

## The core problem this solves

A fixed screen offset (`CopyFromScreen 1920,103,...`) drifts and fails, because two things move the viewport unpredictably:
1. **DPI virtualization** — without `SetProcessDPIAware()` first, captures are scaled, blurry, and offset.
2. **The "Claude started debugging this browser" infobar** slides in *per CDP action*, shifting the page ~40px down and casting a drop-shadow.

The fix: inject a **magenta beacon** at the page's viewport top, then let the capture script find it and wait until the frame is *settled* (no infobar shadow) before cropping relative to it. `capture-settled.ps1` does this.

## Pipeline

1. **Load tools + skill.** `ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,navigate,computer,javascript_tool,find"` then the `claude-in-chrome` skill. Auth-gated app: if `/login` renders, ask the user to sign in — never type their credentials.
2. **New tab in the group** (`tabs_create_mcp`), navigate, and confirm it is actually on screen: `javascript_tool` → `document.visibilityState`. **A backgrounded tab renders but CopyFromScreen captures the wrong window.** If `hidden`, foreground it (step 4).
3. **Inject the beacon + hide extension overlays** (one `javascript_tool` call):
   ```js
   const b=document.createElement('div');b.id='__capbeacon';
   b.style.cssText='position:fixed;top:0;left:0;right:0;height:2px;background:#ff00ff;z-index:2147483647;pointer-events:none;';
   document.body.appendChild(b);
   const s=document.createElement('style');s.id='__capstyles';
   s.textContent='#claude-agent-glow-border,#claude-phantom-cursor{display:none!important}';
   document.head.appendChild(s);
   ```
   The extension injects `#claude-agent-glow-border` (a full-viewport orange gradient) and `#claude-phantom-cursor` **into the page**; both pollute captures — hide them, restore at teardown.
4. **Foreground / size the window with `winfind.ps1`** (NOT the extension's `resize_window` — it's a silent no-op on a maximized window). `-Action restore` un-minimizes + foregrounds; `-Action move -W 960` sets an exact width for responsive shots. Record the DPR from `javascript_tool` → `devicePixelRatio`; on the user's monitor at 1920×… the tab sits at screen x=1920, DPR 1 (verify, don't assume).
5. **Arrange each state**, verifying via JS before capturing:
   - Hover: `computer hover` at the target rect centre → assert `el.matches(':hover')`.
   - Focus ring: real `computer key "Tab"` (not `.focus()` — it misses `:focus-visible`) → read `document.activeElement`.
   - Menu open: `.click()` via `javascript_tool` (coordinate clicks miss — see gotchas) → assert the menu element mounted.
6. **Capture with `capture-settled.ps1`** — full strip `-CropH 46`, or a sub-region with `-CropX -CropW`. For a burst of same-origin crops after you've confirmed the origin, `capture-fixed.ps1` is faster but blind.
7. **`Read` every PNG** to confirm the intended state is visible — the classic failure is "saved" but wrong/black/stale.
8. **Teardown:** remove `#__capbeacon` / `#__capstyles`; return the window to how you found it (`winfind.ps1 -Action minimize`/`maximize`); close the capture tab. If you resized the user's live window, ask before commandeering it (`AskUserQuestion`).

## Scripts

| Script | Use |
|---|---|
| `capture-settled.ps1 -Path <png> [-X -W] [-CropX -CropW -CropY -CropH]` | Default. Needs the beacon. Waits for a settled frame. |
| `capture-fixed.ps1 -Path <png> -X -Y -W -H` | Blind fixed-offset burst after calibration. |
| `winfind.ps1 -TitleMatch <substr> -Action restore\|move\|maximize\|minimize\|rect` | Reliable window control by title. |

Invoke with `& "<skill-dir>\capture-settled.ps1" -Path ...`. `capture-settled.ps1 -X` / `-W` are the monitor origin/width (default 1920/1920); pass the second monitor's real x.

## Gotchas (each cost a live debugging cycle)

- **`SetProcessDPIAware()` must be the first call** in every script (fresh pwsh per invocation = no persisted state). Already baked into the scripts.
- **`resize_window` (extension) is a silent no-op** on a maximized window — reports success, `innerWidth` unchanged. Use `winfind.ps1 -Action move`. Chrome's min width is ~500px.
- **`Get-Process ... .MainWindowHandle` picks the wrong window** when Chrome windows share a process. `winfind.ps1` uses `EnumWindows` + title match instead.
- **Coordinate clicks/hovers miss after a resize** — the extension keeps the *previous* screenshot's coordinate scale. Take a fresh `screenshot`, or act via `find` + element ref, or set state with `javascript_tool` `.click()`. Always verify the menu/panel opened via JS (`!!document.getElementById(...)`), never assume the click landed.
- **Beacon settle fails (`no settled beacon frame`)** → the tab backgrounded (`visibilityState:hidden` while `innerWidth` still reads right), or the infobar is stuck. Re-foreground with `winfind.ps1`; re-check visibility.
- **Native `<select>` ignores synthetic coordinate clicks** — set value with the prototype setter + a bubbling `change` event so React registers it.
- **`save_to_disk` on the extension screenshot returns no retrievable path**; `PrintWindow` captures black under GPU compositing. `CopyFromScreen` is the only working disk pipeline here.
- **GIF export** (`gif_creator` `download:true`) *does* land readably in `%USERPROFILE%\Downloads`.
- Restore the window to the state you found it in, and don't leave the beacon/overlay-hiding style behind.

## Related

See the `run-seat-planner` skill for driving this app specifically, and the user's `live-qa-browser-tooling` memory for the auth constraints (all routes gated; the extension blocks reading the Supabase cookie, so sessions can't be reused into Playwright).
