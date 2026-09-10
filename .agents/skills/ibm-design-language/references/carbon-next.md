# Carbon Next (v12) — direction, and what's actually shipping

## What IBM published

v12 is presented as a statement of direction, not a spec. The argument: interfaces are splitting into two kinds — generated on demand and reshaping to context on one side, stable and predictable on the other — and the system has to serve both. The design goal is **progressive disclosure by default**: reveal depth in sequence, surface the right action at the right time, and let hierarchy, contrast and motion work together so people spend less time orienting.

The whole release is anchored to one word — **guide** — which is the same verb the IBM Design Language has used for its ethos since the Noyes era. The reframing is why it matters now: in a generative system, to guide is no longer to arrange pre-built paths but to shape and constrain what can happen at all. Secondary actions and necessary complexity still exist; they must never be mistaken for the signal.

Six declared shifts:

| Shift | What it means |
|---|---|
| Visual expression | A new expression built on complexity waiting until it's useful |
| Motion | Promoted from micro-interaction polish to a structural instrument — showing where you are and connecting it to what comes next |
| Layouts | Ready-made modular blocks and compositions so teams and agents start with correct structure |
| AI readiness | The system indexed and queryable by coding agents, with encoded instructions, agent skills and guardrails |
| Tokens & theming | Industry-standard naming — in practice the DTCG spec and a `.tokens.json` format |
| Product-centered components | Carbon for IBM Products (21 components, 24 complex patterns) opening to the community |

## Declared versus shipped

The Carbon Next page carries no numbers, no dates and no visual specimens. **Nothing on it changes a value in this skill today.**

| Thing | Status |
|---|---|
| v12 | Preview. Begin-active, maintenance and end-of-life all TBD. |
| v11 | Active since 2022-03-31, no announced move to maintenance. |
| Adoption | Incremental opt-in through the active release via `enable-v12-*` feature flags. |
| Token rename | DTCG adoption in progress, explicitly committed to backward compatibility and zero consumer impact. |
| Carbon for AI | **Already stable in v11** — AI label, AI token suite, AI chat, AI variants of 12 core components. |
| Carbon MCP | Public preview. Serves docs, code examples, charts and Labs to coding agents. |

## The v12 flags that exist right now

All default to off. This is how v12 actually arrives — not as a migration weekend.

| Flag | Turns on |
|---|---|
| `enable-v12-release` | The v12 feature set as a whole |
| `enable-v12-overflowmenu` | OverflowMenu rebuilt on Menu subcomponents |
| `enable-v12-dynamic-floating-styles` | Dynamic placement for Popover, Tooltip and similar |
| `enable-v12-tile-default-icons` | Default icons in Tile |
| `enable-v12-tile-radio-icons` | Radio icons in RadioTile |
| `enable-v12-structured-list-visible-icons` | Visible selection icons in StructuredList |
| `enable-v12-toggle-reduced-label-spacing` | Tighter toggle/label gap |
| `enable-tile-contrast` | Improved tile contrast |
| `enable-dialog-element` | Native `<dialog>` under modal components |
| `enable-presence` | Components unmounted while closed, mounted on open |
| `enable-focus-wrap-without-sentinels` | Focus wrapping without sentinel nodes |

Read them together: nearly every one adds a **visible affordance** where v11 relied on color or position alone. Progressive disclosure and accessibility arriving component by component, well ahead of any new expression.

## Building v12-aware today

Four things worth doing now rather than later:

1. **Keep a semantic token layer.** Product meaning points at system tokens; product code never touches a Carbon token directly. When the DTCG rename lands, one file changes.
2. **Don't hand-build what's about to be given away** — data grids, side panels, tearsheets, page headers are in the Carbon for IBM Products set.
3. **Treat motion as structure.** A move between levels should read as one continuous transition that tells you where you went, not several independent fades.
4. **If the product has an AI surface**, use Carbon for AI — the AI label, the explainability popover, and the AI token set — rather than a bespoke "magic" treatment.

## Carbon for AI (stable now)

The framework for identifying AI-generated content and delivering explainability. Uses light as a metaphor — brightness, glow, gradients — to make AI-generated or AI-recommended content distinctive.

- **Use the AI label wherever AI generates content.** It's both the marker and the entry point to explainability.
- The explainability popover attached to the label is the first layer: a short, in-context explanation, with the option to go deeper.
- AI tokens ship inside the main Carbon themes — no separate theme or package. Components have the AI styling available via a mixin; in Figma it's a variable mode.
- Components with AI variants: checkbox, data table, date picker, dropdown, form, modal, number input, radio button, select, tag, text input, tile. When the AI label is on, the component takes the AI style but behaves normally.
- If a user overrides AI-suggested content, the component reverts to the default variant — and should offer a way back to the AI version.
- **Never use AI styling as decoration.** It exists to mark AI presence, and diluting it destroys the signal.
- Light spread is deliberately limited so glows never compromise contrast.

## The caution

Build v11 properly and opt into flags as they prove out. Designing against an undated roadmap is how products end up half-migrated to something that never shipped.
