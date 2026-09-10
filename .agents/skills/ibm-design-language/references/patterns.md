# The seventeen universal patterns

Carbon draws a hard line: a **component** is designed, coded and importable; a **pattern** has multiple valid answers and combines components with additional decisions. That's why most patterns ship no code. Patterns are the judgement layer.

Read together, almost all of them argue one thing: **match disruption to consequence, and default low.**

## Contents
- [Common actions](#common-actions)
- [Dialogs](#dialogs)
- [Notifications](#notifications)
- [Empty states](#empty-states)
- [Forms](#forms)
- [Filtering](#filtering)
- [Search](#search)
- [Disclosures](#disclosures)
- [Disabled and read-only states](#disabled-and-read-only-states)
- [Loading](#loading)
- [Login](#login)
- [Overflow content](#overflow-content)
- [Fluid styles](#fluid-styles)
- [Text toolbar](#text-toolbar)

Global header and status indicators have their own reference files.

---

## Common actions

Standard vocabulary so the same word means the same thing everywhere.

| Action | Treatment |
|---|---|
| Add | Inserts an existing object into a list or system. Emphasis high/medium/low by importance; only one primary button. |
| Cancel | Stops and closes; undoes applied changes. Secondary button or link. Warn if consequences follow. |
| Clear | Removes data from a field or resets to default. Close icon on the right of the field. |
| Close | Terminates a page, window, menu, or dismisses a notification. Close icon, upper right. **Never a button labelled "Close".** |
| Copy | Copy icon with a "copied" confirmation tooltip after click. |
| Delete | Destroys. See impact tiers below. |
| Edit | Menu option, button, or edit icon. |
| Next | Advances a sequence. Button with icon or forward icon. |
| Refresh | Reloads a view that's out of sync with its source. |
| Remove | Takes an object out of a list without destroying it. Rarely primary; don't over-emphasize. |
| Reset | Reverts to the last saved state — the values from the last Apply. Usually a link. |

**Deletion impact tiers.** Low: trivially undone — delete on click, no warning. Moderate: can't be undone easily, or affects more than one thing — confirm with the consequences described. High: expensive or slow to recreate, large volume, or cascades into other objects — confirm **and** require the user to type the resource name.

After deletion: return to the list, animate the removal, show a success notification. On failure, raise a notification and, if possible, send a second one on another channel; animate the data back.

Error copy: brief, honest, supportive; what happened and what to do. Full-page and large modal errors ≤3 paragraph lines; form field errors ≤2 lines.

## Dialogs

Triggered by a user action, on top of page content, persistent until dismissed. Purpose immediately apparent, path to completion obvious.

**Use for**: focusing attention, short task completion, gathering input, displaying relevant information.
**Don't use for**: content unrelated to the workflow; complex or large data; recreating a page; anything the user didn't trigger.

**Modal** blocks the page — for critical information or required input. **Non-modal** leaves the page usable — for optional or supporting tasks like find-and-replace, and can be moved.

Modal variants: **passive** (no actions), **transactional** (cancel + primary), **acknowledgment** (single button), **progress** (cancel, previous, next).

Hard rules:
- **Never nest modals.** If a modal task depends on a confirmation modal, that task shouldn't be in a modal.
- **Never make a modal full-page.** If it needs more than the large size, it's a page.
- Don't use one when the user must consult information outside it.
- Dialogs must be user-initiated. A background process finishing is not a user action — use a toast.

Buttons: cancel outermost left, primary outermost right, one primary only, full bleed to the bottom edge. One button = 50% width, right. Two = 50/50. Three = 25% each, right-aligned, only the rightmost may be primary. Progress: cancel (ghost, left), previous + next grouped right at 25% each; the final step's Next takes the name of the final action.

Behavior: initial focus on the first element that accepts input — not on a button if there are inputs. Focus trapped until closed, then returned to the invoking element. Body scrolls with header and footer fixed. Validate before closing; keep the dialog open on error with an inline message. During a short load, spinner and overlay over the body with the primary button disabled.

Avoid inside a dialog: links that lead away, accordions and tabs that hide content, and complex data tables. Selections in a table are fine; batch editing inside a modal is not.

## Notifications

Relevant, timely, informative. Two origins, and the origin decides the vehicle: **task-generated** goes inline in the region the user is working in; **system-generated** goes to a toast.

Status: informational (blue, info filled), success (green, checkmark filled), warning (yellow, warning filled), error (red, error filled).

| Type | Behavior |
|---|---|
| Inline | Non-disruptive, confined to its area. Persists until resolved or dismissed. Under two lines. Never covers content. May carry one ghost button. |
| Toast | Slides in top right. Fixed width, never expanded to fit. ≤3 lines. Newest on top. Auto-dismiss only without an action; with an action it persists. |
| Actionable | Inline- or toast-styled with interaction. **Takes focus when triggered** — highly disruptive for screen reader and keyboard users. One action only, label ≤2 words. |
| Callout | Loads with the page. Not triggered, not dismissible, not feedback. Guidance before a task. No success or error status exists. Place near the control it informs. Don't stack several on a page. |
| Banner | Top of the interface, product- or system-wide, unrelated to a task. One at a time. Scrolls with content — not sticky. |
| Notification panel | A centre for system-generated messages. Chronological, groupable by source or urgency. Let users manage preferences; don't resend an unacknowledged notification. |
| Modal | Highly disruptive. Only when critical and immediate. One at a time. |

High-contrast style for urgent, low-contrast for supplemental — never mix styles within a variation.

Accessibility: never dismiss critical messages on a timer (WCAG 2.2.4); let users limit non-critical notifications (2.2.3).

## Empty states

Anatomy: optional image, title (write it as a positive — "Start by adding data assets" over "You don't have any"), body explaining the next action, optional primary action, optional secondary link.

Three kinds:
- **No data** — first use. Say what will appear here and how to add it.
- **User action** — no search results, or process complete. Suggest adjusting search or filters.
- **Error management** — permissions, systems, configuration, unsupported action. Higher specificity: why there's no data *and* what to do. Plain language, no codes, no jokes.

Rules that catch people:
- The empty state **replaces** the element it stands in for. A table's headers and footer go with it — otherwise a screen reader reads the whole empty table first.
- Never lead into a dead end.
- Don't cover multiple options — pick the most important.
- Don't use product-specific terms a new user won't know, or talk about other areas of the app.
- Left-align the block. The exception is a small tile, where the image centers above left-aligned text so it doesn't read as content.
- Multiple empty states on one screen: use tertiary buttons so there aren't several primaries, and consider text-only.
- Decorative illustrations get an empty `alt` so screen readers skip them.

Deeper alternatives for first use: in-line documentation, onboarding flows (always alongside a basic empty state, since onboarding is optional), and starter content.

## Forms

Ask only for what's necessary. Group related tasks under section titles, follow a predictable order, and let people stay on one input method.

Labels: sentence case, one to three words, no colons, above the field. Every input needs one.

**Mark the minority.** Mostly-required form → mark only `(optional)`. Mostly-optional form → mark only `(required)`. Decide once for the whole product.

Choosing a control:

| Need | Control |
|---|---|
| A few words | Text input |
| Hidden value | Password input |
| Multiple lines | Text area |
| One or more from a few | Checkbox |
| Exactly one from a few | Radio button |
| Binary setting | Toggle (always label the affected attribute) |
| One from many | Combo box |
| Several from many | Multiselect |
| Incremental number | Number input |
| Number in a range | Slider |
| Date / time | Date picker / time picker |

More than five options → a select list, not radios or checkboxes.

Help: **helper text** is always visible, for need-to-know. **Placeholder** disappears, so never put anything essential there. **Tooltips** use the "i" icon and hold added, not essential, information.

Buttons at the bottom, never pinned to the top. In-page forms: primary left, left-aligned. Wizards, dialogs and side panels: primary right. In containers, the button group spans the width and bleeds to the bottom edge. Name the action, not "Submit".

Validation: client-side on blur; server-side errors return as an inline notification plus field-level messages. Short forms may disable the primary button until valid; long forms should not, because the error and the button won't be on screen together. Disable on submit to prevent duplicates.

Longer forms: progressive disclosure, accordion sections (not in dialogs), or multistep with a progress indicator.

Single column by default. Two or three inputs on a line only when they logically belong together (city / state / zip).

## Filtering

Selection methods: single (behaves like radio), multiselect (behaves like checkbox), multiple categories, batch updates ("Apply"), instant updates.

Batch when selections span categories or the data is slow to return. Instant when there's one category or one expected selection.

- **Multiple categories must never be inside a menu or dropdown.** Left rail, vertical; or a horizontal strip above the data.
- Start each category all-selected if users typically exclude a few; all-unselected if they typically want one.
- A collapsed filter container needs a visible count of applied filters and a way to clear without reopening.
- Every category needs a clear-all. Multiple categories need a global clear-all.

## Search

| Type | When |
|---|---|
| Basic | Routes to a distinct results page. Large, slow, or expensive data; unfamiliar data structures. |
| Active | Runs on each character, results in place, no results page. Small data sets, on-page catalogs, tables. |
| Focused | Active results within the current scope plus an option to widen to everything. |

- **Never label a search field.** The magnifier plus useful placeholder is the convention.
- **Always display the number of results, including zero** — and per scope if a scope filter exists.
- No results is an empty state with a suggested next action, not silence.
- Include a loading indicator if the search takes more than a moment; a progress bar for heavy searches.
- Optional scope filter selects one category at a time and always offers "All"/"Any", selected by default.
- RTL languages flip the field layout; the magnifier icon is universal.

Keyboard: Tab in, Enter runs. Type-ahead cycled by arrows, Enter chooses, Esc exits without selecting. After toggling a facet, keep focus where it was as content reloads.

## Disclosures

A trigger plus a container that opens on click. Unlike a tooltip, the content may be interactive.

Use for settings, filter and sort menus, profile menus, combo buttons — anything revealing more about part of the UI.

- One open at a time.
- **Never nested** (side-flyout submenus in a context menu are fine).
- Never wider than six columns.
- Never auto-opened.
- Never hide critical information inside one.
- Close icon, if present, sits top right in empty space, never inline with interactive elements.

Trigger sizes 48/40/32px; trigger icons 20 or 16px. Keep ~16px between interactive elements inside.

Keyboard: Enter or Space opens; focus moves to the first item; arrows navigate menu items; Tab moves between interactive elements in a settings menu; Esc closes.

## Disabled and read-only states

The distinction matters because **disabled components are not read by screen readers and do not pass contrast**.

| State | Use when | Behavior |
|---|---|---|
| Disabled | Temporarily unavailable pending a user action or unmet dependency | Not interactive, not announced, not keyboard-reachable. Component stays visible. |
| Read-only | The content still needs reading — a running process, a lock, or view-only permissions | Keyboard-navigable but not operable. Text color unchanged, still passes 4.5:1. |
| Hidden | The user lacks permission to know it exists | Absent entirely until permissions change. |

Disabled styling: component 50% opacity, text 25%, icons 50%, no hover, `cursor: not-allowed`. Where a disabled control blocks a primary action, pair it with an inline warning explaining how to enable it.

Read-only anatomy: transparent background (fluid fields keep their fill), border color de-emphasized, text color unchanged, signifier icons in `$icon-disabled`, arrow cursor. Keep the same structure and spacing as enabled.

Never convert a disabled component to read-only because the surrounding view is read-only. Never use read-only for content that has no enabled state — that's just static text.

## Loading

**Skeleton states** for initial page load — only on container components (tiles, structured lists) and data components (tables, cards). Action components generally don't need them. **Never** skeleton a toast, overflow menu, dropdown item, modal, or loader; elements *inside* a modal may have skeletons, the modal itself may not.

**Loading indicators** signal that something is processing without indicating progress. Use a progress indicator instead if it will take more than a moment. Full-screen with overlay when the whole application is blocked; inline when one component is.

**Progressive loading** for slow or multi-source views: structure and text first, then images, off-viewport content and interactive components. Not everything needs a skeleton — a 600×600 image can simply be 600×600 of white space.

**Load more** in place of infinite scroll where batching helps.

Screen readers must be told when the application is loading, busy, stuck, or has failed.

## Login

- **Don't reveal whether an account exists.** No error for an unknown user until after the password step, and one shared message for both wrong-user and wrong-password: "Incorrect IBMid or password. Try again."
- Progressive authentication is the IBM default: ask for the user ID, Continue, then route to SSO or password.
- Validate client-side on blur; server-side failures reload with the password cleared and an inline notification. Stack them if there are several.
- Keep related actions (create account, SSO) **inside the login region** — users don't look outside it.
- Don't place alternate login buttons between the username field and the primary button, or above the form. Keep the primary button closest to the input.
- With multiple alternate logins, use default (not fluid) inputs and buttons.
- Use landmark regions so screen readers can jump straight to the fields, especially in split-screen layouts.

## Overflow content

Truncation types: **front-line** (`...56789`, content continues from elsewhere), **mid-line** (`1234...5678...4321`, when strings share middles; requires JavaScript, no class), **end-line** (`12345...`, most common).

Good candidates: breadcrumbs, pagination, long URLs, description paragraphs, long generated names.

**Never truncate**: page headers, titles, labels, error messages, validation messages, notifications.

An ellipsis should stand for three or more characters. Add `title` for the browser tooltip. An ellipsis used alone as a control needs an overflow menu on hover, not a tooltip. Classes: `.cds--text-truncate--front`, `.cds--text-truncate--end`.

Prefer a **Show more** button over scrolling, gradients or fades when there's a lot of overflow; "Load more" where performance matters.

## Fluid styles

Fluid components bleed to one or more container edges and never exist in isolation. Default components are the productive norm; fluid is the expressive alternative.

- Fluid inputs put the label *inside* the field. One height only: **64px**.
- Fluid buttons are 25%, 50% or 100% of the container and must hug an edge — never embedded mid-layout.
- Fluid components stack with **0px** between them, in condensed or narrow gutter mode, and need a 3:1 border between them.
- Fluid forms allow no space between inputs and suit only simple tasks; complex or multi-section forms use the default style.
- Don't use fluid in dense layouts, in hyper-productive moments like a complex form, or inside accordions where the edges collide with dividers.
- Fixed-width default buttons have 64px right and 16px left padding; fluid-width default buttons spanning grid columns are preferable to fixed-width ones in a layout.

## Text toolbar

Groups: actions (undo/redo, cut/copy/paste), formatting, paragraph, attachment, search, and the text area. Controls move progressively into an overflow menu as space shrinks.

Keyboard: Tab and Shift+Tab enter and leave the toolbar; **arrow keys move within it** (first entry lands on the first non-disabled control, later entries return to the last focused one); up/down navigate menus; Enter opens and closes. Use the `toolbar` ARIA role. Buttons that act on click get tooltips on hover *and* focus.
