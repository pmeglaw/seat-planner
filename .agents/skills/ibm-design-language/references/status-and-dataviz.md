# Status indicators and data visualization

## Status indicators

Four variants. Pick by space and by how much attention the information deserves.

| Variant | Use when | Typically found in |
|---|---|---|
| **Icon indicator** | Ample space and the content needs maximum attention. Requires icon, shape, meaningful color, and a descriptive inline label. | Notifications, progress indicators, data tables, task lists, dashboard widgets |
| **Shape indicator** | Small spaces, or scanning large amounts of data. Shape + color + label, no symbol. | Lists, dashboards, tables, data viz, network diagrams |
| **Badge with number** | A count of new items matters. Max three digits, last character becomes "+". **Only on the 48px large icon button in the UI shell header.** | Notification panes |
| **Badge without number** | Something is new but the count is unknown or irrelevant. More discreet. | Header icons, toolbar icon buttons |
| **Differential indicator** | Tracking deltas in dense statistics, where anything more would be obtrusive. Needs a "+"/"−", caret, or arrow. Color optional. | Financial dashboards, data viz |

**Icon indicators reflect system health** — did the thing succeed or fail. **Shape indicators are a secondary set** whose meaning the product defines: priority, lifecycle phase, activation. They don't necessarily imply urgency.

### The rules that bite

- **Two of color, shape, symbol at minimum, in the mark itself.** The label is a third element for WCAG, not a substitute for the second: a legend of same-shaped dots in different colors fails even with perfect labels, because the marks are indistinguishable in grayscale and in a table cell scanned at speed. Color alone never carries meaning.
- **3:1 contrast** between status colors and against the background — the *hovered* background (`layer-hover-01`, #e8e8e8 in light themes), not white. Verify with `scripts/check_contrast.py --preset status-light status-dark` and **name the script and paste its summary line in your answer**; a table of ratios with no script named reads as unverified. It should still be distinguishable in grayscale.
- **Every shape indicator gets its own shape AND a 1px outline** (filled circle, hollow ring, triangle, square, dashed ring — one per state, plus the outline stroke). The outline is what keeps light yellows and oranges legible on light themes; the distinct shape is what keeps the set legible in grayscale. Icon indicators need neither, because the symbol already carries both contrast and identity. Don't mix: a legend is all shape indicators (shape + outline) or all icon indicators.
- **More than five or six indicators on screen overwhelms.** Treat five as the budget.
- **Never use the same shape in different colors within one experience.** If the brief asks for "a dot per state", that is the brief asking for a color-only palette — give each state its own shape (filled circle, hollow ring, triangle, square, dashed ring) or a symbol inside a constant shape. If a spatial map genuinely forces a constant shape (every seat is a square), compensate with a distinct symbol or texture per state and say so explicitly. Do not present the shapes as optional or the label as making them redundant.
- When several statuses roll up into one, **the group takes the highest-attention color of its members** — green, yellow and red underneath means red on top.
- Place indicators before labels; left-align icons with text when stacked so the column scans. Don't let variable label lengths push icons out of alignment.
- Don't use a status indicator where no action is needed and the information isn't significant — plain text is better than visual noise.
- All status icons should come from the approved icon library, not be invented locally.

### The status palette

| Color | Meaning |
|---|---|
| Red 60 `#da1e28` | Danger, error |
| Orange 40 `#ff832b` (outline Orange 60 `#ba4e00`) | Serious warning |
| Yellow 30 `#f1c21b` (outline Yellow 60 `#8e6a00`) | Warning |
| Green 50 `#24a148` | Normal, success |
| Blue 70 `#0043ce` | Passive notification, information, in progress |
| Purple 60 `#8a3ffc` | Outlier, undefined status |
| Gray 60 `#6f6f6f` | **Draft, not started** — use the palette grade, not `$icon-secondary` (gray 70) or `$text-helper`; those are text/icon tokens, not the status colour |

Gray-for-draft and purple-for-undefined are easy to miss and solve real problems — a draft/published product already has its color decided.

The extended yellow and orange ramps exist purely so those hues can reach accessible contrast. They are **not part of the IBM brand palette** and are reserved for data visualization and status indicators. Don't use them in layout.

### Sizing

| Variant | Icon | Type |
|---|---|---|
| Icon indicator | 20px | 16pt |
| Icon indicator | 16px | 14pt |
| Shape indicator | 16px | 14pt or 12pt |

Severity tiers are for the product to define: **high attention** when immediate action is required (alerts, exceptions, errors); **medium** when no immediate action is needed or it's feedback on an action; **low** when something is ready to view or has changed.

---

## Data visualization

Five criteria: **understandable** at a glance, **essential** (the model that best conveys the message, nothing gratuitous), **impactful** through real interaction, **consistent** so visual quantity always matches numerical quantity, **contextual** to the audience and its constraints.

Craft:
- Titles state the insight the data reveals, not the subject.
- Put labels directly on the chart wherever they can replace a legend.
- Tune grid and tick density down until it stops competing with the data.
- Grays keep data points visible without pulling focus; reserve color for the metric carrying the story. Absence of color is information too.
- Categorical palettes maximize distinction between unrelated series; sequential and diverging palettes express relationship and quantity.
- Where color can't be used, patterns, markers, line weights and element density carry the information instead.
- Interaction: overview first, zoom and filter, then details on demand. Never hide something important behind an interaction.
- Motion should make change explicit — entrance and exit that reinforce hierarchy and axis orientation. Never let a transition imply a relationship that isn't there.
- Charts in the same product should be designed as a set that works together, not independently.

### Categorical palettes

**Light themes** (white, g10), 14-color order:
`#6929c4` `#1192e8` `#005d5d` `#9f1853` `#fa4d56` `#520408` `#198038` `#002d9c` `#ee5396` `#b28600` `#009d9a` `#012749` `#8a3800` `#a56eff`

**Dark themes** (g90, g100) — genuinely different, not the same list re-shaded:
`#8a3ffc` `#33b1ff` `#007d79` `#ff7eb6` `#fa4d56` `#fff1f1` `#6fdc8c` `#4589ff` `#d02670` `#d2a106` `#08bdba` `#bae6ff` `#ba4e00` `#d4bbff`

Smaller palettes exist for 1–5 series and are not simply the first N of the 14; when you have five or fewer series use the dedicated set. Light-theme examples: 2-color `#6929c4` + `#009d9a`; 3-color `#ee5396` `#1192e8` `#6929c4`; 5-color `#6929c4` `#1192e8` `#005d5d` `#9f1853` `#520408`.

**Sequential** palettes run one family across 11 stops from white through grade 100 (purple, blue, cyan and teal ramps are provided); dark themes reverse the direction.

**Diverging** palettes use 17 stops with white at the centre — red↔cyan and purple↔teal.

Hover for any chart color is that color darkened by 7% lightness.

### Technical diagrams

Nodes come in three sizes — bullet, small (always with an icon), large (with or without). All built on an **8px grid**, default height **48px**, 1px outline, 24px icons, 8px corner radius, 8px text margins for bullet and small nodes and 16px for large. Connectors default to orthogonal routing with straight or rounded elbows.

Type: node primary label 14/18 semibold, secondary 14/18 regular, connector label 12/16, badge 12/16. Left-align except bullet and small nodes with type underneath, which center.

Color: light theme canvas white, primary colors grades 50–80 or black, secondary white or grade 10, text always black. Dark theme canvas gray 100, primary grades 30–50 or white, secondary gray 100 or grade 90, text always white. Primary colors are for outlines, side bars, blocks and connectors; secondary only for fills. Never rely on color alone — pair with labels, line styles or icons, and always include a legend.

Artboards: 1584, 1312 or 1080px wide, in 16:9, 4:3, 2:1 or 1:1.
