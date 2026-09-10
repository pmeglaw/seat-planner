# UI shell and the global header pattern

The header is the most-seen surface in any IBM product, and the pattern is stricter than it looks because its value comes from being identical everywhere.

**Scope: products only.** The shell is the chrome of a tool a user is signed into. It does not appear on marketing, landing, documentation-marketing or editorial pages — those are expressive surfaces and get a light masthead in the page's own type (wordmark, a few text links, one CTA on the page's grid). Reaching for the shell on a landing page is the productive/expressive mix-up in its most visible form.

## The organising axis

**Left to right runs product → global.** The left side holds what's relevant inside this product. The middle holds system-level controls. The far right holds the most global thing there is — the switcher, which spans products.

Cross that with persistence:

| | Definition |
|---|---|
| **Global** | Present everywhere in the UI, consistent from one context to another: navigation, authentication, notifications, account. |
| **Local** | Exists inside one product's context, and differs between products: the tasks the product exists to do. |

And with task scope: **system** tasks navigate the platform and manage things that apply to everything; **product** tasks are the product's core function. The 2×2 of persistence and scope tells you where anything belongs.

## Deciding the configuration

- **Header only** — a small number of main sections, no secondary navigation. More horizontal room for content; no room for sub-menus that need to stay open.
- **Header + left panel** — more navigation items, an extra level of hierarchy, and sub-menus that stay open without covering content. Use the left panel when there are more than five secondary items or users switch between them frequently.
- **Right panel** — system-level actions or content anchored to a header icon.

Ask first whether the product is standalone or one tool in a platform. Standalone: no switcher, and the system half of the header shrinks to account and help. Platform: the system half becomes a contract every tool must match identically. If it's standalone today but might not be, build the two-tier structure and leave the system side nearly empty — retrofitting a global tier later changes the top 48px of every page at once.

## Header anatomy and geometry

Header height **48px**, full viewport width, fixed, persistent.

Left to right:
1. **Hamburger** (48×48) — only when there's a collapsible left panel.
2. **Header name** — the parent domain, brief. For IBM products it is always preceded by "IBM"; for anyone else, that maps to the organization name. Links only to the domain home.
3. **Header links** — product navigation. Never open a new tab or leave the domain. Collapse into the left panel at narrow widths.
4. **Sub-menus** — down chevron, open on click, chevron points up when open. Close by selecting an item, clicking the label again, or clicking outside. **A sub-menu label opens the menu and nothing else — it can never also be a link.**
5. **Utilities** — universal system functions. Icon buttons, 48×48, **flush right with no gaps between them**. They open panels rather than navigating directly.

Utility order is fixed so icons don't move as users cross between products:

| Position | Icon |
|---|---|
| Leftmost of the group | Search — first so an expanding field doesn't displace anything |
| Middle | Product-specific icons |
| 4th from right | Help |
| 3rd from right | Notifications |
| 2nd from right | Account |
| Rightmost | Switcher — always last, never anything to its right |

Type: product name `heading-compact-01` (14/600); company prefix, links and sub-menus `body-compact-01` (14/400).

## Left panel

Width **256px** expanded, **48px** as an icon rail; positioned below the header, fixed left. Nav items 32px (48px for the large variant), link padding 0 16px, nested items indent to 32px (72px when the parent has an icon). Icons 16px with 24px margin-end. Dividers 1px with 8px/16px margins. Expand/collapse transition 110ms on the productive exit curve; the overlay uses 300ms `cubic-bezier(.5,0,.1,1)`.

Sub-menus expand in place and push items down; the same click collapses them. **The left panel does not support three tiers** — if there's more content below a sub-menu, use tabs in the page.

**Never put unbounded content in the side navigation.** User-generated lists have no upper limit and usability collapses; use a drill-down instead.

At narrow widths the header links move into the left panel *above* the existing items, pushing them down.

## Right panel

Invoked by a right-side header icon and anchored to it. Consistent width, full viewport height, flush right, **floats over page content**. Multiple right panels may exist but only one may be open at a time. When open, the triggering icon is outlined with its bottom border flowing into the panel. Dismiss by selecting an item or clicking the icon again. **Right panel items have no selected state**, even when the user is currently inside one.

The switcher lives in a right panel. Switcher items are anything that changes which product occupies the shell; dividers group related items and should not separate every one.

## Sense of place

The header's job goes beyond linking. It is where users look to orient — and that covers **state as well as location**: which account they're using, whether they're logged in, and **whether they've entered a different mode**. If a product has a draft/published split, a sandbox, an impersonation session, or a non-production environment, the header is where that belongs, persistently, on every screen.

## Persistent state is your job

The pattern says to keep or restore page state so users can pivot without losing progress, and it says plainly that **this is not part of the component and must be added during implementation**. The recommended technique is to track essential state in the URL and return the user there automatically. If state will be lost, say so before it is.

Practically: encode view, filters, selection and mode in the URL so a reload or a shared link lands in the same place.

## Drill-down and breadcrumbs

A drill-down can be triggered from any interactive element and opens a page focused purely on the selected object, with a breadcrumb of the path back to the root above the title. Breadcrumbs let users see where they are and climb back up.

## Organizing navigation

Structure by the tasks users need to do, not by the org chart or acquisition history. Schemes and their costs:

| Scheme | Good for | Cost |
|---|---|---|
| Most recent | Returning to the last object used | Loses logical grouping; better as a secondary view |
| Customized | Personal efficiency | Inconsistent between users |
| Audience / role | Surfacing role-relevant tasks | Hurts discovery when tasks overlap roles |
| Alphabetical | Users who know the exact label | Fails on synonyms — "pop-up, modal, lightbox, dialogue" |

**Related products should share navigation structures.** The research term is *transitional volatility*: every inconsistency between screens costs re-orientation, and users experience an inconsistent platform as slower even when it isn't. Consistency here is a performance argument, not an aesthetic one.

## Accessibility

- **Skip to main content** as the first focusable element on the page (WCAG 2.4.1).
- Landmark regions for each area — navigation, main, banner, search, form — with unique labels when there's more than one of a kind.
- Match DOM order to visual order (technique C27). Where CSS reorders for narrow screens, be deliberate about it.
- Heading levels must match their visual ranking so screen-reader users can navigate by structure.
- Header target areas span the full 48px height.
